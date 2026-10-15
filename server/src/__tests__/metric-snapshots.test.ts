import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProfileStore } from '../services/profile-store.js';

afterEach(() => { delete process.env.DATA_DIR; });
it('commits snapshots atomically, deduplicates retries, and preserves history on rejected or failed writes', async () => {
  process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-metrics-'));
  const store = new ProfileStore(), initial = await store.create({ name: 'Metrics' });
  expect(initial.metric_snapshots).toHaveLength(1);
  const mutation = { expectedRevision: 0, mutationId: 'number', operations: [{ type: 'set-numbers', value: { base: null, mappings: { 1: 'ka' }, operators: {} } }] };
  const saved = await store.mutate(initial.id, mutation);
  expect(saved?.profile.metric_snapshots?.map(snapshot => snapshot.counts.mappings1To20)).toEqual([0, 1]);
  expect((await store.mutate(initial.id, mutation))?.profile.metric_snapshots).toHaveLength(2);
  await expect(store.mutate(initial.id, { ...mutation, mutationId: 'stale' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  const failing = new ProfileStore(async () => { throw new Error('Injected disk failure'); });
  await expect(failing.update(initial.id, { number_system: { base: null, mappings: {}, operators: {} } }, 1)).rejects.toThrow('Injected disk failure');
  const reloaded = await new ProfileStore().get(initial.id);
  expect(reloaded?.metric_snapshots).toEqual(saved?.profile.metric_snapshots);
  const updated = await store.update(initial.id, { metric_snapshots: [], description: 'Cannot overwrite history' }, 1);
  expect(updated?.metric_snapshots).toEqual(reloaded?.metric_snapshots);
});
