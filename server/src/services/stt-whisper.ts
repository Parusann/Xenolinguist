import type { SttResult, SttSegment } from '../../../shared/types.js';

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
