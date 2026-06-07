import type { SttResult, SttSegment, SttMode } from '../../../shared/types.js';

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
