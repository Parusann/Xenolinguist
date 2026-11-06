import { createHash } from 'node:crypto';
import { prng, shuffle } from '../generator/prng.js';
import { PROTOCOL, learnerView, privateEpisodeSchema, type Episode, type PrivateEpisode } from './contracts.js';
import { inferTruth } from './reference.js';

export const CORPUS_VERSION = 'decipherment-corpus-1';
export type Split = PrivateEpisode['provenance']['split'];
export const SPLITS: Record<Split, { start: number; lineages: number }> = {
  train: { start: 1100000, lineages: 24 },
  development: { start: 2200000, lineages: 8 },
  final: { start: 3300000, lineages: 8 },
};
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const budgets = { maxToolCalls: 8, maxOutputTokens: 2048, timeoutMs: 90000 };

function complete(learner: Episode, split: Split, lineage: string, mechanisms: string[]): PrivateEpisode {
  return privateEpisodeSchema.parse({ learner, truth: inferTruth(learner),
    provenance: { generator: CORPUS_VERSION, lineage, split, mechanisms, source: 'synthetic' } });
}

/** Fresh symbol combinations, not natural-language claims; no OCR or Unicode normalization trick. */
function family(seed: number, split: Split): PrivateEpisode[] {
  const random = prng(seed), lineage = 'lineage-' + seed;
  const alphabet = shuffle(Array.from('ptkmnsrlabdefghuivowzθʃŋɣ'), random);
  const symbol = () => alphabet[Math.floor(random() * alphabet.length)];
  const words = new Set<string>();
  while (words.size < 12) words.add(symbol() + symbol() + symbol());
  const [a, b, c, d, x, y, p, q, r, s] = [...words];
  const base = { protocol: PROTOCOL, id: 'pending', budgets };
  const results: PrivateEpisode[] = [];
  const segmentation: Episode = { ...base, task: 'segmentation',
    observations: [
      { id: 'o0', surface: c + a, segments: [c, a] },
      { id: 'o1', surface: d + b, segments: [d, b] },
      { id: 'o2', surface: a + b + c, segments: [a + b, c] },
    ],
    challenges: [{ id: 'c0', surface: c + d }, { id: 'c1', surface: a + b + d }, { id: 'c2', surface: x + y }] };
  results.push(complete(segmentation, split, lineage, ['substitution-script', 'removed-boundaries']));

  // Separate inventory permutations prevent positional matching from revealing the bijection.
  const forms = [a, b, c, d], meanings = shuffle(['sun', 'moon', 'water', 'stone'], random);
  for (const anchors of [3, 2]) {
    const lexical: Episode = { ...base, task: 'lexical',
      formCandidates: shuffle(forms, random), meaningCandidates: shuffle(meanings, random),
      observations: forms.slice(0, anchors).map((form, i) => ({ id: 'o' + i, form, meaning: meanings[i] })),
      challenges: [{ id: 'c0', form: d }, { id: 'c1', form: x }] };
    results.push(complete(lexical, split, lineage, ['lexical-bijection', anchors === 3 ? 'anchored' : 'ambiguous-anchors']));
  }

  const [from, to, other, fourth] = alphabet;
  // Final contains the position-specific rule absent from train/development.
  const position = split === 'final' ? 'final' : seed % 2 ? 'initial' : 'all';
  const transform = (source: string[]) => source.map((token, i) =>
    token === from && (position === 'all' || (position === 'initial' ? i === 0 : i === source.length - 1)) ? to : token);
  const sources = [[from, other, from], [other, from, fourth], [fourth, other, from], [other, fourth]];
  const correspondence: Episode = { ...base, task: 'correspondence',
    observations: sources.map((source, i) => ({ id: 'o' + i, source, target: transform(source) })),
    challenges: [{ id: 'c0', source: [from, fourth, from] }, { id: 'c1', source: ['unseen'] }] };
  results.push(complete(correspondence, split, lineage, ['replacement-' + position]));
  // A one-symbol observation cannot distinguish all/initial/final replacement.
  results.push(complete({ ...base, task: 'correspondence',
    observations: [{ id: 'o0', source: [from], target: [to] }, { id: 'o1', source: [other], target: [other] }],
    challenges: [{ id: 'c0', source: [from, other, from] }] }, split, lineage, ['position-ambiguity']));

  const prefix = split === 'final' || seed % 2 === 0 ? alphabet[4] : '';
  const suffix = split === 'final' || seed % 2 === 1 ? alphabet[5] : '';
  const morphology: Episode = { ...base, task: 'morphology',
    observations: [
      { id: 'o0', lemma: p, features: ['plural'], form: prefix + p + suffix },
      { id: 'o1', lemma: q, features: ['plural'], form: prefix + q + suffix },
      { id: 'o2', lemma: alphabet[6], features: ['past'], form: alphabet[6] + alphabet[6] },
    ],
    challenges: [
      { id: 'c0', lemma: r, features: ['plural'] },
      { id: 'c1', lemma: s, features: ['past'] },
      { id: 'c2', lemma: x, features: ['future'] },
    ] };
  results.push(complete(morphology, split, lineage, [split === 'final' ? 'circumfix' : prefix ? 'prefix' : 'suffix', 'affix-ambiguity']));

  // Reorder observations/challenges and reassign local IDs; truth status must not be encoded by position.
  return results.map(e => {
    const observations = shuffle<Episode['observations'][number]>(e.learner.observations, random).map((o, i) => ({ ...o, id: 'o' + i }));
    const challenges = shuffle<Episode['challenges'][number]>(e.learner.challenges, random).map((c, i) => ({ ...c, id: 'c' + i }));
    const learner = { ...e.learner, observations, challenges } as Episode;
    return complete(learner, split, lineage, e.provenance.mechanisms);
  });
}

