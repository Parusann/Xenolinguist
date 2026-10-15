import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { config, corpus, corpusCase } from './corpus.js';
import { choose, matrix, measure, point, replay, schedule, summarize, survivors, type Record } from './experiment.js';
import { sha, sourceInventory, verify } from './run.js';
import { queryKey, stableKey } from '../../../engine/src/elicitation/contracts.js';

it('declares disjoint seed partitions, complete schedules and nonoverlapping oracle questions and test targets', () => {
  const seeds = [...config.developmentSeeds, ...config.evaluationSeeds, ...config.ciSeeds];
  expect(new Set(seeds).size).toBe(seeds.length);
  expect(corpus('development')).toHaveLength(48); expect(corpus('evaluation')).toHaveLength(96);
  expect(schedule(corpus('evaluation'))).toHaveLength(672);
  for (const c of [...corpus('development'), ...corpus('evaluation'), ...corpus('ci')]) {
    expect(c.targets).toHaveLength(6);
    const questions = c.visible.available.map(queryKey);
    expect(new Set(questions).size).toBe(questions.length);
    expect(c.oracle.map(a => a.key)).toEqual(questions);
    expect(c.targets.every(t => !questions.includes(queryKey(t.query)))).toBe(true);
  }
});
it('checks independent oracle rendering against every intended number and grammar truth on separate fixture seeds', () => {
  for (let seed = 1000; seed < 1014; seed++) for (const domain of ['number', 'grammar'] as const) {
    const c = corpusCase(seed, domain, 'regular'), truth = (domain === 'number' ? 'n' + seed % 6 : 'g' + seed % 8);
    for (const q of c.visible.available) expect(matrix(c.visible, [q]).rows[0].predictions.find(p => p.candidateId === truth)).toMatchObject({ status: 'predicted', form: c.oracle.find(o => o.key === queryKey(q))!.form });
    for (const t of c.targets) expect(matrix(c.visible, [t.query]).rows[0].predictions.find(p => p.candidateId === truth)).toMatchObject({ status: 'predicted', form: t.expected });
  }
});
it('keeps hidden targets and irregular labels out of the selector boundary', () => {
  const regular = corpusCase(1001, 'number', 'regular'), irregular = corpusCase(1001, 'number', 'withheld-irregular');
  expect(irregular.visible).toEqual(regular.visible); expect(irregular.oracle).toEqual(regular.oracle);
  irregular.targets.forEach(t => { t.expected = 'WITHHELD_SENTINEL'; });
  const seen: string[] = [];
  measure(irregular, 'active', 0, (...args) => { seen.push(JSON.stringify(args)); return choose(...args); });
  expect(seen.length).toBeGreaterThan(0); expect(seen.join('')).not.toContain('WITHHELD_SENTINEL'); expect(seen.join('')).not.toContain('oracle');
});
it('selects a stronger split than the curriculum and charges only the selected independently supplied answer', () => {
  const c = corpusCase(1001, 'number', 'regular'), active = measure(c, 'active', 0), fixed = measure(c, 'curriculum', 0);
  expect(active.failed).toBeNull(); expect(active.history).toHaveLength(1);
  expect(active.steps[1].remaining).toHaveLength(1); expect(fixed.history.length).toBeGreaterThan(1);
  expect(active.steps[1].answer!.form).toBe(c.oracle.find(o => o.key === queryKey(active.history[0].query))!.form);
  expect(active.steps[1].choice!.plan.selected!.disagreementBits).toBeGreaterThan(2);
});
it('is deterministic across replay and uses distinct seeded random streams', () => {
  const c = corpusCase(1003, 'grammar', 'regular');
  const runs = config.randomSeeds.map(seed => measure(c, 'random', seed));
  for (const r of runs) { replay(c, r); expect(r.failed).toBeNull(); }
  expect(new Set(runs.map(r => queryKey(r.history[0].query))).size).toBeGreaterThan(1);
});
it('enforces observation and cost ceilings, excludes repeated questions and retains costs on every step', () => {
  for (const { c, method, randomSeed } of schedule([corpusCase(1004, 'number', 'costly'), corpusCase(1004, 'grammar', 'costly')])) {
    const r = measure(c, method, randomSeed);
    expect(r.failed).toBeNull(); expect(r.history.length).toBeLessThanOrEqual(config.maxObservations);
    expect(new Set(r.history.map(a => queryKey(a.query))).size).toBe(r.history.length);
    expect(r.steps.at(-1)!.cost).toBeLessThanOrEqual(config.maxCost);
    expect(r.steps.at(-1)!.cost).toBe(r.history.reduce((n, a) => n + a.query.cost, 0));
    const budget = 2, chosen = choose(c.visible, [], method, randomSeed, budget).selected;
    expect(chosen === null || chosen.cost <= budget).toBe(true);
  }
});
it('does not turn unavailable predictions into evidence against a candidate or into information gain', () => {
  const c = corpusCase(1002, 'grammar', 'unavailable'), r = measure(c, 'active', 0);
  expect(r.history).toHaveLength(0); expect(point(r, 'observations', 8).abstained).toBe(6);
  const q = c.visible.available[2], history = [{ query: q, form: c.oracle.find(o => o.key === queryKey(q))!.form }];
  expect(survivors(c.visible, history).candidates.some(c => c.id === 'unknown')).toBe(true);
});
it('retains wrong regularizations of withheld irregular targets after a successful distinguishing answer', () => {
  const c = corpusCase(1001, 'number', 'withheld-irregular'), r = measure(c, 'active', 0);
  expect(point(r, 'observations', 8)).toMatchObject({ total: 6, correct: 4, wrong: 2, abstained: 0 });
});
it('preserves novel contradictory answers and stops with an empty candidate set', () => {
  const c = corpusCase(1001, 'number', 'regular'); c.oracle.forEach(o => { o.form = 'unpredicted'; });
  const r = measure(c, 'active', 0);
  expect(r.stop).toBe('all-contradicted'); expect(r.history[0].form).toBe('unpredicted'); expect(point(r, 'cost', 12).abstained).toBe(6);
});
it('carries the last affordable prefix forward and preserves denominators for failed traces', () => {
  const c = corpusCase(1001, 'number', 'regular'), r = measure(c, 'active', 0);
  expect(point(r, 'observations', 8)).toEqual(point(r, 'observations', 1));
  expect(point(r, 'cost', 0).queries).toBe(0);
  const failed = measure(c, 'active', 0, () => { throw Error('Injected selection failure'); });
  expect(failed.failed).toBe('Injected selection failure'); expect(point(failed, 'cost', 12).total).toBe(c.targets.length);
  const rows = schedule([c]).map(p => measure(p.c, p.method, p.randomSeed)); rows[0] = failed;
  expect(summarize(rows).curves.find(c => c.domain === 'number' && c.condition === 'regular' && c.method === 'active')!.failures).toBe(1);
});
it('averages random repeats within paired cases and retains wins, ties and losses at every budget', () => {
  const rows = schedule([corpusCase(1000, 'number', 'regular'), corpusCase(1001, 'number', 'regular')]).map(p => measure(p.c, p.method, p.randomSeed));
  const summary = summarize(rows), pair = summary.paired.find(p => p.domain === 'number' && p.condition === 'regular' && p.axis === 'observations' && p.budget === 1 && p.baseline === 'random')!;
  expect(pair.cases).toBe(2); expect(pair.wins + pair.ties + pair.losses).toBe(2);
  expect(pair.meanDeltaCorrectRate).toBeCloseTo(pair.deltas.reduce((n, d) => n + d.delta, 0) / 2);
  const corrupt = structuredClone(rows[0]); corrupt.steps[1].cost += 1;
  expect(() => replay(corpusCase(1000, 'number', 'regular'), corrupt)).toThrow('replay mismatch');
});
it('verifies full archives and rejects incomplete, altered, duplicate, path-traversing and missing-source artifacts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeno-elicitation-eval-'));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  try {
    const files = [];
    for (const p of await sourceInventory()) {
      const data = await readFile(path.join(root, p)), target = path.join(directory, 'source', p); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, data); files.push({ path: p, sha256: sha(data) });
    }
    const cases = corpus('ci'), records: Record[] = [], listed = [];
    const save = async (name: string, value: unknown) => { const body = JSON.stringify(value); await writeFile(path.join(directory, name), body); return sha(body); };
    for (const p of schedule(cases)) {
      const r = measure(p.c, p.method, p.randomSeed), name = `${p.c.id}-${p.method}-${p.randomSeed}.json`; records.push(r); listed.push({ path: name, sha256: await save(name, r) });
    }
    const manifest = { version: config.version, config, split: 'ci', status: 'complete', source: { commit: '0'.repeat(40), files, snapshotHash: sha(stableKey(files)) }, corpusHash: sha(stableKey(cases)), records: listed, summaryHash: await save('summary.json', summarize(records)) };
    await save('corpus.json', cases); await save('manifest.json', manifest);
    expect(await verify(directory)).toMatchObject({ passed: true, records: 56, cases: 8 });
    for (const broken of [
      { ...manifest, status: 'running' }, { ...manifest, records: listed.slice(1) }, { ...manifest, records: [listed[0], listed[0], ...listed.slice(1)] },
      { ...manifest, records: [{ path: '../outside.json', sha256: '' }] },
      { ...manifest, source: { ...manifest.source, files: files.slice(1), snapshotHash: sha(stableKey(files.slice(1))) } },
    ]) { await save('manifest.json', broken); await expect(verify(directory)).rejects.toThrow(); }
    await save('manifest.json', manifest); await save(listed[0].path, { changed: true }); await expect(verify(directory)).rejects.toThrow('Record hash mismatch');
  } finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('xeno-elicitation-eval-')) throw Error('Unsafe cleanup');
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
