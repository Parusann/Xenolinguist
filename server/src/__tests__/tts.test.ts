import { describe, it, expect, afterEach } from 'vitest';

afterEach(() => { delete process.env.ESPEAK_PATH; });

describe('tts-espeak.synthesize', () => {
  it('rejects with TtsUnavailableError when espeak is not configured', async () => {
    delete process.env.ESPEAK_PATH;
    const { synthesize, TtsUnavailableError } = await import('../services/tts-espeak.js?t=1');
    await expect(synthesize({ text: 'hello' })).rejects.toBeInstanceOf(TtsUnavailableError);
  });

  // Real synthesis only runs when an espeak-ng binary is wired up (skipped in CI otherwise).
  const hasEspeak = !!process.env.ESPEAK_PATH;
  (hasEspeak ? it : it.skip)('produces non-empty WAV bytes when espeak is available', async () => {
    const { synthesize } = await import('../services/tts-espeak.js?t=2');
    const wav = await synthesize({ text: 'hello' });
    expect(wav.length).toBeGreaterThan(44); // WAV header is 44 bytes
  });
});
