import type { SttResult, SttSegment, SttMode } from '../../../shared/types.js';
import { spawn } from 'child_process';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { whisperBinPath, whisperModelPath } from '../config.js';

interface WhisperSeg { offsets?: { from?: number; to?: number }; text?: string }
interface WhisperJson { result?: { language?: string }; transcription?: WhisperSeg[] }

/** Parse whisper.cpp JSON into the language/text/segments fields of an SttResult. */
export function parseWhisperJson(raw: WhisperJson): Omit<SttResult, 'mode' | 'languageProb'> {
  const language = raw.result?.language ?? '';
  const segments: SttSegment[] = (raw.transcription ?? []).map((s) => ({
    start: (s.offsets?.from ?? 0) / 1000,
    end: (s.offsets?.to ?? 0) / 1000,
    text: (s.text ?? '').trim(),
  }));
  const text = segments.map((s) => s.text).join(' ').trim();
  return { language, text, segments };
}

/** Minimum whisper language-detection probability to treat output as a confident
 *  real-language transcription rather than a phonetic guess. Empirically, language-detection
 *  probability separates real speech (~0.85+) from non-language/gibberish audio (~0.5),
 *  whereas per-token probability does NOT (whisper hallucinates confidently). Tunable
 *  default; see spec §6. */
export const MIN_LANGUAGE_PROB = 0.6;

/** Max wall-clock for a single whisper run before it is killed. Overridable via WHISPER_TIMEOUT_MS. */
const WHISPER_TIMEOUT_MS = Number(process.env.WHISPER_TIMEOUT_MS) || 120_000;

/** Decide whether whisper output is a confident real-language transcription or a phonetic guess.
 *  Gates on a non-empty transcript (text or segments), the language-detection probability, and —
 *  when the caller explicitly asserted the language — treats it as a real transcription. */
export function computeMode(input: {
  languageProb: number;
  segments: SttSegment[];
  text?: string;
  explicitLanguage?: boolean;
}): SttMode {
  const text = input.text ?? input.segments.map((s) => s.text).join(' ').trim();
  if (input.segments.length === 0 || !text) return 'phonetic-guess';
  if (input.explicitLanguage) return 'transcription';
  return input.languageProb >= MIN_LANGUAGE_PROB ? 'transcription' : 'phonetic-guess';
}

/** Thrown when whisper.cpp is unavailable (missing binary); the route maps this to HTTP 503.
 *  A whisper *crash* (non-zero exit / no output / timeout) is a plain Error → HTTP 500 instead. */
export class SttUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'SttUnavailableError'; }
}

export interface SttInput { wav: Buffer; language?: string }

/** Best-effort parse of "auto-detected language: en (p = 0.98)" from whisper stderr. */
function parseLanguageProb(stderr: string): number {
  const m = stderr.match(/auto-detected language:\s*\w+\s*\(p\s*=\s*([0-9.]+)\)/i);
  return m ? Number(m[1]) : 0;
}

/** Transcribe 16 kHz mono WAV bytes via the bundled whisper.cpp. */
export async function transcribe(input: SttInput): Promise<SttResult> {
  const bin = whisperBinPath();
  const model = whisperModelPath();
  if (!bin || !model) throw new SttUnavailableError('whisper not configured');

  const dir = await mkdtemp(path.join(os.tmpdir(), 'xeno-stt-'));
  const inPath = path.join(dir, 'in.wav');
  const outBase = path.join(dir, 'out');
  await writeFile(inPath, input.wav);

  try {
    const stderr = await new Promise<string>((resolve, reject) => {
      // -oj writes <outBase>.json; -l auto enables language detection (default is English).
      const args = ['-m', model, '-f', inPath, '-oj', '-of', outBase, '-l', input.language ?? 'auto'];
      const proc = spawn(bin, args, { cwd: path.dirname(bin) });
      let err = '';
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; proc.kill('SIGKILL'); }, WHISPER_TIMEOUT_MS);
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('error', (e: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(new SttUnavailableError(`whisper spawn error: ${e.code ?? e.message}`));
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) reject(new Error('whisper timed out'));
        else if (code === 0) resolve(err);
        else reject(new Error(`whisper exited ${code}`));
      });
    });

    let raw: WhisperJson;
    try { raw = JSON.parse(await readFile(`${outBase}.json`, 'utf8')); }
    catch { throw new Error('whisper produced no JSON output'); }

    const parsed = parseWhisperJson(raw);
    const languageProb = parseLanguageProb(stderr);
    const explicitLanguage = !!input.language && input.language !== 'auto';
    return {
      ...parsed,
      // An explicitly-requested language means detection is skipped (prob stays 0); report full
      // confidence so the mode/badge aren't contradictory.
      languageProb: explicitLanguage ? 1 : languageProb,
      mode: computeMode({ languageProb, segments: parsed.segments, text: parsed.text, explicitLanguage }),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
