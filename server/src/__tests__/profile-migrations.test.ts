import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../app.js';
import { ProfileStore } from '../services/profile-store.js';
import { migrateProfile, parseProfile } from '../../../shared/schemas/profile.js';
import { createDefaultProfile } from '../../../shared/constants.js';
import { DEMO_LANGUAGE } from '../../../shared/demo-language.js';

let dir: string;
const timestamp = '2026-06-07T00:00:00.000Z';
const complete = () => ({ ...createDefaultProfile(), id: 'profile-test', created_at: timestamp, updated_at: timestamp });
const legacy = () => {
  const { schema_version: _version, revision: _revision, ...data } = { ...DEMO_LANGUAGE, id: 'legacy-test', created_at: timestamp, updated_at: timestamp };
  return data;
};
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-schema-'));
  process.env.DATA_DIR = dir;
  await fs.mkdir(path.join(dir, 'profiles'));
});
afterEach(() => { delete process.env.DATA_DIR; });

describe('versioned profile boundary', () => {
  it('migrates legitimate legacy data without changing identity, timestamps, notes or manual scores', () => {
    const original = legacy();
    const migrated = migrateProfile(original);
    expect(migrated).toMatchObject({ ...original, schema_version: 2, revision: 0 });
    expect(migrated.dictionary[0].user_asserted_confidence).toBe(original.dictionary[0].confidence);
    expect(migrateProfile(migrated)).toEqual(migrated);
    expect(original).not.toHaveProperty('schema_version');
  });

  it('fills only genuinely omitted optional legacy fields', () => {
    const profile = legacy();
    const sample = profile.samples[0];
    const { ipa: _ipa, audio_id: _audio, ...oldSample } = sample;
    expect(migrateProfile({ ...profile, samples: [oldSample] }).samples[0]).toMatchObject({ ipa: null, audio_id: null });
    expect(() => migrateProfile({ ...profile, dictionary: [null] })).toThrow();
    expect(() => migrateProfile({ ...profile, notes_from_future: 'do not silently discard' })).toThrow();
  });

  it.each([1, -2, 2.5, 37, Infinity, NaN])('rejects unsafe number base %s', base => {
    expect(() => parseProfile({ ...complete(), number_system: { base, mappings: {}, operators: {} } })).toThrow();
  });

  it.each([null, 2, 36])('accepts supported or unknown base %s', base => {
    expect(parseProfile({ ...complete(), number_system: { base, mappings: {}, operators: {} } }).number_system.base).toBe(base);
  });

  it('rejects duplicate IDs, invalid confidence, invalid timestamps and broken clip references', () => {
    const profile = legacy();
    expect(() => migrateProfile({ ...profile, dictionary: [profile.dictionary[0], profile.dictionary[0]] })).toThrow();
    expect(() => migrateProfile({ ...profile, dictionary: [{ ...profile.dictionary[0], confidence: 101 }] })).toThrow();
    expect(() => migrateProfile({ ...profile, created_at: 'tomorrow' })).toThrow();
    expect(() => migrateProfile({ ...profile, samples: [{ ...profile.samples[0], audio_id: 'missing' }] })).toThrow();
  });

  it('validates segment order, duration and dictionary references', () => {
    const clip = { id: 'clip', filename: 'clip.wav', duration: 1, waveform: [0, 1], created_at: timestamp,
      segments: [{ id: 'segment', start: 0, end: 1, label: 'phone', dictionary_entry_id: null }] };
    const profile = { ...complete(), audio_clips: [clip] };
    expect(parseProfile(profile).audio_clips).toHaveLength(1);
    for (const changes of [{ start: 1 }, { end: 2 }, { dictionary_entry_id: 'missing' }]) {
      expect(() => parseProfile({ ...profile, audio_clips: [{ ...clip, segments: [{ ...clip.segments[0], ...changes }] }] })).toThrow();
    }
  });

  it('preserves original bytes before the first migrated write and does not replace that backup', async () => {
    const original = Buffer.from(JSON.stringify(legacy(), null, 4) + '\r\n');
    const file = path.join(dir, 'profiles/legacy-test.json');
    await fs.writeFile(file, original);
    const store = new ProfileStore();
    expect((await store.get('legacy-test'))?.schema_version).toBe(2);
    expect(await fs.readFile(file)).toEqual(original); // Reading alone never rewrites the original.
    const updated = await store.update('legacy-test', { description: 'New notes' });
    expect(updated?.revision).toBe(1);
    expect(await fs.readFile(file + '.v1.bak')).toEqual(original);
    await store.update('legacy-test', { description: 'Later notes' });
    expect(await fs.readFile(file + '.v1.bak')).toEqual(original);
    expect(JSON.parse(await fs.readFile(file, 'utf8')).description).toBe('Later notes');
  });

  it.each([
    ['{"name":', 'PROFILE_CORRUPT'],
    [JSON.stringify({ ...legacy(), schema_version: 99 }), 'PROFILE_VERSION_UNSUPPORTED'],
    [JSON.stringify({ ...legacy(), dictionary: [null] }), 'PROFILE_INVALID_ON_DISK'],
  ])('preserves invalid/future bytes and returns the corresponding classification', async (bytes, code) => {
    const file = path.join(dir, 'profiles/legacy-test.json');
    await fs.writeFile(file, bytes);
    const response = await request(createApp()).get('/api/profiles/legacy-test');
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code, retryable: false, requestId: expect.any(String) });
    expect(await fs.readFile(file, 'utf8')).toBe(bytes);
  });

  it('refuses to overwrite a conflicting migration backup', async () => {
    const file = path.join(dir, 'profiles/legacy-test.json');
    const bytes = JSON.stringify(legacy());
    await fs.writeFile(file, bytes);
    await fs.writeFile(file + '.v1.bak', 'different original');
    await expect(new ProfileStore().update('legacy-test', { name: 'New name' })).rejects.toMatchObject({ code: 'MIGRATION_BACKUP_CONFLICT' });
    expect(await fs.readFile(file, 'utf8')).toBe(bytes);
    expect(await fs.readFile(file + '.v1.bak', 'utf8')).toBe('different original');
  });

  it('rejects malformed API bodies before a profile is persisted and preserves immutable metadata on update', async () => {
    const app = createApp();
    const bad = await request(app).post('/api/profiles').send({ name: 'Bad', number_system: { base: 1, mappings: {}, operators: {} } });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 'PROFILE_INVALID', retryable: false, issues: expect.any(Array), requestId: expect.any(String) });
    expect(await fs.readdir(path.join(dir, 'profiles'))).toEqual([]);
    const created = await request(app).post('/api/profiles/demo');
    expect(created.status).toBe(201);
    const changed = await request(app).put(`/api/profiles/${created.body.id}`).send({ name: 'Renamed', id: 'spoof', revision: 100 });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ id: created.body.id, created_at: created.body.created_at, schema_version: 2, revision: 1, name: 'Renamed' });
  });
});