export function createCorpus(split: Split): PrivateEpisode[] {
  if (!Object.hasOwn(SPLITS, split)) throw new Error('Unknown corpus split');
  const plan = SPLITS[split];
  const families = Array.from({ length: plan.lineages }, (_, i) => family(plan.start + i, split)).flat();
  return shuffle(families, prng(plan.start ^ 0x5c2f8e31)).map((episode, i) =>
    privateEpisodeSchema.parse({ ...episode, learner: { ...episode.learner, id: 'e' + i } }));
}

export function problemDigest(e: Episode) {
  const observations = e.observations.map(({ id: _id, ...o }) => o)
    .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  const challenges = e.challenges.map(({ id: _id, ...c }) => c)
    .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  return digest({ task: e.task, observations, challenges,
    ...(e.task === 'lexical' ? { forms: [...e.formCandidates].sort(), meanings: [...e.meaningCandidates].sort() } : {}) });
}

/** Structural audits only; does not run a learner or score reserved final predictions. */
export function auditSplits(corpora: Record<Split, PrivateEpisode[]>) {
  const lineages = new Map<string, Split>(), problems = new Map<string, Split>();
  for (const split of Object.keys(SPLITS) as Split[]) {
    const ids = new Set<string>();
    for (const raw of corpora[split]) {
      const e = privateEpisodeSchema.parse(raw);
      if (e.provenance.split !== split || ids.has(e.learner.id)) throw new Error('Split label or episode ID mismatch');
      ids.add(e.learner.id);
      const prior = lineages.get(e.provenance.lineage);
      if (prior && prior !== split) throw new Error('Lineage crosses splits');
      lineages.set(e.provenance.lineage, split);
      const problem = problemDigest(learnerView(e)), previous = problems.get(problem);
      if (previous && previous !== split) throw new Error('Duplicate learner problem across splits');
      problems.set(problem, split);
      if (split !== 'final' && e.provenance.mechanisms.some(m => ['circumfix', 'replacement-final'].includes(m)))
        throw new Error('Reserved mechanism leaked into development or training');
    }
  }
  return { passed: true, lineages: lineages.size,
    splits: Object.fromEntries((Object.keys(SPLITS) as Split[]).map(s => [s, { episodes: corpora[s].length, sha256: digest(corpora[s]) }])) };
}
