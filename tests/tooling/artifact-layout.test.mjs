import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { recordArtifact, verifyArtifact, fingerprint, contained } from '../../scripts/verify-artifact-layout.mjs';

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'xeno-layout-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const app = path.join(base, 'app'), manifest = path.join(base, 'manifest.json');
  const put = async (file, data = 'fixture') => {
    const target = path.join(app, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, typeof data === 'string' ? data : JSON.stringify(data));
  };
  for (const file of ['Xenolinguist.exe', 'resources/app.asar', 'resources/app.asar.unpacked/electron/dist/server.cjs', 'resources/app.asar.unpacked/electron/dist/phone-process.cjs', 'resources/client/dist/index.html', 'resources/server-deps/runtime-anchor.cjs', 'resources/THIRD_PARTY.md']) await put(file);
  const groups = [];
  for (const [id, dir] of Object.entries({ phones: 'ipa-model', whisper: 'whisper', espeak: 'espeak-ng' })) {
    const file = 'resources/' + dir + '/asset.bin'; await put(file);
    groups.push({ id, files: [{ file: 'asset.bin', ...await fingerprint(path.join(app, file)) }] });
  }
  await put('resources/model-manifest.json', { schemaVersion: 1, platform: 'win32', arch: 'x64', groups });
  const packages = ['@huggingface/transformers', 'onnxruntime-node'].map(name => ({ name, version: '1.0.0', path: 'node_modules/' + name, integrity: 'sha512-fixture' }));
  for (const entry of packages) await put('resources/server-deps/' + entry.path + '/package.json', { name: entry.name, version: entry.version });
  await put('resources/server-deps/runtime-manifest.json', { lockSha256: 'test-lock', platform: 'win32', arch: 'x64', packages });
  await recordArtifact(app, manifest, { revision: 'test-revision' }, 'test-lock');
  return { app, manifest, put };
}
test('recorded application verifies and permits only the NSIS uninstaller addition', async t => {
  const { app, manifest, put } = await fixture(t);
  assert.equal((await verifyArtifact(app, manifest)).passed, true);
  await put('Uninstall Xenolinguist.exe');
  assert.deepEqual((await verifyArtifact(app, manifest)).additionalFiles, ['Uninstall Xenolinguist.exe']);
  await put('resources/server-deps/injected.cjs');
  await assert.rejects(verifyArtifact(app, manifest), /Unexpected installed/);
});
test('changed application bytes fail verification', async t => {
  const { app, manifest, put } = await fixture(t);
  await put('resources/app.asar', 'changed');
  await assert.rejects(verifyArtifact(app, manifest), /Artifact mismatch/);
});
test('missing application files fail verification', async t => {
  const { app, manifest } = await fixture(t);
  await unlink(path.join(app, 'Xenolinguist.exe'));
  await assert.rejects(verifyArtifact(app, manifest), /ENOENT/);
});
test('a changed native model cannot be blessed by recording a new inventory', async t => {
  const { app, manifest, put } = await fixture(t);
  await put('resources/ipa-model/asset.bin', 'wrong model');
  await assert.rejects(recordArtifact(app, manifest, {}, 'test-lock'), /Native asset mismatch/);
});
test('runtime dependencies must match the source lock', async t => {
  const { app, manifest } = await fixture(t);
  await assert.rejects(recordArtifact(app, manifest, {}, 'other-lock'), /source lock/);
});
test('manifest traversal and duplicate members are rejected', async t => {
  const { app, manifest } = await fixture(t);
  for (const file of ['../outside', '/absolute', 'C:/absolute', 'resources/../outside', 'resources\\outside']) assert.throws(() => contained(app, file));
  const record = JSON.parse(await readFile(manifest, 'utf8'));
  record.files.push(record.files[0]); await writeFile(manifest, JSON.stringify(record));
  await assert.rejects(verifyArtifact(app, manifest), /Duplicate artifact/);
});
