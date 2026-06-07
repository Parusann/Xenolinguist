import { describe, it, expect } from 'vitest';
import { parseWhisperJson } from '../services/stt-whisper.js';

const FIXTURE = {
  result: { language: 'en' },
  transcription: [
    { offsets: { from: 0, to: 1200 }, text: ' Hello', tokens: [{ p: 0.9 }, { p: 0.7 }] },
    { offsets: { from: 1200, to: 2000 }, text: ' world', tokens: [{ p: 0.8 }] },
  ],
};

describe('parseWhisperJson', () => {
  it('maps language, joined text, and segment timestamps/probabilities', () => {
    const r = parseWhisperJson(FIXTURE);
    expect(r.language).toBe('en');
    expect(r.text).toBe('Hello world');
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0]).toMatchObject({ start: 0, end: 1.2, text: 'Hello' });
    expect(r.segments[0].avgProb).toBeCloseTo(0.8, 5);
    expect(r.segments[1]).toMatchObject({ start: 1.2, end: 2, text: 'world', avgProb: 0.8 });
  });

  it('is defensive about missing fields', () => {
    const r = parseWhisperJson({});
    expect(r.language).toBe('');
    expect(r.text).toBe('');
    expect(r.segments).toEqual([]);
  });
});
