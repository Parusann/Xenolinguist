import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import request, { testSession } from './authenticated-request.js';
import { ProfileStore } from '../services/profile-store.js';
import { atomicWrite } from '../services/atomic-file.js';
import { acquireDataOwner } from '../services/data-owner.js';
import { createApp } from '../app.js';

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-transaction-')); process.env.DATA_DIR = dir; });
afterEach(() => { delete process.env.DATA_DIR; });
const mutation = (id: string, expectedRevision: number, description: string) => ({ mutationId: id, expectedRevision, operations: [{ type: 'set-fields', fields: { description } }] });

describe('profile transactions and recovery', () => {
  it('serializes the full transaction and rejects a stale operation before it replaces state', async () => {
    const store = new ProfileStore();
    const profile = await store.create({ name: 'Concurrent' });
    const responses = await Promise.allSettled([store.mutate(profile.id, mutation('left', 0, 'left')), store.mutate(profile.id, mutation('right', 0, 'right'))]);
    expect(responses.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(responses.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'REVISION_CONFLICT', currentRevision: 1 } });
    expect((await new ProfileStore().get(profile.id))?.revision).toBe(1);
  });

  it('persists idempotency through a new store instance and rejects altered ID reuse', async () => {
    const store = new ProfileStore();
    const profile = await store.create({ name: 'Retry' });
    await store.mutate(profile.id, mutation('same-id', 0, 'saved'));
    const duplicate = await new ProfileStore().mutate(profile.id, mutation('same-id', 0, 'saved'));
    expect(duplicate).toMatchObject({ duplicate: true, appliedRevision: 1, profile: { revision: 1, description: 'saved' } });
    await expect(store.mutate(profile.id, mutation('same-id', 1, 'different'))).rejects.toMatchObject({ code: 'MUTATION_ID_REUSED' });
  });

  it('rejects missing PUT preconditions and stale full-profile replacement', async () => {
    const app = createApp(testSession);
    const profile = (await request(app).post('/api/profiles').send({ name: 'Precondition' })).body;
    expect((await request(app).put(`/api/profiles/${profile.id}`).send({ description: 'unsafe' })).status).toBe(428);
    expect((await request(app).put(`/api/profiles/${profile.id}`).send({ revision: 0, description: 'first' })).status).toBe(200);
    expect((await request(app).put(`/api/profiles/${profile.id}`).send({ ...profile, description: 'stale' })).status).toBe(409);
    expect((await request(app).get(`/api/profiles/${profile.id}`)).body.description).toBe('first');
  });

  it('rebuilds a corrupt index and keeps damaged profiles visible without overwriting them', async () => {
    const store = new ProfileStore();
    const profile = await store.create({ name: 'Healthy' });
    await fs.writeFile(path.join(dir, 'profiles.json'), '{broken');
    const badFile = path.join(dir, 'profiles/broken.json');
    await fs.writeFile(badFile, '{broken');
    const index = await store.list();
    expect(index).toContainEqual(expect.objectContaining({ id: profile.id, name: 'Healthy' }));
    expect(index).toContainEqual(expect.objectContaining({ id: 'broken', recovery_error: 'PROFILE_CORRUPT' }));
    expect(await fs.readFile(badFile, 'utf8')).toBe('{broken');
    expect(JSON.parse(await fs.readFile(path.join(dir, 'profiles.json'), 'utf8'))).toEqual(index);
  });

  it('acknowledges a committed profile even when its derived index cannot be written', async () => {
    const store = new ProfileStore(async (file, text, options) => {
      if (file === path.join(dir, 'profiles.json')) throw new Error('Injected index failure');
      await atomicWrite(file, text, options);
    });
    const profile = await store.create({ name: 'Index failure' });
    const saved = await store.mutate(profile.id, mutation('committed', 0, 'acknowledged'));
    expect(saved?.profile.revision).toBe(1);
    expect((await new ProfileStore().list())[0].id).toBe(profile.id);
    expect((await new ProfileStore().get(profile.id))?.description).toBe('acknowledged');
  });

  it('retains the primary on flush/rename failure and retries bounded Windows sharing failures', async () => {
    const file = path.join(dir, 'atomic.json');
    await atomicWrite(file, 'old');
    await expect(atomicWrite(file, 'new', { afterFlush: async () => { throw new Error('Injected interruption'); } })).rejects.toThrow('Injected');
    expect(await fs.readFile(file, 'utf8')).toBe('old');
    let attempts = 0;
    await atomicWrite(file, 'new', { previous: true, rename: async (from, to) => {
      if (++attempts < 3) throw Object.assign(new Error('sharing violation'), { code: 'EPERM' });
      await fs.rename(from, to);
    } });
    expect(attempts).toBe(3);
    expect(await fs.readFile(file + '.prev', 'utf8')).toBe('old');
    await expect(atomicWrite(file, 'unsafe', { rename: async () => { throw Object.assign(new Error('disk failed'), { code: 'EIO' }); } })).rejects.toThrow('disk failed');
    expect(await fs.readFile(file, 'utf8')).toBe('new');
  });

  it('recovers a missing primary from its validated previous snapshot and never resurrects a deletion', async () => {
    const store = new ProfileStore();
    const profile = await store.create({ name: 'Recover' });
    await store.mutate(profile.id, mutation('next', 0, 'next'));
    await fs.unlink(path.join(dir, 'profiles', `${profile.id}.json`));
    expect((await store.get(profile.id))?.revision).toBe(0);
    await store.remove(profile.id);
    expect(await store.get(profile.id)).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('permits one backend owner, safely rejects an unknown lock and recovers a dead owner', async () => {
    const release = await acquireDataOwner(dir);
    await expect(acquireDataOwner(dir)).rejects.toMatchObject({ code: 'DATA_DIRECTORY_IN_USE' });
    await release();
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { windowsHide: true });
    await new Promise<void>(resolve => child.once('exit', () => resolve()));
    await fs.writeFile(path.join(dir, '.owner.lock'), JSON.stringify({ pid: child.pid, token: 'dead-owner' }));
    const recovered = await acquireDataOwner(dir);
    await recovered();
    await fs.writeFile(path.join(dir, '.owner.lock'), 'unreadable');
    await expect(acquireDataOwner(dir)).rejects.toMatchObject({ code: 'DATA_OWNER_UNKNOWN' });
    expect(await fs.readFile(path.join(dir, '.owner.lock'), 'utf8')).toBe('unreadable');
  });
});
