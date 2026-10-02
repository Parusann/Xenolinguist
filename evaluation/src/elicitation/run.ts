import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stableKey } from '../../../engine/src/elicitation/contracts.js';
import { config, corpus, type Split } from './corpus.js';
import { measure, replay, schedule, summarize, type Record } from './experiment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const atomic = async (file: string, value: unknown) => { const tmp = file + '.pending'; await writeFile(tmp, JSON.stringify(value, null, 2) + '\n'); await rename(tmp, file); };
const inside = (directory: string, relative: string) => {
  const target = path.resolve(directory, relative), rel = path.relative(path.resolve(directory), target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Unsafe archive path'); return target;
};
const sourcePaths = () => git('ls-files', 'engine', 'shared', 'evaluation', 'package.json', 'package-lock.json', 'tsconfig.base.json', 'client/package.json', 'server/package.json').split(/\r?\n/).filter(p => /\.(?:ts|json)$/.test(p)).sort();
export async function sourceInventory() {
  const paths = ['package.json', 'package-lock.json', 'tsconfig.base.json', 'client/package.json', 'server/package.json'];
  const walk = async (relative: string) => {
    for (const e of await readdir(path.join(root, relative), { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
      const p = relative + '/' + e.name;
      if (e.isDirectory()) await walk(p); else if (/\.(?:ts|json)$/.test(p)) paths.push(p);
    }
  };
  for (const folder of ['engine', 'shared', 'evaluation']) await walk(folder);
  return paths.sort();
}
type Manifest = { version: string; config: typeof config; split: Split; status: 'running' | 'complete'; startedAt: string;
  source: { commit: string; files: { path: string; sha256: string }[]; snapshotHash: string }; corpusHash: string; records: { path: string; sha256: string }[]; summaryHash?: string };

export async function run(directory: string, split: Split) {
  if (!['development', 'evaluation', 'ci'].includes(split)) throw Error('Invalid split');
  if (git('status', '--porcelain', '--untracked-files=no')) throw Error('Commit the freeze before running the experiment');
  const paths = sourcePaths();
  if (!paths.includes('evaluation/src/elicitation/run.ts')) throw Error('Experiment source must be tracked and committed');
  if (stableKey(paths) !== stableKey(await sourceInventory())) throw Error('Commit every experiment source file before freezing');
  await mkdir(directory, { recursive: false });
  const files = [];
  for (const p of paths) {
    const bytes = await readFile(path.join(root, p)), dest = inside(directory, 'source/' + p);
    await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, bytes); files.push({ path: p, sha256: sha(bytes) });
  }
  const cases = corpus(split), manifest: Manifest = { version: config.version, config, split, status: 'running', startedAt: new Date().toISOString(),
    source: { commit: git('rev-parse', 'HEAD'), files, snapshotHash: sha(stableKey(files)) }, corpusHash: sha(stableKey(cases)), records: [] };
  await atomic(path.join(directory, 'corpus.json'), cases); await atomic(path.join(directory, 'manifest.json'), manifest);
  const records = [];
  for (const { c, method, randomSeed } of schedule(cases)) {
    const record = measure(c, method, randomSeed), name = `${c.id}-${method}-${randomSeed}.json`, file = inside(directory, name);
    await atomic(file, record); records.push(record); manifest.records.push({ path: name, sha256: sha(await readFile(file)) });
    await atomic(path.join(directory, 'manifest.json'), manifest);
  }
  await atomic(path.join(directory, 'summary.json'), summarize(records));
  manifest.summaryHash = sha(await readFile(path.join(directory, 'summary.json'))); manifest.status = 'complete'; await atomic(path.join(directory, 'manifest.json'), manifest);
  return verify(directory);
}
export async function verify(directory: string) {
  const manifest: Manifest = await json(path.join(directory, 'manifest.json'));
  if (manifest.status !== 'complete' || manifest.version !== config.version || stableKey(manifest.config) !== stableKey(config) || !['development', 'evaluation', 'ci'].includes(manifest.split)) throw Error('Incomplete or incompatible experiment');
  if (sha(stableKey(manifest.source.files)) !== manifest.source.snapshotHash || !/^[a-f0-9]{40}$/.test(manifest.source.commit)) throw Error('Invalid source identity');
  const paths = manifest.source.files.map(f => f.path);
  if (stableKey([...paths].sort()) !== stableKey(await sourceInventory())) throw Error('Source inventory does not match the executing snapshot');
  if (new Set(paths).size !== paths.length || !['evaluation/src/elicitation/run.ts', 'evaluation/src/elicitation/corpus.ts', 'evaluation/src/elicitation/experiment.ts', 'package-lock.json'].every(p => paths.includes(p))) throw Error('Missing source inventory');
  for (const f of manifest.source.files) {
    if (sha(await readFile(inside(directory, 'source/' + f.path))) !== f.sha256) throw Error('Source hash mismatch');
    // Normalize only checkout newlines when comparing the executing tree; archived byte hashes above remain exact.
    const current = (await readFile(inside(root, f.path), 'utf8')).replace(/\r\n/g, '\n');
    const captured = (await readFile(inside(directory, 'source/' + f.path), 'utf8')).replace(/\r\n/g, '\n');
    if (current !== captured) throw Error('Use the retained source snapshot for replay: ' + f.path);
  }
  const cases = corpus(manifest.split);
  if (sha(stableKey(cases)) !== manifest.corpusHash || stableKey(await json(path.join(directory, 'corpus.json'))) !== stableKey(cases)) throw Error('Corpus mismatch');
  const planned = new Map(schedule(cases).map(p => [p.c.id + ':' + p.method + ':' + p.randomSeed, p]));
  const records: Record[] = [], recordPaths = new Set<string>();
  for (const file of manifest.records) {
    if (recordPaths.has(file.path)) throw Error('Duplicate artifact'); recordPaths.add(file.path);
    const bytes = await readFile(inside(directory, file.path)); if (sha(bytes) !== file.sha256) throw Error('Record hash mismatch');
    const record: Record = JSON.parse(bytes.toString()), p = planned.get(record.id);
    if (!p || p.method !== record.method || p.randomSeed !== record.randomSeed || file.path !== `${p.c.id}-${p.method}-${p.randomSeed}.json`) throw Error('Unexpected or duplicate trace');
    planned.delete(record.id); replay(p.c, record); records.push(record);
  }
  if (planned.size) throw Error('Missing scheduled traces');
  const summary = await readFile(path.join(directory, 'summary.json'));
  if (sha(summary) !== manifest.summaryHash || stableKey(JSON.parse(summary.toString())) !== stableKey(summarize(records))) throw Error('Summary mismatch');
  return { passed: true, records: records.length, cases: cases.length, split: manifest.split, sourceCommit: manifest.source.commit, sourceSnapshotHash: manifest.source.snapshotHash, corpusHash: manifest.corpusHash, failures: records.filter(r => r.failed).length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, output] = process.argv.slice(2);
  if (!['development', 'evaluation', 'ci', 'verify'].includes(mode) || mode === 'verify' && !output) throw Error('Use development|evaluation|ci NEW_DIRECTORY, or verify DIRECTORY');
  const directory = path.resolve(output ?? path.join(root, 'test-results', 'elicitation-' + mode + '-' + new Date().toISOString().replace(/[:.]/g, '-')));
  (mode === 'verify' ? verify(directory) : run(directory, mode as Split)).then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e); process.exitCode = 1; });
}
