import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { ProfileStore } from '../services/profile-store.js';
import { ElicitationSessions } from '../services/elicitation-sessions.js';
import { elicitationReport, verifyElicitation, elicitationHash } from '../services/elicitation-integrity.js';
import { ProjectArchives } from '../services/project-archive.js';
import { atomicWrite } from '../services/atomic-file.js';
import { elicitationHistorySchema } from '../../../shared/schemas/elicitation-records.js';
import request, { testSession } from './authenticated-request.js';
import anonymous from 'supertest';
import { createApp } from '../app.js';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-elicitation-')); process.env.DATA_DIR = root; });
afterEach(async () => {
  delete process.env.DATA_DIR;
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('xeno-elicitation-')) throw Error('Unsafe cleanup');
  await fs.rm(root, { recursive: true, force: true });
});
const mappings = { 1: 'ra', 2: 'ru', 3: 'ri', 5: 'ka', 6: 'ka ra', 7: 'ka ru' };
async function fixture(store = new ProfileStore()) {
  const original = await store.create({ name: 'Elicitation', description: 'Private unrelated notes', number_system: { base: null, operators: {}, mappings } });
  const sessions = new ElicitationSessions(store);
  const request = { expectedRevision: original.revision, mutationId: 'create-question' };
  const profile = await sessions.create(original.id, request), record = profile.elicitation_history![0];
  return { store, sessions, original, profile, record, request };
}
const decline = (revision: number, mutationId = 'decide-question') => ({ expectedRevision: revision, mutationId, action: 'decline', answer: null, reason: 'Unable to observe this form.' });
function answerFor(value: number): string {
  const atom: Record<number, string> = { 1: 'ra', 2: 'ru', 3: 'ri', 5: 'ka' };
  if (value <= 5) return atom[value];
  const q = Math.floor(value / 5), r = value % 5;
  return [...(q === 1 ? [] : [answerFor(q)]), 'ka', ...(r ? [atom[r]] : [])].join(' ');
}
const answer = (profile: Awaited<ReturnType<typeof fixture>>['profile']) => ({ expectedRevision: profile.revision, mutationId: 'answer-question', action: 'answer',
  answer: answerFor(elicitationReport(profile.elicitation_history![0]).selection!.value), reason: 'Independently supplied numeral.' });

