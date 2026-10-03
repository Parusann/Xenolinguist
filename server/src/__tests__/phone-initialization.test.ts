import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inspectPhoneWav } from '../services/ipa-phones.js';
const loader = vi.hoisted(() => vi.fn());
const assets = vi.hoisted(() => vi.fn(async () => 'a'.repeat(64)));
vi.mock('../services/model-loader.js', () => ({ loadTransformers: loader }));
vi.mock('../services/model-assets.js', () => ({ verifyPhoneAssets: assets }));
const wav = readFileSync(path.join(__dirname, 'fixtures/hello-16k.wav'));
function runtime(override?: { dims: number[]; data: Float32Array }) {
  const frames = Math.floor((inspectPhoneWav(wav).sampleCount - 400) / 320) + 1;
  return { env: { version: 'fixture' },
    AutoProcessor: { from_pretrained: vi.fn(async () => async () => ({})) },
    AutoTokenizer: { from_pretrained: vi.fn(async () => ({ pad_token_id: 0, decode: () => 'ah' })) },
    AutoModelForCTC: { from_pretrained: vi.fn(async () => async () => ({ logits: override ?? { dims: [1, frames, 2], data: Float32Array.from({ length: frames * 2 }, (_, i) => i % 2) } })) } };
}
beforeEach(() => { vi.resetModules(); loader.mockReset(); assets.mockClear(); process.env.IPA_MODEL_DIR = 'fixture'; });
afterEach(() => { delete process.env.IPA_MODEL_DIR; });
describe('phone model initialization', () => {
  it.each(['batch', 'geometry', 'nonfinite'])('rejects invalid %s model output as an inference failure', async kind => {
    const frames = Math.floor((inspectPhoneWav(wav).sampleCount - 400) / 320) + 1;
    loader.mockResolvedValue(runtime({ dims: kind === 'batch' ? [2, frames, 2] : kind === 'geometry' ? [1, 1, 2] : [1, frames, 2], data: new Float32Array(frames * 2).fill(NaN) }));
    const { transcribePhones } = await import('../services/ipa-phones.js');
    await expect(transcribePhones({ wav })).rejects.toMatchObject({ code: 'IPA_INFERENCE_FAILED' });
  });
  it('coalesces simultaneous initialization and returns explicit output provenance', async () => {
    const tf = runtime(); loader.mockResolvedValue(tf);
    const { transcribePhones } = await import('../services/ipa-phones.js');
    const results = await Promise.all([transcribePhones({ wav }), transcribePhones({ wav })]);
    expect(loader).toHaveBeenCalledTimes(1); expect(assets).toHaveBeenCalledTimes(1);
    expect(tf.AutoModelForCTC.from_pretrained).toHaveBeenCalledTimes(1);
    expect(results[0].audio?.sha256).toBe(createHash('sha256').update(wav).digest('hex'));
    expect(results[0].ctc?.runs[0]).toMatchObject({ startFrame: 0, tokenId: 1 });
    expect(results[0]).toMatchObject({ ipa: 'ah', identity: { alphabet: 'TIMIT ARPABET', modelSha256: 'a'.repeat(64) } });
  });
  it('retries a failed initialization rather than caching the rejection', async () => {
    loader.mockRejectedValueOnce(Object.assign(new Error('missing dependency'), { code: 'MODULE_NOT_FOUND' })).mockResolvedValue(runtime());
    const { transcribePhones } = await import('../services/ipa-phones.js');
    await expect(transcribePhones({ wav })).rejects.toMatchObject({ code: 'IPA_PACKAGE_MISSING' });
    expect((await transcribePhones({ wav })).ipa).toBe('ah'); expect(loader).toHaveBeenCalledTimes(2);
  });
  it('classifies native load failure separately from package resolution', async () => {
    loader.mockRejectedValue(Object.assign(new Error('native library load failed'), { code: 'ERR_DLOPEN_FAILED' }));
    const { transcribePhones } = await import('../services/ipa-phones.js');
    await expect(transcribePhones({ wav })).rejects.toMatchObject({ code: 'IPA_NATIVE_LOAD_FAILED' });
  });
});
