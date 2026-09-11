import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function verifyPackagedRuntime(directory) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'runtime-manifest.json'), 'utf8'));
  for (const entry of manifest.packages) {
    const metadata = JSON.parse(await fs.readFile(path.join(directory, entry.path, 'package.json'), 'utf8'));
    if (metadata.name !== entry.name || metadata.version !== entry.version) throw new Error(`Packaged runtime dependency mismatch: ${entry.name}`);
  }
}
export async function stageRuntime() {
  const lockBytes = await fs.readFile(path.join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  const output = path.join(root, 'electron/runtime');
  // Only replace this dedicated generated directory, never an inferred package location.
  if (path.dirname(output) !== path.join(root, 'electron')) throw new Error('Unsafe staging path');
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  const packages = [], visited = new Set();
  async function locate(name, from) {
    for (let dir = from; dir.startsWith(root); dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'node_modules', name);
      try { await fs.access(path.join(candidate, 'package.json')); return candidate; } catch { /* try ancestor */ }
      if (dir === root) break;
    }
    return null;
  }
  async function visit(name, from, optional = false) {
    const source = await locate(name, from);
    if (!source) { if (optional) return; throw new Error(`Missing production dependency: ${name}`); }
    if (visited.has(source)) return;
    visited.add(source);
    const metadata = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
    const key = path.relative(root, source).split(path.sep).join('/');
    const pinned = lock.packages[key];
    if (!pinned || pinned.version !== metadata.version || !pinned.integrity) throw new Error(`Dependency differs from lockfile: ${key}`);
    await fs.cp(source, path.join(output, key), { recursive: true, filter: file => file === source || path.basename(file) !== 'node_modules' });
    packages.push({ name, version: metadata.version, path: key, integrity: pinned.integrity, license: metadata.license ?? null });
    for (const dependency of Object.keys(metadata.dependencies ?? {})) await visit(dependency, source);
    for (const dependency of Object.keys(metadata.optionalDependencies ?? {})) await visit(dependency, source, true);
  }
  await visit('@huggingface/transformers', root);
  await fs.writeFile(path.join(output, 'runtime-anchor.cjs'), '// Resolution anchor for the packaged phone runtime.\n');
  await fs.writeFile(path.join(output, 'runtime-manifest.json'), JSON.stringify({ platform: process.platform, arch: process.arch,
    lockSha256: createHash('sha256').update(lockBytes).digest('hex'), packages }, null, 2));
  console.log(`Staged ${packages.length} locked runtime packages.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stageRuntime();
