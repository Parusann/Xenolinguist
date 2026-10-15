import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { configSchema, project, score } from './runner.js';
import { dataset, hash, splitManifest } from './generator/dataset.js';
import { summarize } from './reports.js';
import type { RunRecord } from './records.js';

/** Independent replay of projections/scoring, artifact hashes and planned experiment completeness. No model calls. */
export async function verifyRun(directory: string) {
  const read = (name: string) => readFile(path.join(directory, name));
  const manifest = JSON.parse((await read('manifest.json')).toString());
  if (manifest.status !== 'complete') throw new Error('Experiment is incomplete');
  const config = configSchema.parse(manifest.config), corpus = splitManifest();
  if (hash(config) !== manifest.configHash || hash(corpus) !== hash(manifest.corpus)) throw new Error('Configuration or corpus mismatch');
  if (hash(manifest.source.files) !== manifest.source.snapshotHash) throw new Error('Source snapshot index mismatch');
  const contained = (relative: string) => {
    const resolved = path.resolve(directory, relative), rel = path.relative(directory, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Artifact path escapes result directory');
    return resolved;
  };
  for (const file of [...manifest.artifacts, ...manifest.source.files.map((f: { path: string; sha256: string }) => ({ ...f, path: `source/${f.path}` }))]) {
    const actual = createHash('sha256').update(await readFile(contained(file.path))).digest('hex');
    if (actual !== file.sha256) throw new Error(`Artifact hash mismatch: ${file.path}`);
  }
  const records = (await read('runs.jsonl')).toString().trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as RunRecord);
  const planned = new Set<string>();
  for (const name of config.splits) for (const spec of corpus.splits.find(s => s.name === name)!.records.slice(0, config.limit))
    for (const budget of config.budgets) for (const method of config.methods)
      for (let repetition = 0; repetition < (['llm-only', 'hybrid'].includes(method) ? config.modelSeeds.length : 1); repetition++)
        planned.add(`${name}/${spec.seed}/${budget}/${method}/${repetition}`);
  const expected = planned.size;
  for (const record of records) {
    const id = `${record.split}/${record.seed}/${record.observations}/${record.method}/${record.repetition}`;
    if (id !== record.id || !planned.delete(id)) throw new Error('Unexpected or duplicate experiment cell');
    const spec = corpus.splits.find(s => s.name === record.split)?.records.find(r => r.seed === record.seed);
    if (!spec) throw new Error('Unknown language');
    const data = dataset(spec.seed, spec.family), input = project(data, record.observations);
    if (data.sha256 !== record.datasetHash || hash(input) !== record.inputHash || hash(input) !== hash(record.input)) throw new Error('Learner input mismatch');
    if (hash(input.observations.map(o => o.id)) !== hash(record.observationIds)) throw new Error('Observation id mismatch');
    if (!Number.isFinite(record.latencyMs) || record.latencyMs < 0) throw new Error('Invalid latency');
    if (hash(score(data, record.output)) !== hash(record.items)) throw new Error('Scored items do not replay');
    const modelSeed = ['llm-only', 'hybrid'].includes(record.method) ? config.modelSeeds[record.repetition] : null;
    if (record.modelSeed !== modelSeed) throw new Error('Model seed mismatch');
  }
  if (planned.size || records.length !== expected || manifest.records !== expected) throw new Error('Missing experiment cells');
  if (hash(summarize(records)) !== hash(JSON.parse((await read('summary.json')).toString()))) throw new Error('Summary does not replay');
  return { passed: true, records: records.length, corpusHash: corpus.sha256, sourceSnapshotHash: manifest.source.snapshotHash };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = process.argv[2];
  if (!directory) throw new Error('Supply a result directory');
  verifyRun(path.resolve(directory)).then(result => console.log(JSON.stringify(result, null, 2))).catch(e => { console.error(e); process.exitCode = 1; });
}
