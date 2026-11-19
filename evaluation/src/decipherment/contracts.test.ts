import { describe, expect, it } from 'vitest';
import { PROTOCOL, learnerView, privateEpisodeSchema, episodeSchema, type PrivateEpisode } from './contracts.js';
import { scoreEpisode, summarizeItems } from './score.js';

function fixture(): PrivateEpisode {
  return { learner: { protocol: PROTOCOL, id: 'episode-a', task: 'segmentation',
    budgets: { maxToolCalls: 8, maxOutputTokens: 2048, timeoutMs: 30000 },
    observations: [{ id: 'o1', surface: 'ab', segments: ['a', 'b'] }],
    challenges: [{ id: 'c1', surface: 'abab' }, { id: 'c2', surface: 'ab' }, { id: 'c3', surface: 'x' }] },
  provenance: { generator: 'independent-v1', lineage: 'secret-lineage', split: 'development',
    mechanisms: ['dictionary'], source: 'independent-fixture' },
  truth: [
    { id: 'c1', status: 'identified', acceptable: [['a', 'b', 'a', 'b']] },
    { id: 'c2', status: 'ambiguous', acceptable: [['a', 'b'], ['ab']] },
    { id: 'c3', status: 'insufficient', acceptable: [] },
  ] };
}

describe('decipherment evidence boundary', () => {
  it('projects independent learner records without truth, lineage, split or aliases', () => {
    const raw = fixture(), view = learnerView(raw), serialized = JSON.stringify(view);
    for (const secret of ['truth', 'acceptable', 'provenance', 'secret-lineage', 'development', 'mechanisms'])
      expect(serialized).not.toContain(secret);
    if (view.task === 'segmentation') view.observations[0].segments[0] = 'changed';
    expect(raw.learner.observations[0]).toEqual({ id: 'o1', surface: 'ab', segments: ['a', 'b'] });
  });
  it('rejects extra private fields, duplicate identifiers and malformed truth', () => {
    expect(episodeSchema.safeParse({ ...fixture().learner, seed: 42 }).success).toBe(false);
    const repeated = fixture(); repeated.learner.challenges[0].id = 'o1';
    expect(privateEpisodeSchema.safeParse(repeated).success).toBe(false);
    const missing = fixture(); missing.truth.pop();
    expect(privateEpisodeSchema.safeParse(missing).success).toBe(false);
    const bad = fixture(); bad.truth[0].acceptable = [['different']];
    expect(privateEpisodeSchema.safeParse(bad).success).toBe(false);
    const ambiguous = fixture(); ambiguous.truth[1].acceptable = [['a', 'b']];
    expect(privateEpisodeSchema.safeParse(ambiguous).success).toBe(false);
    const duplicate = fixture(); duplicate.truth[1].acceptable = [['ab'], ['ab']];
    expect(privateEpisodeSchema.safeParse(duplicate).success).toBe(false);
  });
  it('requires explicit meaning inventories and separates ungrounded lexical evidence', () => {
    const learner = { protocol: PROTOCOL, id: 'l1', task: 'lexical',
      budgets: fixture().learner.budgets, meaningCandidates: ['sun', 'moon'],
      formCandidates: ['pa', 'ku'],
      observations: [], challenges: [{ id: 'c1', form: 'pa' }] };
    expect(episodeSchema.safeParse(learner).success).toBe(true);
    expect(episodeSchema.safeParse({ ...learner, observations: [{ id: 'o1', form: 'pa', meaning: 'water' }] }).success).toBe(false);
    expect(episodeSchema.safeParse({ ...learner, meaningCandidates: ['sun', 'sun'] }).success).toBe(false);
  });
});

describe('decipherment scoring', () => {
  const answer = { id: 'c1', kind: 'answer', value: ['a', 'b', 'a', 'b'], confidence: 0.8, evidenceIds: ['o1'] };
  it('scores exact predictions and explicit uncertainty without rewarding hidden-answer guessing', () => {
    const scores = scoreEpisode(fixture(), { status: 'complete', response: { protocol: PROTOCOL, predictions: [
      answer, { id: 'c2', kind: 'alternatives', values: [['ab'], ['a', 'b']], evidenceIds: ['o1'] },
      { id: 'c3', kind: 'abstain', reason: 'insufficient-evidence' },
    ] } });
    expect(scores.every(s => s.success)).toBe(true);
    expect(scores[0].brier).toBeCloseTo(0.04);
    const guessed = scoreEpisode(fixture(), { status: 'complete', response: { protocol: PROTOCOL,
      predictions: [{ ...answer, id: 'c2', value: ['a', 'b'] }] } });
    expect(guessed[1]).toMatchObject({ success: false, falseClaim: true });
  });
  it('recognizes ambiguity abstention but does not reward blanket abstention on solvable items', () => {
    const scores = scoreEpisode(fixture(), { status: 'complete', response: { protocol: PROTOCOL,
      predictions: fixture().truth.map(t => ({ id: t.id, kind: 'abstain', reason: 'ambiguity' })) } });
    expect(scores.map(s => s.success)).toEqual([false, true, false]);
    expect(summarizeItems(scores)).toMatchObject({ identifiedAccuracy: 0, identifiedAnswerCoverage: 0 });
  });
  it('does not confuse valid citation IDs with support and rejects fabricated citations', () => {
    const scores = scoreEpisode(fixture(), { status: 'complete', response: { protocol: PROTOCOL,
      predictions: [{ ...answer, value: ['abab'] }, { ...answer, id: 'c3', value: ['x'] }] } });
    expect(scores[0]).toMatchObject({ evidenceReferencesValid: true, success: false, falseClaim: true });
    const bad = scoreEpisode(fixture(), { status: 'complete', response: { protocol: PROTOCOL,
      predictions: [{ ...answer, evidenceIds: ['private-target'] }] } });
    expect(bad[0]).toMatchObject({ evidenceReferencesValid: false, success: false, falseClaim: true });
  });
  it('retains timeout, invalid, duplicate, unknown-ID and missing outputs in denominators', () => {
    for (const response of [
      { protocol: PROTOCOL, predictions: [answer, answer] },
      { protocol: PROTOCOL, predictions: [{ ...answer, id: 'not-a-challenge' }] },
      { protocol: PROTOCOL, predictions: [{ ...answer, confidence: 1.1 }] },
      'plausible explanation',
    ]) expect(scoreEpisode(fixture(), { status: 'complete', response }).every(s => s.outcome === 'invalid')).toBe(true);
    const missing = scoreEpisode(fixture(), { status: 'complete', response: { protocol: PROTOCOL, predictions: [] } });
    expect(summarizeItems(missing)).toMatchObject({ scheduled: 3, failures: 3, success: 0 });
    expect(scoreEpisode(fixture(), { status: 'timeout' }).every(s => s.outcome === 'timeout')).toBe(true);
    expect(scoreEpisode(fixture(), { status: 'error' }).every(s => s.outcome === 'error')).toBe(true);
  });
  it('does not allow ambiguous sets with invented alternatives or inconsistent segments', () => {
    const scores = scoreEpisode(fixture(), { status: 'complete', response: { protocol: PROTOCOL,
      predictions: [{ id: 'c2', kind: 'alternatives', values: [['ab'], ['x']], evidenceIds: [] }] } });
    expect(scores[1]).toMatchObject({ success: false, falseClaim: true });
  });
});
