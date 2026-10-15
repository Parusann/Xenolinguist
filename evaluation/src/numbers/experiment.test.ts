import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { numberCorpus, numberExperiment, numberSpecs } from './experiment.js';
import { numberConfigSchema, runNumbers, verifyNumbers } from './run.js';
const temporary: string[] = [];
afterEach(async () => {
  for (const directory of temporary.splice(0)) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('xeno-number-test-')) throw Error('Unexpected cleanup directory');
    await rm(directory, { recursive: true, force: true });
  }
});
it('separates fit, selection validation and final targets, with disjoint lexical seed partitions', () => {
  const forms = (seed: number) => new Set(numberSpecs(seed, [2, 3, 4, 5, 10, 20, 36]).flatMap(spec => {
    const corpus = numberCorpus(spec), fit = new Set(corpus.input.fit.map(o => o.value)), validation = new Set(corpus.input.validation.map(o => o.value));
    expect(corpus.input.validation.every(o => !fit.has(o.value))).toBe(true);
    expect(corpus.withheld.every(o => !fit.has(o.value) && !validation.has(o.value))).toBe(true);
    expect(corpus.input.fit.length).toBeLessThanOrEqual(64);
    return corpus.input.fit.filter(o => o.value <= spec.base).map(o => o.form);
  }));
  const development = forms(301), evaluation = forms(401);
  expect([...development].every(form => !evaluation.has(form))).toBe(true);
});
it('counts withheld irregular overgeneralizations as errors rather than removing them', () => {
  const spec = numberSpecs(301, [5])[0];
  const record = numberExperiment(spec, 'withheld-irregular');
  expect(record.rows).toHaveLength(3);
  expect(record.rows[0]).toMatchObject({ answered: true, correct: false, memorized: null });
  expect(record.rows.slice(1).every(row => row.correct)).toBe(true);
  expect(numberExperiment(spec, 'sparse').rows.every(row => !row.answered)).toBe(true);
  expect(numberExperiment(spec, 'duplicate-form').inference.status).toBe('ambiguous');
});
it('rejects overlapping partitions and untested bases in the experiment config', () => {
  const config = { version: 'number-experiment-1', developmentSeed: 301, evaluationSeed: 301, bases: [2], conditions: ['regular'] };
  expect(numberConfigSchema.safeParse(config).success).toBe(false);
  expect(numberConfigSchema.safeParse({ ...config, evaluationSeed: 401, bases: [21] }).success).toBe(false);
});
it('retains source snapshots, replays exact outcomes and rejects overwrite and tampered summaries', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeno-number-test-')); temporary.push(directory);
  const config = path.join(directory, 'config.json'), output = path.join(directory, 'run');
  await writeFile(config, JSON.stringify({ version: 'number-experiment-1', developmentSeed: 301, evaluationSeed: 401, bases: [2], conditions: ['regular'] }));
  expect(await runNumbers(config, output, 'development')).toMatchObject({ passed: true, records: 12 });
  await expect(runNumbers(config, output, 'development')).rejects.toThrow();
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  expect(manifest.source.files.some((f: { path: string }) => f.path === 'engine/src/numbers/score.ts')).toBe(true);
  await writeFile(path.join(output, 'summary.json'), '[]');
  await expect(verifyNumbers(output)).rejects.toThrow('Artifact hash mismatch');
}, 20000);
