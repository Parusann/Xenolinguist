import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createDefaultProfile } from '../../../shared/constants.js';
import { parseProfile } from '../../../shared/schemas/profile.js';
import type { LanguageProfile, Observation, Hypothesis } from '../../../shared/types.js';
import { hypothesisState } from '../evidence/graph.js';
import { evidenceCounts } from '../evidence/scores.js';
import { dependency, staleReasons, translationDependencies } from '../evidence/dependencies.js';
import { derive } from '../translation/derive.js';
const now = '2026-09-25T00:00:00.000Z';
export const observation = (id = 'capture', text = 'tal'): Observation => ({ id, created_at: now, text,
  content_sha256: createHash('sha256').update(text).digest('hex'), source: 'field recording', source_id: null, origin: 'capture', derived_from: [], audio: null });
export function researchProfile(): LanguageProfile {
  const p = parseProfile({ ...createDefaultProfile(), id: 'project', created_at: now, updated_at: now, dictionary: [{
    id: 'word', alien_word: 'tal', english_meaning: 'sky', part_of_speech: 'noun', confidence: null, context: '', examples: [], notes: '', created_at: now,
  }] });
  const h: Hypothesis = { id: 'hypothesis', created_at: now, label: 'tal means sky', content: { kind: 'lexical', entry_id: 'word', form: 'tal', meaning: 'sky' },
    manual_belief: null, provenance: 'user', score_definition: 'evidence-counts-1', supersedes: null };
  p.research.observations.push(observation()); p.research.hypotheses.push(h);
  p.research.links.push({ id: 'link', created_at: now, hypothesis_id: h.id, observation_id: 'capture', annotation_id: null, span: { start: 0, end: 3 }, relation: 'supports', note: '' });
  return p;
}
describe('research evidence graph', () => {
  it('deduplicates repeated captures and model restatements while retaining contradictions', () => {
    const p = researchProfile();
    p.research.observations.push(observation('duplicate', ' TAL '), { ...observation('model', 'a confident paraphrase'), origin: 'model-restatement', derived_from: ['capture'] });
    for (const id of ['duplicate', 'model']) p.research.links.push({ ...p.research.links[0], id: `link-${id}`, observation_id: id });
    p.research.links.push({ ...p.research.links[0], id: 'contradiction', relation: 'contradicts' });
    expect(evidenceCounts(parseProfile(p), 'hypothesis')).toEqual({ definition: 'evidence-counts-1', supports: 1, contradicts: 1, ambiguous: 0, staleLinks: 0 });
    expect(hypothesisState(p, p.research.hypotheses[0]).state).toBe('proposed');
  });
  it('invalidates dependent hypotheses and snapshots after a correction, retaining the original result', () => {
    const p = researchProfile(), h = p.research.hypotheses[0];
    const record = { profile_revision: p.revision, dependencies: [dependency(p, 'hypothesis', h.id)] };
    p.research.annotations.push({ id: 'a1', created_at: now, observation_id: 'capture', revision: 1, supersedes: null, interpretation: 'water, not sky', provenance: 'user' });
    expect(hypothesisState(p, h).state).toBe('invalidated');
    expect(staleReasons(p, record)).toHaveLength(1);
    expect(evidenceCounts(p, h.id)).toMatchObject({ supports: 0, staleLinks: 1 });
    expect(p.research.observations[0].text).toBe('tal');
  });
  it('propagates withdrawal through restatements without touching unrelated hypotheses', () => {
    const p = researchProfile(), h = p.research.hypotheses[0];
    p.research.observations.push({ ...observation('child'), derived_from: ['capture'], origin: 'model-restatement' });
    p.research.links[0].observation_id = 'child';
    const unrelated = { ...h, id: 'unrelated' }; p.research.hypotheses.push(unrelated);
    p.research.events.push({ id: 'withdraw', created_at: now, kind: 'withdraw-observation', observation_id: 'capture', reason: 'bad source' });
    expect(hypothesisState(p, h).state).toBe('invalidated');
    expect(hypothesisState(p, unrelated).state).toBe('proposed');
  });
  it('invalidates restated evidence when a parent interpretation is corrected', () => {
    const p = researchProfile();
    p.research.observations.push({ ...observation('child'), derived_from: ['capture'], origin: 'model-restatement' });
    p.research.links[0].observation_id = 'child';
    p.research.annotations.push({ id: 'a1', created_at: now, observation_id: 'capture', revision: 1, supersedes: null, interpretation: 'corrected source', provenance: 'user' });
    expect(hypothesisState(p, p.research.hypotheses[0]).state).toBe('invalidated');
    expect(evidenceCounts(p, 'hypothesis').supports).toBe(0);
  });
  it('tracks rule inventories and negative lexical evidence but ignores unrelated profile notes', () => {
    const p = researchProfile();
    const run = { profile_revision: 0, dependencies: translationDependencies(p), result: derive('tal', p) };
    p.description = 'new notebook note'; p.revision++;
    expect(staleReasons(p, run)).toEqual([]);
    p.dictionary.push({ ...p.dictionary[0], id: 'competing', english_meaning: 'water' });
    expect(staleReasons(p, run)).toEqual(['lexicon changed']);
    expect(run.result.candidates).toHaveLength(1);
    expect(derive('tal', p).candidates).toHaveLength(2);
  });
  it('rejects cycles, missing references, bad spans, annotation gaps and invalid status transitions', () => {
    for (const mutate of [
      (p: LanguageProfile) => { p.research.observations[0].derived_from = ['capture']; },
      (p: LanguageProfile) => { p.research.links[0].hypothesis_id = 'missing'; },
      (p: LanguageProfile) => { p.research.links[0].span!.end = 4; },
      (p: LanguageProfile) => { p.research.annotations.push({ id: 'a', created_at: now, observation_id: 'capture', revision: 2, supersedes: null, interpretation: '', provenance: 'user' }); },
      (p: LanguageProfile) => { for (const [i, status] of (['rejected', 'accepted'] as const).entries()) p.research.events.push({ id: `event${i}`, created_at: now, kind: 'hypothesis-status', hypothesis_id: 'hypothesis', status, reason: 'decision' }); },
    ]) { const p = researchProfile(); mutate(p); expect(() => parseProfile(p)).toThrow(); }
  });
});
