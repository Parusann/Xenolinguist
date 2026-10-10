import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { longAudio } from './helpers/long-audio.js';
import { phoneFixture } from './helpers/phone-analysis.js';
import { AudioStore, originalMime } from '../services/audio-store.js';
import { inspectAudioWav } from '../services/audio-wav.js';
import { inspectPhoneWav } from '../services/ipa-phones.js';
import { ProfileStore } from '../services/profile-store.js';
import { ProjectArchives } from '../services/project-archive.js';
import { appendPhoneAnalysis } from '../../../shared/phone-annotations.js';
import request, { testSession } from './authenticated-request.js';
import { createApp } from '../app.js';
import { jobs } from '../services/job-manager.js';

afterEach(() => { delete process.env.DATA_DIR; delete process.env.IPA_MODEL_DIR; });

it('accepts five-minute storage/phone geometry while keeping the two-minute Whisper ceiling', () => {
  const wav = longAudio();
  expect(originalMime(wav)).toBe('audio/wav');
  expect(inspectPhoneWav(wav)).toMatchObject({ sampleCount: 4_800_000, durationSeconds: 300 });
  expect(() => inspectAudioWav(wav)).toThrow();
  expect(inspectAudioWav(longAudio(120)).durationSeconds).toBe(120);
  expect(() => inspectAudioWav(longAudio(120 + 1 / 16000))).toThrow();
  expect(() => inspectPhoneWav(longAudio(300 + 1 / 16000))).toThrow();
  expect(() => originalMime(longAudio(300 + 1 / 16000))).toThrow();
});

it('retains full-length phone timestamps and manual corrections through storage restart and archive remapping', async () => {
  process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-long-audio-'));
  const wav = longAudio(), audio = new AudioStore(), stage = await audio.stage(wav), retained = await audio.complete(stage.id, wav);
  const result = phoneFixture(wav);
  expect(result.ctc.frames).toBe(14999);
  expect(result.processing.chunks.length).toBeGreaterThan(18);
  expect(result.segments[0].end).toBe(299.98);
  const analysis = { version: 1 as const, id: 'long-analysis', created_at: retained.createdAt, originalSha256: retained.original.sha256, result };
  const clip = appendPhoneAnalysis({ id: retained.id, filename: 'long.wav', duration: retained.duration!, waveform: [],
    created_at: retained.createdAt, segments: [{ id: 'manual', start: 240, end: 290, label: 'retained long correction', dictionary_entry_id: null }],
    assets: { original: retained.original, analysis: retained.analysis! } }, analysis);
  clip.manual_source_analysis_id = analysis.id;
  const profile = await new ProfileStore().create({ name: 'long audio', audio_clips: [clip] });
  expect((await new ProfileStore().get(profile.id))!.audio_clips[0]).toEqual(clip);
  const archives = new ProjectArchives(), exported = await archives.export(profile.id, profile.revision, true);
  const bytes = await fs.readFile(exported.file); await exported.dispose();
  const preview = await archives.inspect(Readable.from([bytes]));
  const restored = (await archives.restore(preview.token, { mode: 'new' })).profile.audio_clips[0];
  expect(restored.id).not.toBe(clip.id); expect(restored.assets).toEqual(clip.assets);
  expect(restored.phone_analyses).toEqual(clip.phone_analyses);
  expect(restored.manual_source_analysis_id).toBe(analysis.id);
  expect(restored.segments[0]).toMatchObject({ start: 240, end: 290, label: 'retained long correction' });
  expect((await new AudioStore().verifyFile(restored.id, 'original', restored.assets!.original)).equals(wav)).toBe(true);
}, 15000);

it('rejects long transcription before native execution and labels long phone jobs separately', async () => {
  delete process.env.IPA_MODEL_DIR;
  const app = createApp(testSession), wav = longAudio(121).toString('base64');
  expect((await request(app).post('/api/stt').send({ audio: wav })).status).toBe(400);
  const prior = new Set(jobs.list().map(j => j.id));
  expect((await request(app).post('/api/ipa').send({ audio: wav })).body.code).toBe('IPA_MODEL_MISSING');
  expect(jobs.list().filter(j => !prior.has(j.id))).toMatchObject([{ task: 'Long recording phone analysis', state: 'failed' }]);
  const count = jobs.list().length;
  expect((await request(app).post('/api/ipa').send({ audio: longAudio(301).toString('base64') })).status).toBe(400);
  expect(jobs.list()).toHaveLength(count);
});
