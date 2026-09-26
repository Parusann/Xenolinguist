import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ProfileStore } from '../services/profile-store.js';
import { ProjectArchives } from '../services/project-archive.js';
import { createDefaultProfile } from '../../../shared/constants.js';
import { migrateProfile } from '../../../shared/schemas/profile.js';
import { saveQueueRecordSchema } from '../../../shared/schemas/save-queue.js';
import { translationDependencies, staleReasons } from '../../../engine/src/evidence/dependencies.js';
import { derive } from '../../../engine/src/translation/derive.js';
import type { LanguageProfile } from '../../../shared/types.js';

let root: string;
const now = '2026-09-25T00:00:00.000Z';
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-research-')); process.env.DATA_DIR = root; });
afterEach(async () => {
  delete process.env.DATA_DIR;
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('xeno-research-')) throw new Error('Unsafe test cleanup');
  await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
  const store = new ProfileStore();
  let p = await store.create({ name: 'Evidence', dictionary: [{ id: 'word', alien_word: 'tal', english_meaning: 'sky', part_of_speech: 'noun',
    confidence: null, context: '', examples: [], notes: '', created_at: now }] });
  p = (await store.update(p.id, { research: { ...p.research,
    observations: [{ id: 'capture', created_at: now, text: 'tal', content_sha256: createHash('sha256').update('tal').digest('hex'),
      source: 'field', source_id: null, origin: 'capture', derived_from: [], audio: null }],
    hypotheses: [{ id: 'hypothesis', created_at: now, label: 'tal sky', content: { kind: 'lexical', entry_id: 'word', form: 'tal', meaning: 'sky' },
      manual_belief: null, provenance: 'user', score_definition: 'evidence-counts-1', supersedes: null }],
    links: [{ id: 'link', created_at: now, hypothesis_id: 'hypothesis', observation_id: 'capture', annotation_id: null, relation: 'supports', span: null, note: '' }],
  } }, p.revision))!;
  return { store, p };
}
function analysis(p: LanguageProfile) { return { id: 'analysis', created_at: now, engine_version: 'typed-grammar-1' as const, profile_revision: p.revision,
  source: 'tal', dependencies: translationDependencies(p), result: derive('tal', p) }; }

