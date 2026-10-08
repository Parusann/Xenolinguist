import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { verifyWhisperAssets } from '../services/whisper-assets.js';

vi.mock('../../../vendor/model-manifest.json', async () => {
  const { createHash } = await import('node:crypto');
  return { default: { groups: [{ id: 'whisper', upstreamRevision: 'fixture', files:
    ['ggml-base-q5_1.bin', 'whisper-cli.exe', 'whisper.dll'].map(file => ({ file, bytes: 3,
      sha256: createHash('sha256').update('abc').digest('hex') })) }] } };
});
let directory: string;
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
async function prepare() {
  directory = await mkdtemp(path.join(os.tmpdir(), 'xeno-whisper-assets-'));
  for (const file of ['ggml-base-q5_1.bin', 'whisper-cli.exe', 'whisper.dll']) await writeFile(path.join(directory, file), 'abc');
  return [path.join(directory, 'whisper-cli.exe'), path.join(directory, 'ggml-base-q5_1.bin')] as const;
}
it('verifies every runtime asset and rejects same-size mutation on a later request', async () => {
  const args = await prepare();
  const identity = await verifyWhisperAssets(...args);
  expect(identity.modelSha256).toBe(createHash('sha256').update('abc').digest('hex'));
  expect(identity.runtimeFiles).toHaveLength(3);
  await writeFile(path.join(directory, 'whisper.dll'), 'xyz');
  await expect(verifyWhisperAssets(...args)).rejects.toThrow('checksum');
});
it('rejects missing model bytes and respects cancellation during verification', async () => {
  const args = await prepare();
  await writeFile(args[1], '');
  await expect(verifyWhisperAssets(...args)).rejects.toThrow('size');
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await expect(verifyWhisperAssets(...args, controller.signal)).rejects.toThrow('cancelled');
});
