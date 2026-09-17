import { expect, it } from 'vitest';
import fs from 'node:fs';
import { language, validateLanguage } from './lexicon.js';
import { compile } from './compile.js';
import { dataset, learnerView, splitManifest, meanings, hash } from './dataset.js';
import { parseUtterance, numberTokens } from './grammar.js';
import { normalizeMeaning, semanticKey } from './semantics.js';
import { prng } from './prng.js';
import type { Family } from '../../../engine/src/types.js';

it('matches reviewed v1 golden bytes, PRNG outputs and locked split hashes across runtimes', () => {
  const gold = JSON.parse(fs.readFileSync(new URL('../../fixtures/generator-gold.json', import.meta.url), 'utf8'));
  const random = prng(42);
  expect(Array.from({ length: 5 }, () => random())).toEqual(gold.prng42);
  expect(dataset(42)).toEqual(gold.seed42);
  expect(splitManifest()).toEqual(gold.manifest);
});
it('round trips 3,060 generated observations/targets across 90 languages without collisions', () => {
  for (let seed = 0; seed < 90; seed++) {
    const data = dataset(seed, (['SVO', 'SOV', 'VSO'] as const)[seed % 3]);
    for (const item of [...data.observations, ...data.targets]) expect(parseUtterance(item.utterance, data.spec)).toEqual(item.truth);
    expect(new Set([...data.observations, ...data.targets].map(i => i.utterance)).size).toBe(data.observations.length + data.targets.length);
  }
});
it('uses strict meaning validation and canonical attribute ordering; roles and features affect truth', () => {
  const spec = language(1), m = structuredClone(meanings().targets.find(t => t.clauses.length === 1)!);
  m.clauses[0].agent.attributes.reverse();
  expect(compile(m, spec)).toEqual(compile(meanings().targets.find(t => t.clauses.length === 1)!, spec));
  expect(() => normalizeMeaning({ ...m, seed: 1 })).toThrow();
  expect(() => compile({ clauses: [{ ...m.clauses[0], agent: { ...m.clauses[0].agent, count: 0 } }] }, spec)).toThrow();
  const swapped = structuredClone(m); [swapped.clauses[0].agent, swapped.clauses[0].patient] = [swapped.clauses[0].patient, swapped.clauses[0].agent];
  expect(compile(swapped, spec).utterance).not.toBe(compile(m, spec).utterance);
  for (const feature of ['plural', 'tense', 'negation'] as const) expect(() => compile(m, { ...spec, features: { ...spec.features, [feature]: false } })).toThrow();
});
it('rejects unknown versions, unsafe seeds, collisions and ambiguous clean scoring', () => {
  for (const seed of [-1, 1.5, 0x100000000, NaN]) expect(() => language(seed)).toThrow();
  expect(() => language(0, undefined, 'none', 'future')).toThrow();
  const spec = language(1); spec.lexicon.see = spec.lexicon.bird;
  expect(() => validateLanguage(spec)).toThrow('collision');
  const ambiguous = language(1, 'SVO', 'noun-homophone');
  expect(ambiguous.lexicon.robot).toBe(ambiguous.lexicon.bird);
  expect(() => compile(meanings().observations[0], ambiguous)).toThrow('unambiguous');
});
it('represents every integer 0–999 uniquely with independent arithmetic checks in bases 2–12', () => {
  for (let base = 2; base <= 12; base++) {
    const spec = { ...language(42), numberBase: base }, reverse = Object.fromEntries(Object.entries(spec.lexicon).map(([k, v]) => [v, k]));
    const seen = new Set<string>();
    for (let value = 0; value <= 999; value++) {
      const tokens = numberTokens(value, spec), decoded = tokens.map(t => reverse[t]); let at = 0;
      const evaluate = (): number => { const t = decoded[at++]; if (t === 'add') return evaluate() + evaluate(); if (t === 'multiply') return evaluate() * evaluate(); return t === 'radix' ? base : Number(t); };
      expect(evaluate()).toBe(value); expect(at).toBe(tokens.length); seen.add(tokens.join(' '));
    }
    expect(seen.size).toBe(1000);
  }
  expect(() => numberTokens(1000, language(1))).toThrow();
});
it('rejects malformed, extra, noncanonical and contradictory surface tokens', () => {
  const spec = language(10), item = compile(meanings().targets[0], spec);
  for (const s of ['', `${item.utterance} bad`, item.utterance.replace(spec.lexicon.plural, ''), item.utterance.replace(spec.lexicon.open, spec.lexicon.close)])
    expect(() => parseUtterance(s, spec)).toThrow();
});
it('keeps seed, private rules, unseen scenes and answers outside learner projections', () => {
  const data = dataset(42), view = learnerView(data), serialized = JSON.stringify(view);
  expect(Object.keys(view)).toEqual(['version', 'observations', 'challenges']);
  expect(view.challenges.every(c => Object.keys(c).join(',') === 'id,utterance')).toBe(true);
  for (const target of data.targets) expect(serialized).not.toContain(target.english);
  for (const key of ['seed', 'lexicon', 'family', 'adjectivePlacement', 'datasetHash', 'truth']) expect(serialized).not.toContain(`"${key}"`);
  view.observations[0].scene.clauses[0].agent.count = 99;
  expect(data.observations[0].truth.clauses[0].agent.count).not.toBe(99);
});
it('locks seed-disjoint splits and withheld structural families with versioned content hashes', () => {
  const manifest = splitManifest(), seeds = manifest.splits.flatMap(s => s.records.map(r => r.seed));
  expect(new Set(seeds).size).toBe(90);
  expect(manifest.splits[0].records.some(r => r.family === 'VSO')).toBe(false);
  expect(manifest.splits[1].records.some(r => r.family === 'VSO')).toBe(false);
  expect(manifest.splits[2].records.every(r => r.family === 'VSO')).toBe(true);
  const { observations, targets } = meanings(), seen = new Set(observations.map(semanticKey));
  expect(targets.some(t => seen.has(semanticKey(t)))).toBe(false);
  expect(dataset(10000).targets.map(t => t.english)).not.toEqual(dataset(20000).targets.map(t => t.english));
  const data = dataset(10000), vocabulary = new Set(data.observations.flatMap(o => o.utterance.split(' ')));
  expect(data.targets.every(t => t.utterance.split(' ').every(token => vocabulary.has(token)))).toBe(true);
  for (const split of manifest.splits) expect(hash(split.records)).toBe(split.sha256);
  expect(() => language(1, 'OSV' as Family)).toThrow();
});
