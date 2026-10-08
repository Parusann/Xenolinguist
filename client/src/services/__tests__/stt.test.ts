import { webcrypto, createHash } from 'node:crypto';
import { transcriptionFixture } from 'shared/testing/transcription';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// AudioContext is unavailable in jsdom — mock the WAV conversion.
vi.mock('../../components/audio/wav-encode', () => ({
  blobToWav16k: vi.fn(async () => new Blob([new Uint8Array(44)], { type: 'audio/wav' })),
}));

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('stt.transcribe', () => {
  it('returns null when /api/stt responds 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 } as Response)));
    const mod = await import('../stt.ts?case=1');
    const r = await mod.transcribe(new Blob(['x']));
    expect(r).toBeNull();
  });

  it('returns the parsed SttResult on 200', async () => {
    const payload = transcriptionFixture(createHash('sha256').update(new Uint8Array(44)).digest('hex'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => payload } as unknown as Response)));
    const mod = await import('../stt.ts?case=2');
    const r = await mod.transcribe(new Blob(['x']));
    expect(r).toEqual(payload);
  });
  it('rejects incomplete provenance, mismatched audio and invented explicit-language scores', async () => {
    const valid = transcriptionFixture(createHash('sha256').update(new Uint8Array(44)).digest('hex'));
    for (const payload of [{ text: 'unverified' }, { ...valid, audio: { ...valid.audio, sha256: 'f'.repeat(64) } },
      { ...valid, provenance: { ...valid.provenance, requestedLanguage: 'en', languageSelection: 'explicit' } }]) {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload })));
      const { transcribe } = await import('../stt');
      expect(await transcribe(new Blob(['x']))).toBeNull();
    }
  });

});
