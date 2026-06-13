import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../components/audio/wav-encode', () => ({
  blobToWav16k: vi.fn(async () => new Blob([new Uint8Array(44)], { type: 'audio/wav' })),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ipa.transcribePhones', () => {
  it('returns null when /api/ipa responds 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 } as Response)));
    const mod = await import('../ipa.ts?case=1');
    expect(await mod.transcribePhones(new Blob(['x']))).toBeNull();
  });

  it('returns the IPA string on 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ipa: 'h ə l oʊ' }) } as unknown as Response)));
    const mod = await import('../ipa.ts?case=2');
    expect(await mod.transcribePhones(new Blob(['x']))).toBe('h ə l oʊ');
  });
});
