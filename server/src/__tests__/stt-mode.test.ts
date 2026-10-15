import { describe, it, expect } from 'vitest';
import { computeMode } from '../services/stt-whisper.js';

describe('computeMode', () => {
  it('returns transcription when language-detection probability is high', () => {
    expect(computeMode({ languageProb: 0.88, segments: [{ start: 0, end: 1, text: 'hi' }] }))
      .toBe('transcription');
  });

  it('returns phonetic-guess when the language score is below the legacy threshold', () => {
    expect(computeMode({ languageProb: 0.5, segments: [{ start: 0, end: 1, text: 'xq' }] }))
      .toBe('phonetic-guess');
  });

  it('returns phonetic-guess when language probability is unreported', () => {
    expect(computeMode({ languageProb: null, segments: [{ start: 0, end: 1, text: 'hi' }] }))
      .toBe('phonetic-guess');
  });

  it('returns phonetic-guess when there are no segments', () => {
    expect(computeMode({ languageProb: 0.95, segments: [] })).toBe('phonetic-guess');
  });
});
