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

  it('is defensive about missing fields', () => {
    const r = parseWhisperJson({});
    expect(r.language).toBe('');
    expect(r.text).toBe('');
    expect(r.segments).toEqual([]);
  });
});
