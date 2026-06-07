import { describe, it, expect } from 'vitest';
import { computeMode } from '../services/stt-whisper.js';

describe('computeMode', () => {
  it('returns transcription for high-confidence, language-detected audio', () => {
    expect(computeMode({ languageProb: 0.95, segments: [{ start: 0, end: 1, text: 'hi', avgProb: 0.85 }] }))
      .toBe('transcription');
  });

  it('returns phonetic-guess for low average token probability', () => {
    expect(computeMode({ languageProb: 0.95, segments: [{ start: 0, end: 1, text: 'xq', avgProb: 0.3 }] }))
      .toBe('phonetic-guess');
  });

  it('returns phonetic-guess for low language probability', () => {
    expect(computeMode({ languageProb: 0.2, segments: [{ start: 0, end: 1, text: 'hi', avgProb: 0.85 }] }))
      .toBe('phonetic-guess');
  });

  it('treats unknown languageProb (0) as not disqualifying; relies on avgProb', () => {
    expect(computeMode({ languageProb: 0, segments: [{ start: 0, end: 1, text: 'hi', avgProb: 0.85 }] }))
      .toBe('transcription');
  });

  it('returns phonetic-guess when there are no segments', () => {
    expect(computeMode({ languageProb: 0.95, segments: [] })).toBe('phonetic-guess');
  });
});
