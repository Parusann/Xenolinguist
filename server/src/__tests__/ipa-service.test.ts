import { describe, it, expect, afterEach } from 'vitest';

afterEach(() => { delete process.env.IPA_MODEL_DIR; });

describe('ipa-phones.transcribePhones', () => {
  it('rejects with IpaUnavailableError when the model dir is not configured', async () => {
    delete process.env.IPA_MODEL_DIR;
    const { transcribePhones, IpaUnavailableError } = await import('../services/ipa-phones.js?t=1');
    await expect(transcribePhones({ wav: Buffer.from([0, 1, 2]) })).rejects.toBeInstanceOf(IpaUnavailableError);
  });

  // Real inference only runs with IPA_E2E + a vendored model (vitest can't reliably host the
  // ONNX runtime on Windows; verify with `node scripts/verify-ipa.mjs`).
  const ready = process.env.IPA_MODEL_DIR && process.env.IPA_E2E;
  (ready ? it : it.skip)('produces a phonetic string for the fixture', async () => {
    const { readFileSync } = await import('fs');
    const path = (await import('path')).default;
    const { transcribePhones } = await import('../services/ipa-phones.js?t=2');
    const wav = readFileSync(path.join(__dirname, 'fixtures', 'hello-16k.wav'));
    const r = await transcribePhones({ wav });
    expect(typeof r.ipa).toBe('string');
    expect(r.ipa.length).toBeGreaterThan(0);
  });
});