it('migrates v2 profiles and unsent/sealed drafts without inventing observations or changing revision identity', async () => {
  const { research: _research, ...old } = { ...createDefaultProfile(), id: 'legacy', created_at: now, updated_at: now, revision: 7 };
  const v2 = { ...old, schema_version: 2 };
  const file = path.join(root, 'profiles/legacy.json'); await fs.mkdir(path.dirname(file));
  const original = JSON.stringify(v2, null, 4) + '\r\n'; await fs.writeFile(file, original);
  const p = migrateProfile(v2); expect(p.schema_version).toBe(3); expect(p.revision).toBe(7); expect(p.research.observations).toEqual([]);
  const queue = saveQueueRecordSchema.parse({ profileId: 'legacy', base: v2, drafts: { input: 'unfinished' }, batches: [{ id: 'edit', before: v2,
    after: { ...v2, name: 'changed' }, sent: { mutationId: 'edit', expectedRevision: 7, operations: [{ type: 'set-fields', fields: { name: 'changed' } }] } }] });
  expect(queue.batches[0].sent?.expectedRevision).toBe(7); expect(queue.base.schema_version).toBe(3); expect(queue.drafts.input).toBe('unfinished');
  await new ProfileStore().update('legacy', { name: 'migrated' }, 7);
  expect(await fs.readFile(file + '.v2.bak', 'utf8')).toBe(original);
  expect(() => migrateProfile({ ...v2, research: {} })).toThrow();
});
it('rejects capture tampering and audit deletion through both PUT and mutation while preserving disk state', async () => {
  const { store, p } = await fixture();
  for (const research of [{ ...p.research, observations: [] }, { ...p.research, observations: [{ ...p.research.observations[0], source: 'rewritten' }] }]) {
    await expect(store.update(p.id, { research }, p.revision)).rejects.toThrow();
    await expect(store.mutate(p.id, { mutationId: 'bad', expectedRevision: p.revision, operations: [{ type: 'set-fields', fields: { research } }] })).rejects.toThrow();
  }
  await expect(store.update(p.id, { research: { ...p.research, observations: [...p.research.observations, { ...p.research.observations[0], id: 'bad-hash', text: 'forged' }] } }, p.revision)).rejects.toMatchObject({ code: 'RESEARCH_HASH_MISMATCH' });
  expect((await store.get(p.id))!.research).toEqual(p.research);
});
it('verifies new derivations and preserves exact history through idempotent retries and stale dependencies', async () => {
  const { store, p } = await fixture(), run = analysis(p);
  const forged = { ...run, result: { ...run.result, candidates: [] } };
  await expect(store.update(p.id, { research: { ...p.research, analyses: [forged] } }, p.revision)).rejects.toMatchObject({ code: 'RESEARCH_REPLAY_FAILED' });
  const mutation = { mutationId: 'record', expectedRevision: p.revision, operations: [{ type: 'set-fields', fields: { research: { ...p.research, analyses: [run] } } }] };
  const saved = (await store.mutate(p.id, mutation))!.profile;
  expect((await store.mutate(p.id, mutation))!.duplicate).toBe(true); expect(staleReasons(saved, run)).toEqual([]);
  const corrected = (await store.update(p.id, { research: { ...saved.research, annotations: [{ id: 'correction', created_at: now, observation_id: 'capture',
    revision: 1, supersedes: null, interpretation: 'water', provenance: 'user' }] } }, saved.revision))!;
  expect(staleReasons(corrected, run)).toEqual(['evidence changed']);
  expect(corrected.research.analyses[0]).toEqual(run);
});
it('round trips research references and dependency snapshots into a fresh archive identity', async () => {
  const { store, p } = await fixture();
  const saved = (await store.update(p.id, { research: { ...p.research, analyses: [analysis(p)] } }, p.revision))!;
  const archives = new ProjectArchives(), exported = await archives.export(p.id, saved.revision, false);
  const bytes = await fs.readFile(exported.file); await exported.dispose();
  const preview = await archives.inspect(Readable.from([bytes]));
  const { profile: restored } = await archives.restore(preview.token, { mode: 'new' });
  expect(restored.id).not.toBe(p.id);
  expect(restored.research.observations[0].id).not.toBe('capture');
  expect(restored.research.observations[0].text).toBe('tal');
  expect(restored.research.links[0].observation_id).toBe(restored.research.observations[0].id);
  expect(restored.research.hypotheses[0].content).toMatchObject({ entry_id: restored.dictionary[0].id });
  expect(staleReasons(restored, restored.research.analyses[0])).toEqual([]);
  expect(restored.research.analyses[0].result.candidates[0].steps[0].entryId).toBe(restored.dictionary[0].id);
});

it('checks supplied targets without allowing a fabricated pass or destructive historical rewrite', async () => {
  const { store, p } = await fixture();
  const saved = (await store.update(p.id, { research: { ...p.research, analyses: [analysis(p)] } }, p.revision))!;
  const check = { id: 'target-check', created_at: now, analysis_id: 'analysis', expected: 'the water', outcome: 'matches', definition: 'supplied-target-1' };
  await expect(store.update(p.id, { research: { ...saved.research, tests: [check] } }, saved.revision)).rejects.toMatchObject({ code: 'RESEARCH_TEST_MISMATCH' });
  const checked = (await store.update(p.id, { research: { ...saved.research, tests: [{ ...check, outcome: 'differs' }] } }, saved.revision))!;
  expect(checked.research.tests[0].outcome).toBe('differs');
  await expect(store.update(p.id, { research: { ...checked.research, tests: [{ ...checked.research.tests[0], expected: 'the sky', outcome: 'matches' }] } }, checked.revision))
    .rejects.toMatchObject({ code: 'RESEARCH_IMMUTABLE' });
});
