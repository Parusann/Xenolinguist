import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'vendor/model-manifest.json'), 'utf8'));
export async function matches(file, expected) {
  try {
    if ((await fs.stat(file)).size !== expected.bytes) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex') === expected.sha256;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function safePath(base, relative) {
  const target = path.resolve(base, relative);
  if (!target.startsWith(path.resolve(base) + path.sep)) throw new Error('Asset path escapes its directory');
  return target;
}
export async function verifyAssets(vendor = path.join(root, 'vendor')) {
  const invalid = [];
  for (const group of manifest.groups) for (const file of group.files) {
    if (!await matches(safePath(vendor, `${group.directory}/${file.file}`), file)) invalid.push(`${group.directory}/${file.file}`);
  }
  if (invalid.length) throw new Error(`Missing or mismatched assets: ${invalid.join(', ')}. Run npm run provision:models -- --download or restore the pinned files.`);
}
async function download(url, destination, expected) {
  const temporary = `${destination}.${randomUUID()}.download`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error(`Asset download failed (${response.status})`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }));
    if (!await matches(temporary, expected)) throw new Error('Downloaded asset checksum mismatch');
    await fs.rename(temporary, destination);
  } finally { await fs.rm(temporary, { force: true }); }
}
async function provision() {
  const downloadAllowed = process.argv.includes('--download');
  const sourceArg = process.argv.find(arg => arg.startsWith('--release-file='))?.slice('--release-file='.length);
  const vendorArg = process.argv.find(arg => arg.startsWith('--vendor-dir='))?.slice('--vendor-dir='.length);
  const vendor = path.resolve(vendorArg || path.join(root, 'vendor'));
  for (const group of manifest.groups) for (const file of group.files) {
    const destination = safePath(vendor, `${group.directory}/${file.file}`);
    if (await matches(destination, file)) continue;
    // Never replace a corrupt or modified asset silently; preserve it for inspection.
    try { await fs.access(destination); throw new Error(`Existing asset differs from manifest: ${destination}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (group.id === 'phones' && file.file.endsWith('.onnx')) {
      const archive = sourceArg ? path.resolve(sourceArg) : path.join(os.tmpdir(), 'xenolinguist-model-cache', group.distribution.sha256 + '.exe');
      if (!await matches(archive, group.distribution)) {
        if (sourceArg || !downloadAllowed) throw new Error('Provide the checksum-matching --release-file=PATH or allow --download');
        await download(group.distribution.url, archive, group.distribution);
      }
      if (process.platform !== 'win32') throw new Error('Pinned legacy model extraction currently requires Windows');
      const extraction = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-model-extract-'));
      const seven = path.join(root, 'node_modules/7zip-bin/win/x64/7za.exe');
      const result = spawnSync(seven, ['x', archive, `-o${extraction}`, group.distribution.member, '-y'], { windowsHide: true, encoding: 'utf8' });
      if (result.error || ![0, 1].includes(result.status)) throw new Error(`Model archive extraction failed (${result.error?.code ?? result.status}): ${(result.stderr || result.stdout || '').trim()}`);
      const extracted = safePath(extraction, group.distribution.member);
      if (!await matches(extracted, file)) throw new Error('Extracted model checksum mismatch');
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(extracted, destination, fs.constants.COPYFILE_EXCL);
      // Keep the isolated extraction as a diagnostic artifact; never delete a user-supplied archive.
    } else {
      if (!downloadAllowed) throw new Error(`Missing tracked asset: ${destination}; restore Git files or allow --download`);
      await download(`https://raw.githubusercontent.com/Parusann/Xenolinguist/${manifest.sourceCommit}/vendor/${group.directory}/${file.file}`, destination, file);
    }
  }
  await verifyAssets(vendor);
  console.log('All model and native assets match the manifest.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await provision();
