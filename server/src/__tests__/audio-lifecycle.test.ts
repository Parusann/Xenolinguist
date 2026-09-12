import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request, { testSession } from './authenticated-request.js';
import { AudioStore } from '../services/audio-store.js';
import { ProfileStore } from '../services/profile-store.js';
import { createApp } from '../app.js';
import { DesktopAudioDrafts } from '../../../electron/audio-drafts.js';
import { inspectPcmWav } from '../../../shared/audio-container.js';
import { MAX_AUDIO_BYTES } from '../../../shared/schemas/audio.js';
let dir: string, wav: Buffer;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-audio-')); process.env.DATA_DIR = dir;
  wav = await fs.readFile(new URL('./fixtures/hello-16k.wav', import.meta.url));
});
afterEach(() => { delete process.env.DATA_DIR; });
const sample = (id: string) => ({ id: 'sample-one', created_at: new Date().toISOString(), alien_text: 'hello', english_translation: null,
  source: 'Audio recording', phonetic_notes: '', decoded: false, audio_id: id, ipa: null });
describe('durable audio lifecycle', () => {
  it('commits sample and verified assets together, retries after restart and retains deletion/undo bytes', async () => {
    const audio = new AudioStore(), profiles = new ProfileStore();
    const profile = await profiles.create({ name: 'Audio' });
    const staged = await audio.stage(wav), complete = await audio.complete(staged.id, wav);
    const clip = { id: complete.id, filename: 'hello.wav', created_at: complete.createdAt, duration: complete.duration!, waveform: [0.1], segments: [],
      assets: { original: complete.original, analysis: complete.analysis! } };
    const operations = [{ type: 'put-sample', value: sample(clip.id) }, { type: 'put-clip', value: clip }];
    const mutation = { expectedRevision: 0, mutationId: 'audio-save', operations };
    await profiles.mutate(profile.id, mutation);
    expect(await new ProfileStore().mutate(profile.id, mutation)).toMatchObject({ duplicate: true, profile: { revision: 1 } });
    expect((await new ProfileStore().get(profile.id))?.audio_clips[0].assets).toEqual(clip.assets);
    const bytes = await new AudioStore().verifyFile(clip.id, 'original', complete.original); expect(bytes.equals(wav)).toBe(true);
    await profiles.mutate(profile.id, { expectedRevision: 1, mutationId: 'delete', operations: [
      { type: 'remove', collection: 'samples', id: 'sample-one' }, { type: 'remove', collection: 'audio_clips', id: clip.id }] });
    await audio.cleanup(Date.now() + 7 * 86400000);
    await profiles.mutate(profile.id, { expectedRevision: 2, mutationId: 'undo', operations });
    expect((await profiles.get(profile.id))?.samples[0].audio_id).toBe(clip.id);
    expect((await request(createApp(testSession)).delete(`/api/audio/${clip.id}`)).status).toBe(409);
  });
  it('rejects missing or tampered assets before profile creation and immutable retry', async () => {
    const audio = new AudioStore(), staged = await audio.stage(wav), complete = await audio.complete(staged.id, wav);
    const clip = { id: complete.id, filename: 'hello.wav', created_at: complete.createdAt, duration: complete.duration!, waveform: [], segments: [],
      assets: { original: complete.original, analysis: complete.analysis! } };
    await fs.writeFile(path.join(audio.directory(staged.id), 'original'), 'changed');
    await expect(new ProfileStore().create({ name: 'Invalid', samples: [sample(clip.id)], audio_clips: [clip] })).rejects.toMatchObject({ code: 'AUDIO_ASSET_CHANGED' });
    await expect(audio.complete(staged.id, wav)).rejects.toMatchObject({ code: 'AUDIO_ASSET_CHANGED' });
    await fs.unlink(path.join(audio.directory(staged.id), 'original'));
    await expect(audio.verifyFile(staged.id, 'original', complete.original)).rejects.toMatchObject({ code: 'AUDIO_ASSET_MISSING' });
    expect(await new ProfileStore().list()).toEqual([]);
  });
  it('expires only incomplete staging and rejects analysis with the wrong duration', async () => {
    const audio = new AudioStore(), staged = await audio.stage(wav);
    const shorter = Buffer.from(wav.subarray(0, wav.length - 3200)); shorter.writeUInt32LE(shorter.length - 8, 4); shorter.writeUInt32LE(shorter.length - 44, 40);
    await expect(audio.complete(staged.id, shorter)).rejects.toMatchObject({ code: 'AUDIO_DURATION_MISMATCH' });
    await audio.cleanup(Date.now() + 2 * 86400000); expect(await audio.metadata(staged.id)).toBeNull();
  });
  it('accepts RIFF ancillary chunks and rejects truncated, misaligned and unsupported originals', async () => {
    const ancillary = Buffer.concat([wav.subarray(0, 12), Buffer.from('JUNK'), Buffer.from([2, 0, 0, 0, 0, 0]), wav.subarray(12)]);
    ancillary.writeUInt32LE(ancillary.length - 8, 4); expect(inspectPcmWav(ancillary).duration).toBe(inspectPcmWav(wav).duration);
    const bad = Buffer.from(wav); bad.writeUInt16LE(4, 32);
    for (const bytes of [wav.subarray(0, 80), bad, Buffer.from('unsupported')]) await expect(new AudioStore().stage(bytes)).rejects.toHaveProperty('code');
    expect((await request(createApp(testSession)).post('/api/audio/stages').type('application/octet-stream').send(Buffer.alloc(MAX_AUDIO_BYTES + 1))).status).toBe(413);
  });
  it('restores binary desktop drafts through a new instance and confines identifiers', async () => {
    const directory = path.join(dir, 'drafts'), store = new DesktopAudioDrafts(directory);
    const metadata = { profileId: 'owner', sampleId: 'sample-one', name: 'hello.wav', mime: 'audio/wav', createdAt: new Date().toISOString() };
    await store.write('owner', { metadata, bytes: wav });
    const recovered = await new DesktopAudioDrafts(directory).read('owner'); expect(recovered?.bytes.equals(wav)).toBe(true);
    await expect(store.write('other', { metadata, bytes: wav })).rejects.toThrow();
    await expect(store.read('../escape')).rejects.toThrow();
    await store.remove('owner'); expect(await store.read('owner')).toBeNull();
  });
});
