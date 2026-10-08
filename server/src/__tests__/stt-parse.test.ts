import { describe, it, expect } from 'vitest';
import { parseWhisperJson } from '../services/stt-whisper.js';

const FIXTURE = {
  result: { language: 'en' },
  transcription: [
    { offsets: { from: 0, to: 1200 }, text: ' Hello' },
    { offsets: { from: 1200, to: 2000 }, text: ' world' },
  ],
};

describe('parseWhisperJson', () => {
  it('maps language, joined text, and segment timestamps', () => {
    const r = parseWhisperJson(FIXTURE);
    expect(r.language).toBe('en');
    expect(r.text).toBe('Hello world');
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0]).toEqual({ start: 0, end: 1.2, text: 'Hello' });
    expect(r.segments[1]).toEqual({ start: 1.2, end: 2, text: 'world' });
  });

  it('rejects missing and malformed native fields', () => {
    for (const raw of [{}, { ...FIXTURE, transcription: [{ text: 'missing offsets' }] },
      { ...FIXTURE, transcription: [{ offsets: { from: 200, to: 100 }, text: 'backwards' }] },
      { ...FIXTURE, transcription: [{ offsets: { from: 0, to: NaN }, text: 'invalid' }] }])
      expect(() => parseWhisperJson(raw)).toThrow();
  });
  it('accepts an empty transcript without inventing segments', () => {
    expect(parseWhisperJson({ result: { language: 'en' }, transcription: [] })).toEqual({ language: 'en', text: '', segments: [] });
  });
});
