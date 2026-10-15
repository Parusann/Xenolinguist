import { describe, expect, it, vi } from 'vitest';
import { readFile, writeFile, mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { dataset } from './generator/dataset.js';
import { semanticKey } from './generator/semantics.js';
import { configSchema, project, run, score } from './runner.js';
import { exactLookup, lookup } from './adapters/exact-lookup.js';
import { induce, symbolic } from './adapters/symbolic.js';
import { llmOnly, messages, parseCompletion, type Completion } from './adapters/llm-only.js';
import { hybrid } from './adapters/hybrid.js';
import { accuracy, pairedInterval, type ScoredItem } from './metrics/accuracy.js';
import { calibration } from './metrics/calibration.js';
import { performanceSummary } from './metrics/performance.js';
import { summarize } from './reports.js';
import type { RunRecord } from './records.js';
import type { Context } from './contracts.js';
import { verifyRun } from './verify.js';

const context: Context = { settings: { name: 'test-only', temperature: 0.2, num_ctx: 8192, num_predict: 2048, timeoutMs: 90000 }, modelSeed: 41 };
const source = dataset(10000, 'SVO');
describe('learners and information boundary', () => {
  it('freezes forward lookup, including its unsupported-script behavior', () => {
    const dictionary = [{ alien_word: 'tála', english_meaning: 'bird' }, { alien_word: '猫', english_meaning: 'fox' }];
    expect(lookup('TÁLA! missing 猫', dictionary)).toEqual([
      { alien: 'TÁLA!', english: 'bird', punctuation: false }, { alien: 'missing', english: null, punctuation: false }, { alien: '猫', english: null, punctuation: true },
    ]);
  });
  it('infers parameters and unseen compositions across 30 development languages', async () => {
    for (let seed = 10000; seed < 10030; seed++) {
      const data = dataset(seed, seed % 2 ? 'SOV' : 'SVO'), output = await symbolic(project(data, 29));
      expect(output.predictions.map(p => semanticKey(p.meaning))).toEqual(data.targets.map(t => semanticKey(t.truth)));
      expect(score(data, output).every(p => p.correct)).toBe(true);
    }
  });
  it('learns structure from observations, not seed/id/surface spelling', async () => {
    // VSO is a supplied prior, tested with a development seed rather than held-out structural seeds.
    const data = dataset(10000, 'VSO'), input = project(data, 29);
    const tokens = [...new Set(input.observations.flatMap(o => o.utterance.split(' ')))];
    const rename = new Map(tokens.map((t, i) => [t, `nonce${i}`]));
    const surface = (text: string) => text.split(' ').map(t => rename.get(t)).join(' ');
    input.observations = input.observations.reverse().map((o, i) => ({ ...o, id: `example-${i}`, utterance: surface(o.utterance) }));
    input.challenges = input.challenges.map((c, i) => ({ id: `query-${i}`, utterance: surface(c.utterance) }));
    input.lexicalProbes = input.lexicalProbes.map(t => rename.get(t)!);
    expect((await symbolic(input)).predictions.map(p => semanticKey(p.meaning))).toEqual(data.targets.map(t => semanticKey(t.truth)));
  });
  it('abstains on insufficient or contradictory examples instead of choosing a convenient hypothesis', async () => {
    const empty = project(source, 0);
    expect(induce(empty)).toHaveLength(24);
    expect((await symbolic(empty)).predictions.every(p => p.status === 'abstained')).toBe(true);
    const bad = project(source, 29); bad.observations[0].utterance = 'contradiction';
    expect(induce(bad)).toHaveLength(0);
    expect((await symbolic(bad)).lexical.every(p => p.status === 'abstained')).toBe(true);
  });
  it('treats exact lookup as a composition ablation using only inferred bindings', async () => {
    const result = await exactLookup(project(source, 29));
    expect(result.lexical.every(p => p.status === 'answered')).toBe(true);
    expect(result.predictions.every(p => p.status === 'abstained')).toBe(true);
    expect(result.diagnostics.glosses).toHaveLength(5);
  });
  it('projects only observations and query surfaces into model messages', () => {
    const input = project(source, 8), prompt = messages(input);
    expect(Object.keys(input).sort()).toEqual(['challenges', 'lexicalProbes', 'observations', 'version']);
    expect(input.observations).toHaveLength(8);
    expect(input.challenges.every(c => Object.keys(c).sort().join() === 'id,utterance')).toBe(true);
    const sent = JSON.parse(prompt[1].content);
    expect(sent).toEqual({ observations: input.observations, challenges: input.challenges, lexicalProbes: input.lexicalProbes });
    expect(prompt[1].content).not.toMatch(/"(?:seed|truth|spec|sha256|family|numberBase|lexicon)"/);
  });
  it('keeps learner modules independent of private generator/scorer imports', async () => {
    const directory = new URL('./adapters/', import.meta.url);
    for (const file of await readdir(directory)) {
      const text = await readFile(new URL(file, directory), 'utf8');
      expect(text).not.toMatch(/from\s+['"][^'"]*(?:generator|runner|reports)/);
    }
  });
});
describe('model and hybrid contracts', () => {
  it('retains malformed JSON, missing ids, duplicate ids, and invalid trees as failures', () => {
    const input = project(source, 8);
    expect(parseCompletion('not json', input).predictions.every(p => p.status === 'invalid')).toBe(true);
    const output = parseCompletion(JSON.stringify({ predictions: [{ id: 'c-0', meaning: null }, { id: 'c-0', meaning: null }, { id: 'c-1', meaning: { clauses: [] } }, { id: 'c-2', meaning: null }], lexicon: { [input.lexicalProbes[0]]: 'invented' } }), input);
    expect(output.predictions.map(p => p.status)).toEqual(['invalid', 'invalid', 'abstained', 'invalid', 'invalid']);
    expect(output.lexical[0].status).toBe('invalid');
  });
  it('retains actual raw responses and separates transport timeouts', async () => {
    const input = project(source, 8), raw = '{"predictions":[],"lexicon":{}}';
    const output = await llmOnly(input, context, async () => ({ raw, provenance: { digest: 'fixture-only' } }));
    expect(output.diagnostics.raw).toBe(raw);
    const timedOut = await llmOnly(input, context, async () => { throw new DOMException('deadline', 'TimeoutError'); });
    expect(timedOut.predictions.every(p => p.status === 'timeout')).toBe(true);
  });
  it('avoids a model call for complete consensus and retains partial failures on fallback', async () => {
    let calls = 0;
    const complete: Completion = async () => { calls++; throw new Error('fixture transport failure'); };
    const full = await hybrid(project(source, 29), context, complete);
    expect(calls).toBe(0); expect(full.diagnostics.modelUsed).toBe(false);
    const partial = await hybrid(project(source, 8), context, complete);
    expect(calls).toBe(1); expect(partial.predictions.some(p => p.status === 'error')).toBe(true);
    expect(partial.lexical.some(p => p.status === 'answered')).toBe(true);
  });
  it('pins local model identity, sends fixed budgets, and retains output rejected after a digest change', async () => {
    let digest = 'fixture-digest', changeDigest = false;
    const requests: Record<string, unknown>[] = [];
    const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const route = new URL(String(url)).pathname;
      const body = route === '/api/tags' ? { models: [{ name: 'test-only', digest, size: 123 }] }
        : route === '/api/show' ? { capabilities: ['completion'], model_info: { architecture: 'fixture' } }
        : route === '/api/version' ? { version: 'fixture' }
        : { done: true, done_reason: 'stop', message: { content: '{"predictions":[],"lexicon":{}}' } };
      if (route === '/api/chat') { requests.push(JSON.parse(String(init?.body))); if (changeDigest) digest = 'changed'; }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    try {
      const input = project(source, 8), pinned = { ...context, expectedDigest: 'fixture-digest' };
      const output = await llmOnly(input, pinned);
      expect(requests[0]).toMatchObject({ model: 'test-only', think: false, format: 'json', options: { seed: 41, temperature: 0.2, num_ctx: 8192, num_predict: 2048 } });
      expect(output.diagnostics.provenance).toMatchObject({ model: { digest: 'fixture-digest', eligible: true } });
      changeDigest = true;
      const changed = await llmOnly(input, pinned);
      expect(changed.predictions.every(p => p.status === 'error')).toBe(true);
      expect(changed.diagnostics.retained).toMatchObject({ raw: '{"predictions":[],"lexicon":{}}', provenance: { model: { digest: 'fixture-digest' } } });
      const refused = await llmOnly(input, pinned);
      expect(requests).toHaveLength(2);
      expect(refused.predictions[0].detail).toContain('preflight digest');
    } finally { mock.mockRestore(); }
  });
});
describe('scoring and reproducibility', () => {
  it('keeps every status in denominators and returns null for empty subsets', () => {
    const items = ['answered', 'abstained', 'invalid', 'error', 'timeout'].map((status, i) => ({ status, correct: i === 0 })) as ScoredItem[];
    expect(accuracy(items)).toMatchObject({ total: 5, accuracy: 0.2, coverage: 0.2, selectiveAccuracy: 1 });
    expect(accuracy([]).accuracy).toBeNull();
    expect(score(source, { predictions: [], lexical: [], diagnostics: {} })).toHaveLength(14);
  });
  it('rejects invented confidence and validates actual probability inputs', () => {
    expect(calibration([{ probability: 0.9, correct: true }]).available).toBe(false);
    expect(() => calibration([{ probability: 90, correct: true }], 'probability-of-correctness')).toThrow();
    expect(calibration([{ probability: 1, correct: true }, { probability: 0, correct: false }], 'probability-of-correctness')).toMatchObject({ available: true, brier: 0 });
  });
  it('pairs by language and averages repetitions before uncertainty estimation', () => {
    expect(pairedInterval([0.2, 0.2])).toMatchObject({ mean: 0.2, lower: 0.2, upper: 0.2, languageCount: 2 });
    expect(pairedInterval([0, 1, -1])).toEqual(pairedInterval([0, 1, -1]));
    const row = (method: string, seed: number, correct: boolean) => ({ split: 'development', observations: 8, method, seed, latencyMs: 1, output: { diagnostics: {} }, items: [{ kind: 'semantic', status: 'answered', correct }] }) as RunRecord;
    const report = summarize([row('a', 1, false), row('a', 2, false), row('b', 1, true), row('b', 1, false), row('b', 2, true), row('b', 2, true)]);
    expect(report.paired[0].interval).toMatchObject({ mean: 0.75, languageCount: 2 });
    expect(performanceSummary([100, 1, 3])).toMatchObject({ medianMs: 3, p95Ms: 100 });
  });
  it('refuses undersized evaluation sets and duplicate budgets', async () => {
    const config = JSON.parse(await readFile(new URL('../configs/ci.json', import.meta.url), 'utf8'));
    expect(() => configSchema.parse({ ...config, splits: ['evaluation'] })).toThrow();
    expect(() => configSchema.parse({ ...config, budgets: [8, 8] })).toThrow();
  });
  it('writes a complete traceable experiment and refuses to overwrite it', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'xeno-evaluation-')), directory = path.join(temporary, 'run');
    const config = configSchema.parse({ ...JSON.parse(await readFile(new URL('../configs/ci.json', import.meta.url), 'utf8')), limit: 1, budgets: [29] });
    await run(config, directory);
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ status: 'complete', records: 2 });
    const raw = await readFile(path.join(directory, 'runs.jsonl'));
    expect(manifest.artifacts.find((a: { path: string }) => a.path === 'runs.jsonl').sha256).toBe(createHash('sha256').update(raw).digest('hex'));
    const rows = raw.toString().trim().split('\n').map(line => JSON.parse(line));
    expect(rows[0].inputHash).toBe(rows[1].inputHash);
    expect(rows[0].observationIds).toHaveLength(29);
    expect(manifest.source.files.some((f: { path: string }) => f.path === 'evaluation/src/adapters/symbolic.ts')).toBe(true);
    await expect(verifyRun(directory)).resolves.toMatchObject({ passed: true, records: 2 });
    await expect(run(config, directory)).rejects.toThrow();
    await writeFile(path.join(directory, 'runs.jsonl'), raw.toString().replace('"correct":false', '"correct":true'));
    await expect(verifyRun(directory)).rejects.toThrow('Artifact hash mismatch');
  });
});
