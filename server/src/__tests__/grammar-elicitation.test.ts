import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { ProfileStore } from '../services/profile-store.js';
import { GrammarElicitationSessions } from '../services/grammar-elicitation-sessions.js';
import { grammarReport, grammarSource, grammarEvidence, verifyGrammarElicitation } from '../services/grammar-elicitation-integrity.js';
import { elicitationHash } from '../services/elicitation-integrity.js';
import { ProjectArchives } from '../services/project-archive.js';
import { atomicWrite } from '../services/atomic-file.js';
import { grammarHistorySchema, grammarSetupSchema } from '../../../shared/schemas/grammar-elicitation.js';
import { grammarSessionReport } from '../../../engine/src/elicitation/grammar-session.js';
import request, { testSession } from './authenticated-request.js';
import anonymous from 'supertest';
import { createApp } from '../app.js';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-grammar-question-')); process.env.DATA_DIR = root; });
afterEach(async () => {
  delete process.env.DATA_DIR;
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('xeno-grammar-question-')) throw Error('Unsafe cleanup');
  await fs.rm(root, { recursive: true, force: true });
});
const at = '2026-10-01T00:00:00.000Z';
const noun = (id: string) => ({ kind: 'nominal' as const, nominal: { head: { entryId: id, sense: null, lemma: id, pos: 'noun' as const }, plural: false, adjectives: [] } });
const star = noun('star'), rock = noun('rock');
const plural = (m = star) => ({ ...m, nominal: { ...m.nominal, plural: true } });
const setup = grammarSetupSchema.parse({ candidates: [{ id: 'A', rule_ids: ['suffix'] }, { id: 'B', rule_ids: ['prefix'] }], anchors: [star, rock],
  available: [plural(star), plural(rock)].map(meaning => ({ kind: 'meaning', meaning, cost: 1 })) });
