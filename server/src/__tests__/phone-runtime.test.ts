import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { wavToFloat32, IpaBadInputError } from '../services/ipa-phones.js';
import { loadTransformers } from '../services/model-loader.js';
import { verifyPhoneAssets } from '../services/model-assets.js';

afterEach(() => { delete process.env.XENO_RUNTIME_ROOT; vi.restoreAllMocks(); });
function wav() {
  const b = Buffer.alloc(844); b.write('RIFF'); b.writeUInt32LE(836, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(800, 40); b.writeInt16LE(-32768, 44); b.writeInt16LE(32767, 46); return b;
}
describe('phone input contract', () => {
  it('decodes mono PCM16 with the correct signed range', () => { expect([...wavToFloat32(wav()).slice(0, 2)]).toEqual([-1, 32767 / 32768]); });
  it.each([
    ['format', 20, 3], ['channels', 22, 2], ['rate', 24, 44100], ['bits', 34, 32], ['alignment', 32, 4],
  ])('rejects unsupported %s before inference', (_name, offset, value) => {
    const b = wav(); b.writeUInt16LE(Number(value), Number(offset)); expect(() => wavToFloat32(b)).toThrow(IpaBadInputError);
  });
  it('rejects truncated chunks, an oversized declared data chunk, and non-WAVE RIFF', () => {
    const b = wav(); b.writeUInt32LE(0xffffffff, 40); expect(() => wavToFloat32(b)).toThrow(IpaBadInputError);
    expect(() => wavToFloat32(wav().subarray(0, 100))).toThrow(IpaBadInputError);
    const avi = wav(); avi.write('AVI ', 8); expect(() => wavToFloat32(avi)).toThrow(IpaBadInputError);
  });
});
describe('packaged runtime boundaries', () => {
  it('uses a package-supported require export from the explicit dependency root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-runtime-test-'));
    const pkg = path.join(root, 'node_modules/@huggingface/transformers'); await fs.mkdir(pkg, { recursive: true });
    await fs.writeFile(path.join(pkg, 'package.json'), JSON.stringify({ exports: { node: { require: './supported.cjs' } } }));
    await fs.writeFile(path.join(pkg, 'supported.cjs'), 'module.exports = { env: { version: "fixture-export" } };');
    process.env.XENO_RUNTIME_ROOT = root;
    expect((await loadTransformers()).env.version).toBe('fixture-export');
  });
  it('does not fall back to checkout dependencies when the packaged root is empty', async () => {
    process.env.XENO_RUNTIME_ROOT = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-runtime-missing-'));
    await expect(async () => loadTransformers()).rejects.toMatchObject({ code: 'MODULE_NOT_FOUND' });
  });
  it('distinguishes absent model files from changed model bytes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-model-test-'));
    await expect(verifyPhoneAssets(root)).rejects.toMatchObject({ code: 'IPA_MODEL_MISSING' });
    await fs.mkdir(path.join(root, 'wav2vec2-phoneme'));
    await fs.writeFile(path.join(root, 'wav2vec2-phoneme/config.json'), '{}');
    await expect(verifyPhoneAssets(root)).rejects.toMatchObject({ code: 'IPA_MODEL_INVALID' });
  });
});
