import { describe, it, expect, vi, afterEach } from 'vitest';

// AudioContext is unavailable in jsdom — mock the WAV conversion.
vi.mock('../../components/audio/wav-encode', () => ({
  blobToWav16k: vi.fn(async () => new Blob([new Uint8Array(44)], { type: 'audio/wav' })),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('stt.transcribe', () => {
  it('returns null when /api/stt responds 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 } as Response)));
    const mod = await import('../stt.ts?case=1');
    const r = await mod.transcribe(new Blob(['x']));
    expect(r).toBeNull();
  });

  it('returns the parsed SttResult on 200', async () => {
    const payload = { language: 'en', languageProb: 0.9, text: 'hi', segments: [], mode: 'transcription' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => payload } as unknown as Response)));
    const mod = await import('../stt.ts?case=2');
    const r = await mod.transcribe(new Blob(['x']));
    expect(r).toEqual(payload);
  });
});
