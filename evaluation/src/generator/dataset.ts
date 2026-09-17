import { createHash } from 'node:crypto';
import type { Family, LearnerInput, Meaning } from '../../../engine/src/types.js';
import { language } from './lexicon.js';
import { compile } from './compile.js';
import { GENERATOR_VERSION, prng, shuffle } from './prng.js';
import { NOUNS, ACTIONS, semanticKey } from './semantics.js';
export const DATASET_VERSION = 'xeno-dataset-1' as const;
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const entity = (noun: Meaning['clauses'][number]['agent']['noun'], count = 1, attributes: Meaning['clauses'][number]['agent']['attributes'] = []) => ({ noun, count, attributes });
/** Fixed compositions: all atoms occur in observations, target combinations never do. */
export function meanings(seed = 0) {
  const random = prng((seed ^ 0xa9b4c37d) >>> 0);
  const observations: Meaning[] = NOUNS.flatMap((noun, i) => ACTIONS.map(action => ({ clauses: [{ agent: entity(noun), action,
    patient: entity(NOUNS[(i + 1) % NOUNS.length]), tense: 'present' as const, negated: false }] })));
  for (let count = 2; count <= 12; count++) observations.push({ clauses: [{ agent: entity('bird', count), action: 'see', patient: entity('robot'), tense: 'present', negated: false }] });
  for (const attribute of ['red', 'small'] as const) observations.push({ clauses: [{ agent: entity('fox', 1, [attribute]), action: 'help', patient: entity('child'), tense: 'present', negated: false }] });
  for (const tense of ['past', 'future'] as const) observations.push({ clauses: [{ agent: entity('robot'), action: 'follow', patient: entity('fox'), tense, negated: false }] });
  observations.push({ clauses: [{ agent: entity('child'), action: 'see', patient: entity('bird'), tense: 'present', negated: true }] });
  observations.push({ clauses: [...observations[0].clauses, ...observations[4].clauses] });
  const nouns = shuffle(NOUNS, random), counts = shuffle([5, 9, 13, 17], random);
  const targets: Meaning[] = nouns.map((noun, i) => ({ clauses: [{ agent: entity(noun, counts[i], ['red', 'small']), action: ACTIONS[Math.floor(random() * 3)],
    patient: entity(nouns[(i + 1 + Math.floor(random() * 3)) % 4], 2, ['small']), tense: random() < 0.5 ? 'future' : 'past', negated: true }] }));
  const paired = shuffle(targets, random);
  targets.push({ clauses: [...paired[0].clauses, ...paired[1].clauses] });
  return { observations: shuffle(observations, random), targets: shuffle(targets, random) };
}
export function dataset(seed: number, family?: Family, version: string = GENERATOR_VERSION) {
  const spec = language(seed, family, 'none', version), source = meanings(seed);
  const observations = source.observations.map((m, i) => ({ id: `o-${i}`, ...compile(m, spec) }));
  const targets = source.targets.map((m, i) => ({ id: `c-${i}`, ...compile(m, spec) }));
  const surfaces = new Map<string, string>();
  for (const item of [...observations, ...targets]) {
    const key = semanticKey(item.truth), previous = surfaces.get(item.utterance);
    if (previous && previous !== key) throw new Error('Contradictory surface collision'); surfaces.set(item.utterance, key);
  }
  const seen = new Set(observations.map(o => semanticKey(o.truth)));
  if (targets.some(t => seen.has(semanticKey(t.truth)))) throw new Error('Composition leakage');
  const vocabulary = new Set(observations.flatMap(o => o.utterance.split(' ')));
  if (targets.some(t => t.utterance.split(' ').some(token => !vocabulary.has(token)))) throw new Error('Unobserved target token');
  const content = { version: DATASET_VERSION, spec, observations, targets };
  return { ...content, sha256: hash(content) };
}
export type Dataset = ReturnType<typeof dataset>;
/** Explicit allowlist projection; never spread a private item into a learner message. */
export function learnerView(data: Dataset): LearnerInput {
  return { version: GENERATOR_VERSION,
    observations: data.observations.map(o => ({ id: o.id, utterance: o.utterance, english: o.english, scene: structuredClone(o.truth) })),
    challenges: data.targets.map(t => ({ id: t.id, utterance: t.utterance })) };
}
/** Locked manifest v1: disjoint seed namespaces; VSO is held out structurally. No scores implied. */
export function splitManifest() {
  const splits = (['development', 'evaluation', 'structural'] as const).map((name, group) => {
    const records = Array.from({ length: 30 }, (_, i) => { const seed = (group + 1) * 10000 + i;
      const family: Family = group === 2 ? 'VSO' : i % 2 ? 'SOV' : 'SVO';
      return { seed, family, sha256: dataset(seed, family).sha256 }; });
    return { name, records, sha256: hash(records) };
  });
  return { version: DATASET_VERSION, generatorVersion: GENERATOR_VERSION, splits, sha256: hash(splits) };
}
