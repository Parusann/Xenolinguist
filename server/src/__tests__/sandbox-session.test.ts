import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProfileStore } from '../services/profile-store.js';
import { createSandboxSession, applySandboxAction } from '../../../shared/sandbox/session.js';

afterEach(() => { delete process.env.DATA_DIR; });
it('persists the session and reward in one revision, deduplicates retries and rejects stale competing sessions', async () => {
  process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-sandbox-'));
  const store = new ProfileStore(), profile = await store.create({ name: 'Sandbox transaction', is_sandbox: true });
  const session = createSandboxSession({ language_name: 'Test', phoneme_set: ['a'], number_base: 10, word_order: 'SVO', rules: ['SVO'],
    number_words: { 1: 'ka', 2: 'ki', 3: 'ku' }, vocabulary: [{ alien: 'tal', english: 'sky', pos: 'noun' }], sample_sentences: [{ alien: 'tal', english: 'sky' }] }, 'session', profile.created_at, 'fixture');
  let local = { ...profile, sandbox_session: session };
  local = applySandboxAction(local, session.id, { type: 'reveal', challengeId: 'vocabulary-0' }, 'event', profile.created_at) as typeof local;
  const mutation = { expectedRevision: 0, mutationId: 'session-and-reward', operations: [
    { type: 'set-fields', fields: { sandbox_session: local.sandbox_session } }, { type: 'put-word', value: local.dictionary[0] }] };
  await store.mutate(profile.id, mutation);
  expect(await new ProfileStore().mutate(profile.id, mutation)).toMatchObject({ duplicate: true, profile: { revision: 1 } });
  const recovered = await new ProfileStore().get(profile.id);
  expect(recovered?.sandbox_session).toEqual(local.sandbox_session); expect(recovered?.dictionary).toHaveLength(1);
  await expect(store.mutate(profile.id, { ...mutation, mutationId: 'stale-session' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect((await store.get(profile.id))?.sandbox_session).toEqual(local.sandbox_session);
});
