import type { SttResult, SttSegment, SttMode } from '../../../shared/types.js';
import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { whisperBinPath, whisperModelPath } from '../config.js';

interface WhisperToken { p?: number }
interface WhisperSeg { offsets?: { from?: number; to?: number }; text?: string; tokens?: WhisperToken[] }
interface WhisperJson { result?: { language?: string }; transcription?: WhisperSeg[] }

/** Parse whisper.cpp JSON into the language/text/segments fields of an SttResult. */
export function parseWhisperJson(raw: WhisperJson): Omit<SttResult, 'mode' | 'languageProb'> {
  const language = raw.result?.language ?? '';
  const segs: SttSegment[] = (raw.transcription ?? []).map((s) => {
    const tokens = s.tokens ?? [];
    const probs = tokens.map((t) => t.p).filter((p): p is number => typeof p === 'number');
    const avgProb = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : 0;
    return {
      start: (s.offsets?.from ?? 0) / 1000,
      end: (s.offsets?.to ?? 0) / 1000,
      text: (s.text ?? '').trim(),
      avgProb,
    };
  });
  const text = segs.map((s) => s.text).join(' ').trim();
  return { language, text, segments: segs };
}

/** Tunable thresholds — ship sensible defaults, refine later (see spec §6). */
export const MIN_AVG_PROB = 0.6;      // mean token probability across segments
export const MIN_LANGUAGE_PROB = 0.5; // applied only when languageProb is known (>0)

/** Decide whether whisper output is a confident transcription or a phonetic guess. */
export function computeMode(input: { languageProb: number; segments: SttSegment[] }): SttMode {
  const { languageProb, segments } = input;
  if (segments.length === 0) return 'phonetic-guess';
  const avg = segments.reduce((a, s) => a + s.avgProb, 0) / segments.length;
  const languageOk = languageProb <= 0 ? true : languageProb >= MIN_LANGUAGE_PROB;
  return avg >= MIN_AVG_PROB && languageOk ? 'transcription' : 'phonetic-guess';
}

/** Thrown when whisper.cpp is unavailable; the route maps this to HTTP 503. */
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

  const dir = mkdtempSync(path.join(os.tmpdir(), 'xeno-stt-'));
  const inPath = path.join(dir, 'in.wav');
  const outBase = path.join(dir, 'out');
  writeFileSync(inPath, input.wav);

  try {
    const stderr = await new Promise<string>((resolve, reject) => {
      // -oj writes <outBase>.json; -l auto enables language detection (default is English).
      const args = ['-m', model, '-f', inPath, '-oj', '-of', outBase, '-l', input.language ?? 'auto'];
      const proc = spawn(bin, args, { cwd: path.dirname(bin) });
      let err = '';
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('error', (e: NodeJS.ErrnoException) =>
        reject(new SttUnavailableError(`whisper spawn error: ${e.code ?? e.message}`)));
      proc.on('close', (code) =>
        code === 0 ? resolve(err) : reject(new SttUnavailableError(`whisper exited ${code}`)));
    });

    let raw: WhisperJson;
    try { raw = JSON.parse(readFileSync(`${outBase}.json`, 'utf8')); }
    catch { throw new SttUnavailableError('whisper produced no JSON output'); }

    const parsed = parseWhisperJson(raw);
    const languageProb = parseLanguageProb(stderr);
    return { ...parsed, languageProb, mode: computeMode({ languageProb, segments: parsed.segments }) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
