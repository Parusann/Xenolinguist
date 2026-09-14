// Portable, dependency-free verification of the actual packaged/installed payload.
import { readdir, readFile, writeFile, realpath, lstat, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const core = ['Xenolinguist.exe', 'resources/app.asar', 'resources/app.asar.unpacked/electron/dist/server.cjs', 'resources/app.asar.unpacked/electron/dist/phone-process.cjs', 'resources/client/dist/index.html', 'resources/server-deps/runtime-anchor.cjs', 'resources/server-deps/runtime-manifest.json', 'resources/model-manifest.json', 'resources/THIRD_PARTY.md'];
export function contained(base, file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || file.split('/').some(part => !part || part === '.' || part === '..') || path.isAbsolute(file) || /^[a-z]:/i.test(file)) throw Error('Invalid artifact path');
  const target = path.resolve(base, file), relative = path.relative(base, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Artifact path escapes root');
  return target;
}
export async function fingerprint(file) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { bytes: (await lstat(file)).size, sha256: hash.digest('hex') };
}
async function fileList(base, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(base, relative), { withFileTypes: true })) {
    const file = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw Error('Artifact must not contain symlinks: ' + file);
    if (entry.isDirectory()) files.push(...await fileList(base, file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}
async function checkStructure(directory, lockSha256) {
  for (const file of core) if (!(await lstat(contained(directory, file))).isFile()) throw Error('Missing artifact file: ' + file);
  const assets = JSON.parse(await readFile(path.join(directory, 'resources/model-manifest.json'), 'utf8'));
  if (assets.schemaVersion !== 1 || assets.platform !== 'win32' || assets.arch !== 'x64') throw Error('Unsupported asset manifest');
  const roots = { phones: 'ipa-model', whisper: 'whisper', espeak: 'espeak-ng' };
  for (const group of assets.groups) {
    if (!roots[group.id]) throw Error('Unknown native asset group');
    for (const expected of group.files) {
      const file = contained(directory, 'resources/' + roots[group.id] + '/' + expected.file);
      const actual = await fingerprint(file);
      if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw Error('Native asset mismatch: ' + group.id + '/' + expected.file);
    }
  }
  if (Object.keys(roots).some(id => !assets.groups.some(group => group.id === id && group.files.length))) throw Error('Missing native asset group');
  const runtime = JSON.parse(await readFile(path.join(directory, 'resources/server-deps/runtime-manifest.json'), 'utf8'));
  if (runtime.lockSha256 !== lockSha256 || runtime.platform !== 'win32' || runtime.arch !== 'x64') throw Error('Runtime manifest differs from source lock/platform');
  if (!runtime.packages.some(item => item.name === '@huggingface/transformers') || !runtime.packages.some(item => item.name === 'onnxruntime-node')) throw Error('Missing native runtime dependencies');
  for (const entry of runtime.packages) {
    const file = contained(directory, 'resources/server-deps/' + entry.path + '/package.json');
    const metadata = JSON.parse(await readFile(file, 'utf8'));
    if (metadata.name !== entry.name || metadata.version !== entry.version || !entry.integrity) throw Error('Runtime dependency mismatch: ' + entry.name);
  }
  return { requiredFiles: core.length, nativeGroups: assets.groups.length, runtimePackages: runtime.packages.length };
}
export async function recordArtifact(directory, manifestFile, source, lockSha256) {
  directory = await realpath(directory);
  const checks = await checkStructure(directory, lockSha256);
  const files = []; for (const file of await fileList(directory)) files.push({ file, ...await fingerprint(contained(directory, file)) });
  const manifest = { schemaVersion: 1, source, lockSha256, checks, files };
  await mkdir(path.dirname(manifestFile), { recursive: true }); await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  return manifest;
}
export async function verifyArtifact(directory, manifestFile) {
  directory = await realpath(directory);
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw Error('Invalid artifact manifest');
  const actualFiles = await fileList(directory); // Reject links, including links inserted beneath a declared path.
  const declared = new Set();
  for (const expected of manifest.files) {
    const file = contained(directory, expected.file);
    if (declared.has(expected.file)) throw Error('Duplicate artifact member'); declared.add(expected.file);
    const actual = await fingerprint(file);
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw Error('Artifact mismatch: ' + expected.file);
  }
  for (const file of core) if (!declared.has(file)) throw Error('Manifest omits required file: ' + file);
  const additionalFiles = actualFiles.filter(file => !declared.has(file));
  // NSIS creates the uninstaller during installation; all application files must match the build.
  if (additionalFiles.some(file => file !== 'Uninstall Xenolinguist.exe')) throw Error('Unexpected installed artifact file');
  const checks = await checkStructure(directory, manifest.lockSha256);
  return { passed: true, checkedFiles: declared.size, additionalFiles, source: manifest.source, manifest: await fingerprint(manifestFile), checks };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, manifestFile, mode] = process.argv.slice(2);
  if (!directory || !manifestFile) throw Error('Usage: node scripts/verify-artifact-layout.mjs <app-directory> <manifest.json> [--record]');
  if (mode === '--record') {
    const { root, sourceIdentity } = await import('./verification-record.mjs');
    const lock = await fingerprint(path.join(root, 'package-lock.json'));
    const manifest = await recordArtifact(directory, path.resolve(manifestFile), sourceIdentity(), lock.sha256);
    console.log('Recorded ' + manifest.files.length + ' artifact files');
  } else console.log(JSON.stringify(await verifyArtifact(directory, manifestFile)));
}
