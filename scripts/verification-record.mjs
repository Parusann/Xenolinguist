import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { bytes: (await stat(file)).size, sha256: hash.digest('hex') };
}
export async function inventory(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const results = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(prefix, entry.name);
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...await inventory(file, relative));
    else if (entry.isFile()) results.push({ file: relative, ...await hashFile(file) });
  }
  return results;
}
export function sourceIdentity() {
  const git = args => execFileSync('git', ['-c', 'core.safecrlf=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const trackedChanges = git(['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean);
  const newSourceFiles = git(['ls-files', '--others', '--exclude-standard', '--', 'scripts', 'tests', 'electron', 'server', 'client', 'shared', 'playwright.config.ts']).split('\n').filter(Boolean);
  const workingFiles = [...new Set([...trackedChanges, ...newSourceFiles])].sort().map(file => {
    try { return { file, sha256: createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex') }; }
    catch (error) { if (error.code === 'ENOENT') return { file, deleted: true }; throw error; }
  });
  return { revision: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']),
    workingFiles, node: process.versions.node,
    platform: process.platform, arch: process.arch };
}
export async function saveRecord(file, record) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ recordedAt: new Date().toISOString(), ...record }, null, 2));
  console.log(`Verification record: ${file}`);
}
