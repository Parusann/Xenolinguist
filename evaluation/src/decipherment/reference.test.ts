import { expect, it } from 'vitest';
import { PROTOCOL, privateEpisodeSchema, type Episode, type PrivateEpisode } from './contracts.js';
import { referenceAnswers, inferTruth } from './reference.js';
import { auditSplits, createCorpus, digest } from './corpus.js';

const base = { protocol: PROTOCOL, id: 'independent',
  budgets: { maxToolCalls: 8, maxOutputTokens: 2048, timeoutMs: 90000 } };

it('matches independently written segmentation, Unicode and insufficiency cases', () => {
  const episode: Episode = { ...base, task: 'segmentation', observations: [
    { id: 'o0', surface: '猫山', segments: ['猫', '山'] },
    { id: 'o1', surface: '猫山水', segments: ['猫山', '水'] },
  ], challenges: [{ id: 'c0', surface: '猫山' }, { id: 'c1', surface: '水猫' }, { id: 'c2', surface: '火' }] };
  expect(referenceAnswers(episode, 'c0')).toEqual([['猫', '山'], ['猫山']]);
  expect(referenceAnswers(episode, 'c1')).toEqual([['水', '猫']]);
  expect(referenceAnswers(episode, 'c2')).toEqual([]);
  expect(inferTruth(episode).map(t => t.status)).toEqual(['ambiguous', 'identified', 'insufficient']);
});

it('does not silently truncate exponentially ambiguous segmentations into unique truth', () => {
  const episode: Episode = { ...base, task: 'segmentation',
    observations: [{ id: 'o0', surface: 'aaa', segments: ['a', 'aa'] }],
    challenges: [{ id: 'c0', surface: 'aaaaaaaaaaaa' }] };
  expect(referenceAnswers(episode, 'c0')).toHaveLength(17);
  expect(inferTruth(episode)[0].status).toBe('insufficient');
});

it('derives lexical elimination and refuses contradictory anchors', () => {
  const e: Episode = { ...base, task: 'lexical', formCandidates: ['ka', 'tu', 'mi'],
    meaningCandidates: ['sun', 'moon', 'water'],
    observations: [{ id: 'o0', form: 'ka', meaning: 'moon' }, { id: 'o1', form: 'mi', meaning: 'sun' }],
    challenges: [{ id: 'c0', form: 'tu' }] };
  expect(referenceAnswers(e, 'c0')).toEqual([['water']]);
  e.observations.pop();
  expect(referenceAnswers(e, 'c0')).toEqual([['sun'], ['water']]);
  e.observations.push({ id: 'o2', form: 'mi', meaning: 'moon' });
  expect(referenceAnswers(e, 'c0')).toEqual([]);
});

it('checks positional replacement with independent examples and preserves multiple hypotheses', () => {
  const e: Episode = { ...base, task: 'correspondence',
    observations: [{ id: 'o0', source: ['p'], target: ['f'] }, { id: 'o1', source: ['a'], target: ['a'] }],
    challenges: [{ id: 'c0', source: ['p', 'a', 'p'] }] };
  expect(referenceAnswers(e, 'c0')).toEqual([['f', 'a', 'f'], ['f', 'a', 'p'], ['p', 'a', 'f']]);
  e.observations.push({ id: 'o2', source: ['p', 'a', 'p'], target: ['p', 'a', 'f'] });
  expect(referenceAnswers(e, 'c0')).toEqual([['p', 'a', 'f']]);
});

it('independently checks prefix/suffix ambiguity and feature-set matching', () => {
  const e: Episode = { ...base, task: 'morphology', observations: [
    { id: 'o0', lemma: 'a', features: ['plural', 'subject'], form: 'aa' },
  ], challenges: [{ id: 'c0', lemma: 'b', features: ['subject', 'plural'] },
    { id: 'c1', lemma: 'b', features: ['past'] }] };
  expect(referenceAnswers(e, 'c0')).toEqual([['ab'], ['ba']]);
  expect(referenceAnswers(e, 'c1')).toEqual([]);
});

it('reproduces each split and keeps lineages and reserved mechanisms separate', () => {
  const corpora = { train: createCorpus('train'), development: createCorpus('development'), final: createCorpus('final') };
  expect(auditSplits(corpora)).toMatchObject({ passed: true, lineages: 40 });
  expect(corpora.train).toHaveLength(144); expect(corpora.development).toHaveLength(48); expect(corpora.final).toHaveLength(48);
  expect(digest(corpora.development)).toBe(digest(createCorpus('development')));
  const states = new Set(corpora.development.flatMap(e => e.truth.map(t => t.status)));
  expect([...states].sort()).toEqual(['ambiguous', 'identified', 'insufficient']);
  for (const split of Object.values(corpora)) for (const e of split) expect(privateEpisodeSchema.safeParse(e).success).toBe(true);
});

it('rejects lineage reuse, learner-equivalent cross-split records and wrong partition labels', () => {
  const corpora = { train: createCorpus('train').slice(0, 1), development: createCorpus('development').slice(0, 1), final: [] as PrivateEpisode[] };
  const wrong = structuredClone(corpora);
  wrong.development[0].provenance.lineage = wrong.train[0].provenance.lineage;
  expect(() => auditSplits(wrong)).toThrow('Lineage crosses');
  const duplicate = structuredClone(corpora);
  duplicate.development[0] = { ...structuredClone(duplicate.train[0]),
    provenance: { ...duplicate.development[0].provenance }, learner: { ...duplicate.train[0].learner, id: 'different-id' } };
  expect(() => auditSplits(duplicate)).toThrow('Duplicate learner problem');
  corpora.development[0].provenance.split = 'train';
  expect(() => auditSplits(corpora)).toThrow('Split label');
});
