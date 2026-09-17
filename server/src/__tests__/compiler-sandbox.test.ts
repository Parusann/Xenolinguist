import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request, { testSession } from './authenticated-request.js';
import supertest from 'supertest';
import { createApp } from '../app.js';
import { ProfileStore } from '../services/profile-store.js';
import { CompilerSandbox, readCompilerRecord, validateCompilerRecord } from '../services/compiler-sandbox.js';
import { dataset } from '../../../evaluation/src/generator/dataset.js';
import { ProjectArchives } from '../services/project-archive.js';
let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-compiler-')); process.env.DATA_DIR = directory; });
afterEach(async () => { delete process.env.DATA_DIR; await fs.rm(directory, { recursive: true, force: true }); });
async function start() {
  const store = new ProfileStore(), profile = await store.create({ name: 'Compiler test', is_sandbox: true });
  const command = { type: 'start', expectedRevision: profile.revision, requestId: randomUUID() };
  return { store, command, ...await new CompilerSandbox(store).act(profile.id, command) };
}
it('regenerates the same exercise after reopening and never returns hidden answers through profile or compiler APIs', async () => {
  const started = await start(), record = await readCompilerRecord(started.profile.compiler_session_id!);
  const app = createApp(testSession), view = await request(app).get(`/api/compiler/${started.profile.id}`).expect(200);
  expect(view.body).toEqual(started.view);
  const profile = await request(app).get(`/api/profiles/${started.profile.id}`).expect(200);
  for (const serialized of [JSON.stringify(view.body), JSON.stringify(profile.body)]) {
    for (const key of ['seed', 'lexicon', 'datasetHash', 'accepted', 'truth']) expect(serialized).not.toContain(`"${key}"`);
    for (const target of dataset(record.seed).targets) expect(serialized).not.toContain(target.english);
  }
  await supertest(app).get(`/api/compiler/${started.profile.id}`).expect(401);
  await request(app).get(`/api/compiler-sessions/${started.profile.compiler_session_id}.json`).expect(404);
  await request(app).post(`/api/compiler/${started.profile.id}`).send({ type: 'start', seed: 42, expectedRevision: 1, requestId: randomUUID() }).expect(400);
});
it('atomically persists attempts, distinguishes reveals and retries, deduplicates requests and rejects stale work', async () => {
  const { profile, view, command } = await start(), service = new CompilerSandbox();
  expect((await service.act(profile.id, command)).profile.revision).toBe(1);
  const record = await readCompilerRecord(profile.compiler_session_id!);
  const attempt = { type: 'attempt', sessionId: view!.sessionId, challengeId: 'c-0', answer: 'wrong', expectedRevision: 1, requestId: randomUUID() };
  const first = await service.act(profile.id, attempt);
  expect((await service.act(profile.id, attempt)).profile.revision).toBe(2);
  expect(first.view!.feedback[0]).toMatchObject({ attempts: 1, matched: false });
  await expect(service.act(profile.id, { ...attempt, answer: 'changed' })).rejects.toMatchObject({ code: 'MUTATION_ID_REUSED' });
  await expect(service.act(profile.id, { ...attempt, requestId: randomUUID() })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  const correct = await service.act(profile.id, { ...attempt, expectedRevision: 2, requestId: randomUUID(), answer: dataset(record.seed).targets[0].english });
  expect(correct.view!.feedback[0]).toMatchObject({ attempts: 2, matched: true, revealed: false });
  const revealed = await service.act(profile.id, { type: 'reveal', sessionId: view!.sessionId, challengeId: 'c-1', expectedRevision: 3, requestId: randomUUID() });
  expect(revealed.view!.feedback[1]).toMatchObject({ attempts: 0, revealed: true, answer: dataset(record.seed).targets[1].english });
  expect(await new CompilerSandbox().get(profile.id)).toEqual(revealed.view);
  await expect(service.act(profile.id, { ...attempt, expectedRevision: 4, requestId: randomUUID() })).rejects.toMatchObject({ code: 'COMPILER_SESSION_INVALID' });
  const assisted = await service.act(profile.id, { ...attempt, challengeId: 'c-2', expectedRevision: 4, requestId: randomUUID(), answer: dataset(record.seed).targets[2].english });
  expect(assisted.view!.feedback[2]).toMatchObject({ attempts: 1, matched: true, assisted: true });
  expect((await readCompilerRecord(profile.compiler_session_id!)).events).toEqual([]); // Old immutable snapshot remains valid.
});
it('prevents generic profile writes from binding private snapshots or forging grading history', async () => {
  const { profile, store } = await start();
  const created = await store.create({ name: 'Other', compiler_session_id: profile.compiler_session_id });
  expect(created.compiler_session_id).toBeUndefined();
  const updated = await store.update(created.id, { compiler_session_id: profile.compiler_session_id }, 0);
  expect(updated!.compiler_session_id).toBeUndefined();
  await expect(store.mutate(created.id, { expectedRevision: 1, mutationId: randomUUID(), operations: [{ type: 'set-fields', fields: { compiler_session_id: profile.compiler_session_id } }] })).rejects.toThrow();
  const record = await readCompilerRecord(profile.compiler_session_id!);
  expect(() => validateCompilerRecord({ ...record, generatorVersion: 'future' })).toThrow();
  expect(() => validateCompilerRecord({ ...record, seed: record.seed ^ 1 })).toThrow();
  expect(() => validateCompilerRecord({ ...record, events: [{ id: 'x', kind: 'attempt', answer: 'hi', challengeId: 'missing', at: record.createdAt }] })).toThrow();
});
it('leaves the previous exercise usable if publishing the new profile fails', async () => {
  const { profile, view } = await start();
  const failing = new ProfileStore(async () => { throw new Error('Injected disk failure'); });
  await expect(new CompilerSandbox(failing).act(profile.id, { type: 'reveal', sessionId: view!.sessionId, challengeId: 'c-0', expectedRevision: 1, requestId: randomUUID() })).rejects.toThrow('Injected disk failure');
  expect(await new CompilerSandbox().get(profile.id)).toEqual(view);
});
it('round trips private compiler state only in explicitly inclusive v2 archives and remaps identities', async () => {
  const initial = await start(), archives = new ProjectArchives();
  const { profile, view } = await new CompilerSandbox().act(initial.profile.id, { type: 'reveal', sessionId: initial.view!.sessionId,
    expectedRevision: 1, requestId: randomUUID(), challengeId: 'c-0' });
  for (const include of [false, true]) {
    const exported = await archives.export(profile.id, profile.revision, include), bytes = await fs.readFile(exported.file); await exported.dispose();
    const preview = await archives.inspect(Readable.from([bytes]));
    expect(JSON.stringify(preview)).not.toContain('seed');
    const restored = await archives.restore(preview.token, { mode: 'new' });
    if (include) {
      expect(restored.profile.compiler_session_id).not.toBe(profile.compiler_session_id);
      const recovered = await new CompilerSandbox().get(restored.profile.id);
      expect(recovered!.sessionId).not.toBe(view!.sessionId);
      expect(recovered!.challenges).toEqual(view!.challenges);
      expect(recovered!.observations).toEqual(view!.observations);
      expect(recovered!.feedback).toEqual(view!.feedback);
    } else expect(restored.profile.compiler_session_id).toBeUndefined();
  }
});
it('backs up a replaced compiler session and preserves it if replacement publication fails', async () => {
  const source = await start(), destination = await start();
  const archives = new ProjectArchives(), exported = await archives.export(source.profile.id, 1, true);
  const bytes = await fs.readFile(exported.file); await exported.dispose();
  const failing = new ProjectArchives(new ProfileStore(async () => { throw new Error('Failed publication'); }));
  const failedPreview = await failing.inspect(Readable.from([bytes]));
  await expect(failing.restore(failedPreview.token, { mode: 'replace', targetId: destination.profile.id, expectedRevision: 1 })).rejects.toThrow('Failed publication');
  expect(await new CompilerSandbox().get(destination.profile.id)).toEqual(destination.view);
  await failing.discard(failedPreview.token);
  const preview = await archives.inspect(Readable.from([bytes]));
  const replacement = await archives.restore(preview.token, { mode: 'replace', targetId: destination.profile.id, expectedRevision: 1 });
  const backup = await fs.readFile(path.join(directory, 'archive-backups', replacement.backupId!));
  const backupPreview = await archives.inspect(Readable.from([backup]));
  const restored = await archives.restore(backupPreview.token, { mode: 'new' });
  expect((await new CompilerSandbox().get(restored.profile.id))!.challenges).toEqual(destination.view!.challenges);
  expect((await new CompilerSandbox().get(destination.profile.id))!.challenges).toEqual(source.view!.challenges);
});
