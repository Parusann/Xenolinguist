import type { SttResult, SttSegment, SttMode } from '../../../shared/types.js';
import { spawn } from 'child_process';
import { mkdtemp, writeFile, readFile, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { whisperBinPath, whisperModelPath } from '../config.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { inspectAudioWav } from './audio-wav.js';
import { verifyWhisperAssets } from './whisper-assets.js';
import { transcriptionResultSchema } from '../../../shared/schemas/transcription.js';

const whisperJsonSchema = z.object({
  result: z.object({ language: z.string().regex(/^[a-z]{2,3}$/) }),
  transcription: z.array(z.object({ offsets: z.object({ from: z.number().int().nonnegative(), to: z.number().int().positive() }),
    text: z.string().max(20_000) })).max(6000),
});

/** Reject corrupt native output instead of manufacturing missing timestamps or text. */
export function parseWhisperJson(raw: unknown): Pick<SttResult, 'language' | 'text' | 'segments'> {
  const checked = whisperJsonSchema.parse(raw);
  let previous = 0;
  const segments: SttSegment[] = [];
  for (const s of checked.transcription) {
    if (s.offsets.from < previous || s.offsets.to <= s.offsets.from || s.offsets.to > 120_000) throw new Error('Invalid Whisper timestamps');
    previous = s.offsets.to;
    const text = s.text.trim();
    if (text) segments.push({ start: s.offsets.from / 1000, end: s.offsets.to / 1000, text });
  }
  const text = segments.map(s => s.text).join(' ').trim();
  if (text.length > 200_000) throw new Error('Whisper transcript exceeds limit');
  return { language: checked.result.language, text, segments };
}

/** Legacy UI threshold only; neither a speech detector nor calibrated transcript confidence. */
export const MIN_LANGUAGE_PROB = 0.6;

/** Max wall-clock for a single whisper run before it is killed. Overridable via WHISPER_TIMEOUT_MS. */
const WHISPER_TIMEOUT_MS = Number(process.env.WHISPER_TIMEOUT_MS) || 120_000;

/** Preserve the legacy mode field for callers; it is a heuristic, not phonetic decoding or accuracy. */
export function computeMode(input: {
  languageProb: number | null;
  segments: SttSegment[];
  text?: string;
  explicitLanguage?: boolean;
}): SttMode {
  const text = input.text ?? input.segments.map((s) => s.text).join(' ').trim();
  if (input.segments.length === 0 || !text) return 'phonetic-guess';
  if (input.explicitLanguage) return 'transcription';
  return input.languageProb !== null && input.languageProb >= MIN_LANGUAGE_PROB ? 'transcription' : 'phonetic-guess';
}

/** Thrown when whisper.cpp is unavailable (missing binary); the route maps this to HTTP 503.
 *  A whisper *crash* (non-zero exit / no output / timeout) is a plain Error → HTTP 500 instead. */
export class SttUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'SttUnavailableError'; }
}

export interface SttInput { wav: Buffer; language?: string; signal?: AbortSignal }

/** Detection probability is absent for explicit language selection; absence is not zero. */
export function parseLanguageProb(stderr: string): number | null {
  const match = stderr.match(/auto-detected language:\s*\w+\s*\(p\s*=\s*([^)]*)\)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return match[1].trim() && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/** Transcribe 16 kHz mono WAV bytes via the bundled whisper.cpp. */
export async function transcribe(input: SttInput): Promise<SttResult> {
  input.signal?.throwIfAborted();
  const bin = whisperBinPath();
  const model = whisperModelPath();
  if (!bin || !model) throw new SttUnavailableError('whisper not configured');

  const geometry = inspectAudioWav(input.wav);
  if (input.language !== undefined && !/^(auto|[a-z]{2})$/.test(input.language)) throw new Error('Invalid language selection');
  let identity;
  try { identity = await verifyWhisperAssets(bin, model, input.signal); }
  catch {
    input.signal?.throwIfAborted();
    throw new SttUnavailableError('Whisper assets are missing or differ from the pinned manifest');
  }
  input.signal?.throwIfAborted();
  const requestedLanguage = input.language ?? 'auto';
  const dir = await mkdtemp(path.join(os.tmpdir(), 'xeno-stt-'));
  const inPath = path.join(dir, 'in.wav');
  const outBase = path.join(dir, 'out');
  try {
    await writeFile(inPath, input.wav);
    input.signal?.throwIfAborted();
    const stderr = await new Promise<string>((resolve, reject) => {
      // -oj writes <outBase>.json; -l auto enables language detection (default is English).
      const args = ['-m', model, '-f', inPath, '-oj', '-of', outBase, '-l', requestedLanguage, '-t', '2'];
      const proc = spawn(bin, args, { cwd: path.dirname(bin), windowsHide: true });
      const cancel = () => { proc.kill('SIGKILL'); };
      input.signal?.addEventListener('abort', cancel, { once: true });
      if (input.signal?.aborted) cancel();
      proc.stdout.resume();
      let err = '';
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; proc.kill('SIGKILL'); }, WHISPER_TIMEOUT_MS);
      proc.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-16384); });
      proc.on('error', (e: NodeJS.ErrnoException) => {
        input.signal?.removeEventListener('abort', cancel);
        clearTimeout(timer);
        reject(new SttUnavailableError(`whisper spawn error: ${e.code ?? e.message}`));
      });
      proc.on('close', (code) => {
        input.signal?.removeEventListener('abort', cancel);
        clearTimeout(timer);
        if (input.signal?.aborted) reject(input.signal.reason);
        else if (timedOut) reject(new Error('whisper timed out'));
        else if (code === 0) resolve(err);
        else reject(new Error(`whisper exited ${code}`));
      });
    });

    input.signal?.throwIfAborted();
    if ((await stat(`${outBase}.json`)).size > 2 * 1024 * 1024) throw new Error('Whisper JSON exceeds 2 MiB');
    let raw: unknown;
    try { raw = JSON.parse(await readFile(`${outBase}.json`, 'utf8')); }
    catch { throw new Error('whisper produced no JSON output'); }

    const parsed = parseWhisperJson(raw);
    const explicitLanguage = requestedLanguage !== 'auto';
    const languageProb = explicitLanguage ? null : parseLanguageProb(stderr);
    return transcriptionResultSchema.parse({
      ...parsed, languageProb,
      mode: computeMode({ languageProb, segments: parsed.segments, text: parsed.text, explicitLanguage }),
      audio: { sha256: createHash('sha256').update(input.wav).digest('hex'), sampleRate: 16000,
        sampleCount: geometry.sampleCount, durationSeconds: geometry.durationSeconds },
      provenance: { version: 1, engine: 'whisper.cpp', ...identity, node: process.versions.node,
        platform: process.platform, arch: process.arch, requestedLanguage, threads: 2,
        decoding: 'pinned-cli-defaults', timing: 'model-segments-not-word-alignment',
        languageSelection: explicitLanguage ? 'explicit' : languageProb === null ? 'unreported' : 'detected' },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
