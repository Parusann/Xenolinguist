import { describe, it, expect, afterEach } from 'vitest';
import { decodeCtcPhones } from '../services/ipa-phones.js';

afterEach(() => { delete process.env.IPA_MODEL_DIR; });

describe('decodeCtcPhones', () => {
  const idToPhone = (id: number) => (['a', 'b', '<pad>'][id] ?? '');

  it('collapses repeats, drops blanks, and times phones by frame', () => {
    // 4 frames, vocab 3, pad id 2. argmax per frame: a, a, b, blank.
    const logits = new Float32Array([
      9, 0, 0, // f0 -> a
      9, 0, 0, // f1 -> a (collapsed with f0)
      0, 9, 0, // f2 -> b
      0, 0, 9, // f3 -> blank (dropped)
    ]);
    const r = decodeCtcPhones(logits, 4, 3, 2, idToPhone, 0.02);
    expect(r.ipa).toBe('a b');
    expect(r.segments).toEqual([
      { phone: 'a', start: 0, end: 0.04 },
      { phone: 'b', start: 0.04, end: 0.06 },
    ]);
  });

  it('returns empty when every frame is the blank id', () => {
    const logits = new Float32Array([0, 0, 9, 0, 0, 9]);
    const r = decodeCtcPhones(logits, 2, 3, 2, idToPhone, 0.02);
    expect(r.ipa).toBe('');
    expect(r.segments).toEqual([]);
  });
});

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