it('persists a replayable question without private unrelated fields or changes to linguistic evidence and survives reopening', async () => {
  const { sessions, original, profile, record } = await fixture();
  expect(profile.number_system).toEqual(original.number_system); expect(profile.research).toEqual(original.research);
  expect(record.source_json).not.toContain('Private unrelated notes');
  expect(elicitationReport(record).selection?.groups.length).toBeGreaterThan(1);
  expect((await new ElicitationSessions().list(profile.id)).profile.elicitation_history).toEqual(profile.elicitation_history);
  expect((await sessions.list(profile.id)).states[0]).toMatchObject({ canDecide: true, stale: false });
  verifyElicitation(profile);
});
it('makes creation retries idempotent across restart even after unrelated revisions', async () => {
  const { store, profile, request } = await fixture();
  const renamed = (await store.update(profile.id, { name: 'Renamed' }, profile.revision))!;
  const retried = await new ElicitationSessions().create(profile.id, request);
  expect(retried.revision).toBe(renamed.revision); expect(retried.elicitation_history).toHaveLength(1);
  expect((await new ElicitationSessions().list(profile.id)).states[0].canDecide).toBe(true);
});
it('atomically saves an answer, validation assignment, source capture and actual reranking; repeated decisions do not duplicate them', async () => {
  const { profile, record, sessions } = await fixture();
  const request = answer(profile), accepted = await sessions.decide(profile.id, record.id, request), value = elicitationReport(record).selection!.value;
  expect(accepted.number_system.mappings[value]).toBe(request.answer);
  expect(accepted.number_system.validation_values).toContain(value);
  expect(accepted.research.observations).toHaveLength(1); expect(accepted.research.annotations[0].provenance).toBe('user');
  const saved = accepted.elicitation_history![0].decision!;
  expect(JSON.parse(saved.after_json!).leaderIds.length).toBeLessThan(elicitationReport(record).leaderIds.length);
  expect(saved.observation_id).toBe(accepted.research.observations[0].id);
  const again = await new ElicitationSessions().decide(profile.id, record.id, request);
  expect(again.revision).toBe(accepted.revision); expect(again.research.observations).toHaveLength(1);
  verifyElicitation(accepted);
});
it('retains an answer outside the predicted forms rather than substituting a suggested answer', async () => {
  const { profile, record, sessions } = await fixture();
  const saved = await sessions.decide(profile.id, record.id, { ...answer(profile), answer: 'unpredicted observed exception' });
  expect(saved.elicitation_history![0].decision?.answer).toBe('unpredicted observed exception');
  expect(saved.research.observations[0].text).toBe('unpredicted observed exception');
  verifyElicitation(saved);
});
it('retains a decline without evidence edits and excludes only that question at the same evidence snapshot', async () => {
  const { profile, record, sessions } = await fixture();
  const declined = await sessions.decide(profile.id, record.id, decline(profile.revision));
  expect(declined.number_system).toEqual(profile.number_system); expect(declined.research).toEqual(profile.research);
  const next = await sessions.create(profile.id, { expectedRevision: declined.revision, mutationId: 'next-question' });
  expect(JSON.parse(next.elicitation_history![1].source_json).declined).toEqual([elicitationReport(record).selection!.value]);
  expect(elicitationReport(next.elicitation_history![1]).selection?.value).not.toBe(elicitationReport(record).selection!.value);
});
it('rejects stale evidence, revision races, cross-profile decisions and reused request identities', async () => {
  const { store, profile, record, sessions } = await fixture();
  const changed = (await store.update(profile.id, { number_system: { ...profile.number_system, mappings: { ...mappings, 8: 'ka ri' } } }, profile.revision))!;
  expect((await sessions.list(profile.id)).states[0].stale).toBe(true);
  await expect(sessions.decide(profile.id, record.id, answer(changed))).rejects.toMatchObject({ code: 'ELICITATION_STALE' });
  await expect(sessions.create(profile.id, { expectedRevision: profile.revision, mutationId: 'stale-create' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  const other = await store.create({ name: 'Other' });
  await expect(sessions.decide(other.id, record.id, decline(other.revision))).rejects.toMatchObject({ code: 'ELICITATION_MISSING' });
  await expect(sessions.decide(profile.id, record.id, { ...decline(changed.revision), mutationId: 'create-question' })).rejects.toMatchObject({ code: 'MUTATION_ID_REUSED' });
});
it('serializes competing decisions and rejects changed-payload retries', async () => {
  const { profile, record, sessions } = await fixture();
  const result = await Promise.allSettled([sessions.decide(profile.id, record.id, answer(profile)), sessions.decide(profile.id, record.id, decline(profile.revision))]);
  expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const saved = (await sessions.list(profile.id)).profile;
  expect(saved.elicitation_history![0].decision?.action).toBe('answer');
  await expect(sessions.decide(profile.id, record.id, { ...answer(profile), answer: 'changed' })).rejects.toMatchObject({ code: 'MUTATION_ID_REUSED' });
});
it('does not partially publish evidence or a receipt after a failed atomic write and permits an exact retry', async () => {
  let fail = false;
  const store = new ProfileStore(async (file, data, options) => { if (fail && path.dirname(file).endsWith('profiles')) throw Error('Injected disk failure'); return atomicWrite(file, data, options); });
  const { profile, record, sessions } = await fixture(store), request = answer(profile);
  fail = true; await expect(sessions.decide(profile.id, record.id, request)).rejects.toThrow('Injected disk failure');
  expect((await store.get(profile.id))!.elicitation_history![0].decision).toBeNull();
  expect((await store.get(profile.id))!.number_system).toEqual(profile.number_system);
  fail = false; expect((await sessions.decide(profile.id, record.id, request)).research.observations).toHaveLength(1);
});
it('keeps elicitation metadata server-owned through ordinary edits and detects forged snapshots or reports', async () => {
  const { store, profile } = await fixture();
  const patched = (await store.update(profile.id, { elicitation_history: [] }, profile.revision))!;
  expect(patched.elicitation_history).toEqual(profile.elicitation_history);
  await expect(store.mutate(profile.id, { mutationId: 'forge', expectedRevision: patched.revision, operations: [{ type: 'set-fields', fields: { elicitation_history: [] } }] })).rejects.toThrow();
  const broken = structuredClone(profile); broken.elicitation_history![0].source_json += ' ';
  expect(() => verifyElicitation(broken)).toThrow();
  const forged = structuredClone(profile), r = forged.elicitation_history![0], report = elicitationReport(r);
  report.selection!.disagreementBits = 999; r.report_json = JSON.stringify(report); r.report_sha256 = elicitationHash(r.report_json);
  expect(() => verifyElicitation(forged)).toThrow();
});
it('restores exact historical payloads and remapped answer captures while blocking restored unanswered decisions', async () => {
  const { profile, record, sessions } = await fixture();
  const pending = await sessions.create(profile.id, { expectedRevision: profile.revision, mutationId: 'second-question' });
  const accepted = await sessions.decide(profile.id, record.id, answer(pending));
  const archives = new ProjectArchives(), exported = await archives.export(profile.id, accepted.revision, false);
  const bytes = await fs.readFile(exported.file); await exported.dispose();
  const preview = await archives.inspect(Readable.from([bytes]));
  const restored = (await archives.restore(preview.token, { mode: 'new' })).profile;
  expect(restored.elicitation_history![0].source_json).toBe(record.source_json);
  expect(restored.elicitation_history![0].report_json).toBe(record.report_json);
  expect(restored.elicitation_history![0].decision?.observation_id).toBe(restored.research.observations[0].id);
  expect(restored.elicitation_history!.every(r => r.archived)).toBe(true); verifyElicitation(restored);
  await expect(sessions.decide(restored.id, restored.elicitation_history![1].id, decline(restored.revision))).rejects.toMatchObject({ code: 'ELICITATION_STALE' });
});
it('retains bounded absence without manufacturing a question and enforces the history limit without pruning', async () => {
  const store = new ProfileStore(), p = await store.create({ name: 'No evidence' }), sessions = new ElicitationSessions(store);
  const noQuestion = await sessions.create(p.id, { expectedRevision: p.revision, mutationId: 'empty' });
  expect(elicitationReport(noQuestion.elicitation_history![0]).selection).toBeNull();
  await expect(sessions.decide(p.id, noQuestion.elicitation_history![0].id, decline(noQuestion.revision))).rejects.toMatchObject({ code: 'ELICITATION_STALE' });
  const record = noQuestion.elicitation_history![0];
  expect(elicitationHistorySchema.safeParse(Array.from({ length: 21 }, (_, i) => ({ ...record, id: `record-${i}`, request_id: `request-${i}` })))).toMatchObject({ success: false });
  const full = await store.commitProposalReview(p.id, noQuestion.revision, current => ({ ...current,
    elicitation_history: Array.from({ length: 20 }, (_, i) => ({ ...record, id: `record-${i}`, request_id: `request-${i}` })) }));
  await expect(sessions.create(p.id, { expectedRevision: full.revision, mutationId: 'too-many' })).rejects.toMatchObject({ code: 'ELICITATION_HISTORY_LIMIT' });
  expect((await store.get(p.id))!.elicitation_history).toHaveLength(20);
});
it('validates the authenticated HTTP creation and decision boundary and returns durable states', async () => {
  const { profile, record } = await fixture(), app = createApp(testSession);
  expect((await anonymous(app).get(`/api/elicitation/${profile.id}`)).status).toBe(401);
  expect((await request(app).get(`/api/elicitation/${profile.id}`)).body.states[0].canDecide).toBe(true);
  const bad = await request(app).post(`/api/elicitation/${profile.id}/${record.id}/decision`).send({ ...decline(profile.revision), answer: 'not a decline' });
  expect(bad.status).toBe(400);
  const saved = await request(app).post(`/api/elicitation/${profile.id}/${record.id}/decision`).send(decline(profile.revision));
  expect(saved.status).toBe(200); expect(saved.body.profile.elicitation_history[0].decision.action).toBe('decline');
  const created = await request(app).post(`/api/elicitation/${profile.id}`).send({ expectedRevision: saved.body.profile.revision, mutationId: 'http-next' });
  expect(created.status).toBe(200); expect(created.body.profile.elicitation_history).toHaveLength(2);
});
