import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { key } from '../../../engine/src/induction/contracts.js';
import { NUMBER_BASES } from '../../../engine/src/numbers/grammar.js';
import { numberExperiment, numberSpecs, numberSummary, conditions, type NumberExperiment } from './experiment.js';
export const numberConfigSchema = z.strictObject({ version: z.literal('number-experiment-1'), developmentSeed: z.number().int().min(0).max(100000), evaluationSeed: z.number().int().min(0).max(100000),
  bases: z.array(z.number().int().refine(n => NUMBER_BASES.includes(n))).min(1).max(22), conditions: z.array(z.enum(conditions)).min(1).max(4) }).superRefine((c, ctx) => {
  if (c.developmentSeed === c.evaluationSeed || new Set(c.bases).size !== c.bases.length || new Set(c.conditions).size !== c.conditions.length)
    ctx.addIssue({ code: 'custom', message: 'Use disjoint seeds and unique bases and conditions.' });
});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export async function runNumbers(configPath: string, directory: string, split: 'development' | 'evaluation') {
  const config = numberConfigSchema.parse(JSON.parse(await readFile(configPath, 'utf8')));
  await mkdir(directory, { recursive: false });
  const paths = ['package.json', 'package-lock.json', 'tsconfig.base.json'];
  const walk = async (relative: string) => {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const p = relative + '/' + entry.name;
      if (entry.isDirectory()) await walk(p); else if (p.endsWith('.ts') || p.endsWith('.json')) paths.push(p);
    }
  };
  await walk('engine/src'); await walk('shared'); await walk('evaluation');
  const files = [];
  for (const p of paths.sort()) {
    const bytes = await readFile(path.join(root, p)), target = path.join(directory, 'source', p);
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes); files.push({ path: p, sha256: hash(bytes) });
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const manifest = { version: config.version, split, config, source: { commit: git('rev-parse', 'HEAD'), trackedDirty: !!git('status', '--porcelain', '--untracked-files=no'), files, snapshotHash: hash(key(files)) }, status: 'running', startedAt: new Date().toISOString() };
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const specs = numberSpecs(split === 'development' ? config.developmentSeed : config.evaluationSeed, config.bases);
  const records = specs.flatMap(spec => config.conditions.map(condition => numberExperiment(spec, condition)));
  const body = JSON.stringify(records), report = JSON.stringify(numberSummary(records), null, 2);
  await writeFile(path.join(directory, 'records.json'), body); await writeFile(path.join(directory, 'summary.json'), report);
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ ...manifest, status: 'complete', records: records.length, artifacts: [{ path: 'records.json', sha256: hash(body) }, { path: 'summary.json', sha256: hash(report) }] }, null, 2));
  return verifyNumbers(directory);
}
export async function verifyNumbers(directory: string) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')), config = numberConfigSchema.parse(manifest.config);
  if (manifest.status !== 'complete' || !['development', 'evaluation'].includes(manifest.split)) throw Error('Incomplete or invalid experiment');
  if (hash(key(manifest.source.files)) !== manifest.source.snapshotHash) throw Error('Snapshot index mismatch');
  if (key(manifest.artifacts.map((f: { path: string }) => f.path).sort()) !== key(['records.json', 'summary.json'])) throw Error('Missing artifact inventory');
  for (const f of [...manifest.artifacts, ...manifest.source.files.map((f: { path: string; sha256: string }) => ({ ...f, path: 'source/' + f.path }))]) {
    const target = path.resolve(directory, f.path), relative = path.relative(path.resolve(directory), target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Unsafe artifact path');
    if (hash(await readFile(target)) !== f.sha256) throw Error('Artifact hash mismatch: ' + f.path);
  }
  const records: NumberExperiment[] = JSON.parse(await readFile(path.join(directory, 'records.json'), 'utf8'));
  const specs = numberSpecs(manifest.split === 'development' ? config.developmentSeed : config.evaluationSeed, config.bases);
  const planned = new Map(specs.flatMap(spec => config.conditions.map(condition => [spec.seed + ':' + condition, { spec, condition }] as const)));
  for (const record of records) {
    const id = record.spec.seed + ':' + record.condition, cell = planned.get(id);
    if (!cell || key(cell.spec) !== key(record.spec)) throw Error('Unexpected/duplicate experiment cell');
    planned.delete(id);
    if (key(numberExperiment(cell.spec, cell.condition)) !== key(record)) throw Error('Deterministic number replay mismatch');
  }
  if (planned.size || records.length !== manifest.records) throw Error('Incomplete experiment cells');
  if (key(numberSummary(records)) !== key(JSON.parse(await readFile(path.join(directory, 'summary.json'), 'utf8')))) throw Error('Summary mismatch');
  return { passed: true, records: records.length, split: manifest.split, sourceSnapshotHash: manifest.source.snapshotHash };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, argument] = process.argv.slice(2);
  if (!['development', 'evaluation', 'verify'].includes(mode) || mode === 'verify' && !argument) throw Error('Use development, evaluation, or verify RESULT_DIRECTORY.');
  const task = mode === 'verify' ? verifyNumbers(path.resolve(argument)) : runNumbers(path.join(root, 'evaluation/configs/numbers.json'), path.join(root, 'test-results', 'numbers-' + mode + '-' + new Date().toISOString().replace(/[:.]/g, '-')), mode as 'development' | 'evaluation');
  task.then(console.log).catch(error => { console.error(error); process.exitCode = 1; });
}