async function fixture(store = new ProfileStore()) {
  const original = await store.create({ name: 'Grounded comparison', description: 'Private unrelated notes',
    dictionary: ['star', 'rock'].map(id => ({ id, alien_word: id === 'star' ? 'nesh' : 'kor', english_meaning: id, part_of_speech: 'noun', confidence: null, context: '', examples: [], notes: 'Private lexical notes', created_at: at })),
    grammar_rules: [{ id: 'suffix', position: 'suffix', affix: '-en' }, { id: 'prefix', position: 'prefix', affix: 'en-' }].map(r => ({ id: r.id, rule: r.id, executable: { kind: 'plural-affix', position: r.position, affix: r.affix }, confidence: null, evidence: [], created_at: at })) });
  const sessions = new GrammarElicitationSessions(store), request = { expectedRevision: original.revision, mutationId: 'question', setup };
  const profile = await sessions.create(original.id, request), record = profile.grammar_elicitation_history![0];
  return { store, sessions, original, profile, record, request };
}
const decline = (revision: number, mutationId = 'decision') => ({ expectedRevision: revision, mutationId, action: 'decline', answer: null, reason: 'Cannot observe today.' });
const answer = (p: Awaited<ReturnType<typeof fixture>>['profile']) => {
  const meaning = grammarReport(p.grammar_elicitation_history![0]).selection!.meaning!;
  if (meaning.kind !== 'nominal') throw Error('Expected noun');
  return { expectedRevision: p.revision, mutationId: 'answer', action: 'answer', answer: (meaning.nominal.head.entryId === 'star' ? 'nesh' : 'kor') + '-en', reason: 'Independent observation.' };
};
it('records explicit grounding and complete alternatives without changing rules or capturing predicted forms', async () => {
  const { original, profile, record } = await fixture();
  expect(profile.grammar_rules).toEqual(original.grammar_rules); expect(profile.research).toEqual(original.research);
  expect(record.source_json).not.toContain('Private');
  expect(grammarReport(record)).toMatchObject({ remaining: ['A', 'B'], evidenceCount: 0, selection: { disagreementBits: 1 } });
  expect((await new GrammarElicitationSessions().list(profile.id)).states[0].canDecide).toBe(true);
  verifyGrammarElicitation(profile);
});
it('binds creation receipts to the exact setup and acknowledges retries across unrelated revisions and restart', async () => {
  const { store, profile, request } = await fixture();
  const changed = (await store.update(profile.id, { name: 'Renamed' }, profile.revision))!;
  expect((await new GrammarElicitationSessions().create(profile.id, request)).revision).toBe(changed.revision);
  await expect(new GrammarElicitationSessions().create(profile.id, { ...request, setup: { ...setup, available: [setup.available[0]] } })).rejects.toMatchObject({ code: 'MUTATION_ID_REUSED' });
});
it('captures an answer and reranks atomically, reuses evidence in the next question and never accepts a rule', async () => {
  const { profile, record, sessions } = await fixture(), request = answer(profile);
  const saved = await sessions.decide(profile.id, record.id, request);
  expect(saved.grammar_rules).toEqual(profile.grammar_rules); expect(saved.research.hypotheses).toHaveLength(0);
  expect(saved.research.observations[0].text).toBe(request.answer);
  expect(JSON.parse(saved.grammar_elicitation_history![0].decision!.after_json!)).toMatchObject({ remaining: ['A'], evidenceCount: 1, selection: null });
  const duplicate = await new GrammarElicitationSessions().decide(profile.id, record.id, request);
  expect(duplicate.revision).toBe(saved.revision); expect(duplicate.research.observations).toHaveLength(1);
  const next = await sessions.create(profile.id, { expectedRevision: saved.revision, mutationId: 'next', setup });
  expect(grammarReport(next.grammar_elicitation_history![1])).toMatchObject({ remaining: ['A'], evidenceCount: 1, selection: null });
  verifyGrammarElicitation(next);
});
it('retains novel answers and reports no surviving alternative rather than substituting a predicted answer', async () => {
  const { profile, record, sessions } = await fixture();
  const saved = await sessions.decide(profile.id, record.id, { ...answer(profile), answer: 'irregular unknown form' });
  expect(JSON.parse(saved.grammar_elicitation_history![0].decision!.after_json!)).toMatchObject({ remaining: [], selection: null });
  expect(saved.research.observations[0].text).toBe('irregular unknown form'); verifyGrammarElicitation(saved);
});
it('keeps unavailable evidence unresolved and never rewards it as a disagreement outcome', async () => {
  const { record } = await fixture(), source = grammarSource(record);
  source.context.candidates.push({ id: 'unknown', rules: [] });
  source.evidence.push({ meaning: plural(), answer: 'nesh-en', observation_id: 'capture' });
  const report = grammarSessionReport(source);
  expect(report.scores.find(c => c.id === 'unknown')).toMatchObject({ contradictions: 0, unavailable: 1 });
  expect(report.remaining).toEqual(['A', 'unknown']); expect(report.selection).toBeNull();
});
it('declines without adding evidence and excludes only that meaning at the unchanged input', async () => {
  const { profile, record, sessions } = await fixture();
  const saved = await sessions.decide(profile.id, record.id, decline(profile.revision));
  expect(saved.research).toEqual(profile.research); expect(saved.grammar_rules).toEqual(profile.grammar_rules);
  const next = await sessions.create(profile.id, { expectedRevision: saved.revision, mutationId: 'next', setup });
  expect(grammarReport(next.grammar_elicitation_history![1]).selection!.meaning).not.toEqual(grammarReport(record).selection!.meaning);
});
it('blocks stale lexical/rule inputs, revision races and cross-project application', async () => {
  const { store, profile, record, sessions, request } = await fixture();
  const renamed = (await store.update(profile.id, { name: 'Unrelated' }, profile.revision))!;
  expect((await sessions.list(profile.id)).states[0].canDecide).toBe(true);
  const changed = (await store.update(profile.id, { dictionary: renamed.dictionary.map(e => ({ ...e, alien_word: e.alien_word + 'x' })) }, renamed.revision))!;
  expect((await sessions.list(profile.id)).states[0].stale).toBe(true);
  await expect(sessions.decide(profile.id, record.id, decline(changed.revision))).rejects.toMatchObject({ code: 'ELICITATION_STALE' });
  await expect(sessions.create(profile.id, { ...request, mutationId: 'race' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  const other = await store.create({ name: 'Other' });
  await expect(sessions.decide(other.id, record.id, decline(other.revision))).rejects.toMatchObject({ code: 'ELICITATION_MISSING' });
});
it('serializes competing decisions and rejects changed decision receipts', async () => {
  const { profile, record, sessions } = await fixture();
  const results = await Promise.allSettled([sessions.decide(profile.id, record.id, answer(profile)), sessions.decide(profile.id, record.id, decline(profile.revision))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  await expect(sessions.decide(profile.id, record.id, { ...answer(profile), answer: 'different' })).rejects.toMatchObject({ code: 'MUTATION_ID_REUSED' });
});
it('rolls back failed writes without publishing a capture or decision and permits retry', async () => {
  let fail = false;
  const store = new ProfileStore(async (file, data, options) => { if (fail && path.dirname(file).endsWith('profiles')) throw Error('Injected failure'); return atomicWrite(file, data, options); });
  const { profile, record, sessions } = await fixture(store), request = answer(profile);
  fail = true; await expect(sessions.decide(profile.id, record.id, request)).rejects.toThrow('Injected failure');
  expect((await store.get(profile.id))!.research.observations).toHaveLength(0);
  fail = false; expect((await sessions.decide(profile.id, record.id, request)).research.observations).toHaveLength(1);
});
it('invalidates pending comparisons after evidence withdrawal while retaining the historical decision', async () => {
  const { store, profile, record, sessions } = await fixture();
  const answered = await sessions.decide(profile.id, record.id, answer(profile));
  const pending = await sessions.create(profile.id, { expectedRevision: answered.revision, mutationId: 'next', setup });
  const withdrawn = await store.commitResearchRecord(profile.id, pending.revision, p => ({ ...p, research: { ...p.research, events: [...p.research.events, { id: 'withdraw', created_at: at, kind: 'withdraw-observation', observation_id: p.research.observations[0].id, reason: 'Observation corrected' }] } }));
  expect(grammarEvidence(withdrawn, record.context_sha256)).toHaveLength(0);
  expect((await sessions.list(profile.id)).states[1].stale).toBe(true); verifyGrammarElicitation(withdrawn);
});
it('protects metadata, rejects forged replay and preserves bounded history', async () => {
  const { store, profile, record, sessions } = await fixture();
  expect((await store.update(profile.id, { grammar_elicitation_history: [] }, profile.revision))!.grammar_elicitation_history).toHaveLength(1);
  const forged = structuredClone(profile), r = forged.grammar_elicitation_history![0], report = grammarReport(r);
  report.selection!.disagreementBits = 99; r.report_json = JSON.stringify(report); r.report_sha256 = elicitationHash(r.report_json);
  expect(() => verifyGrammarElicitation(forged)).toThrow();
  expect(grammarHistorySchema.safeParse(Array(21).fill(record)).success).toBe(false);
  const current = (await store.get(profile.id))!;
  const full = await store.commitResearchRecord(profile.id, current.revision, p => ({ ...p, grammar_elicitation_history: Array.from({ length: 20 }, (_, i) => ({ ...record, id: `record-${i}`, request_id: `request-${i}` })) }));
  await expect(sessions.create(profile.id, { expectedRevision: full.revision, mutationId: 'overflow', setup })).rejects.toMatchObject({ code: 'ELICITATION_HISTORY_LIMIT' });
});
it('restores exact historical snapshots and remapped answer captures with no executable pending decisions', async () => {
  const { profile, record, sessions } = await fixture();
  const pending = await sessions.create(profile.id, { expectedRevision: profile.revision, mutationId: 'pending', setup });
  const saved = await sessions.decide(profile.id, record.id, answer(pending));
  const archives = new ProjectArchives(), exported = await archives.export(profile.id, saved.revision, false), bytes = await fs.readFile(exported.file); await exported.dispose();
  const preview = await archives.inspect(Readable.from([bytes])), restored = (await archives.restore(preview.token, { mode: 'new' })).profile;
  expect(restored.grammar_elicitation_history![0].source_json).toBe(record.source_json);
  expect(restored.grammar_elicitation_history![0].decision!.observation_id).toBe(restored.research.observations[0].id);
  expect(restored.research.observations[0].id).not.toBe(saved.research.observations[0].id);
  expect((await sessions.list(restored.id)).states.every(s => !s.canDecide)).toBe(true); verifyGrammarElicitation(restored);
});
it('enforces authentication and strict grounding without hidden answers at the HTTP boundary', async () => {
  const { original } = await fixture(), app = createApp(testSession);
  expect((await anonymous(app).get(`/api/grammar-elicitation/${original.id}`)).status).toBe(401);
  expect((await request(app).post(`/api/grammar-elicitation/${original.id}`).send({ expectedRevision: 1, mutationId: 'http', setup, hiddenAnswer: 'secret' })).status).toBe(400);
  const current = (await request(app).get(`/api/grammar-elicitation/${original.id}`)).body.profile;
  const made = await request(app).post(`/api/grammar-elicitation/${original.id}`).send({ expectedRevision: current.revision, mutationId: 'http', setup });
  expect(made.status).toBe(200);
  const r = made.body.profile.grammar_elicitation_history[1];
  expect((await request(app).post(`/api/grammar-elicitation/${original.id}/${r.id}/decision`).send(decline(made.body.profile.revision))).status).toBe(200);
});
