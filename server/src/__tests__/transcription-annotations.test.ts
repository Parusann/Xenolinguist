import { beforeEach, afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { AudioStore } from '../services/audio-store.js';
import { ProfileStore } from '../services/profile-store.js';
import { ProjectArchives } from '../services/project-archive.js';
import { transcriptionFixture } from '../../../shared/testing/transcription.js';
import { createHash } from 'node:crypto';
import { phoneFixture } from './helpers/phone-analysis.js';
import { phoneAnalysisSchema } from '../../../shared/schemas/phone-analysis.js';
import { transcriptionHistorySchema, transcriptionAnalysisSchema, transcriptionResultSchema } from '../../../shared/schemas/transcription.js';
import { appendTranscriptionAnalysis, manualTranscriptionSegments } from '../../../shared/transcription-annotations.js';
import type { AudioClip } from '../../../shared/types.js';
import { atomicWrite } from '../services/atomic-file.js';
import request, { testSession } from './authenticated-request.js';
import { createApp } from '../app.js';

let root: string, wav: Buffer, clip: AudioClip;
const now = '2026-10-09T12:00:00.000Z';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-transcription-layers-')); process.env.DATA_DIR = root;
  wav = await fs.readFile(new URL('./fixtures/hello-16k.wav', import.meta.url));
  const audio = new AudioStore(), stage = await audio.stage(wav), complete = await audio.complete(stage.id, wav);
  clip = { id: complete.id, filename: 'hello.wav', created_at: now, duration: complete.duration!, waveform: [],
    segments: [{ id: 'manual', start: 0.1, end: 0.5, label: 'manual correction', dictionary_entry_id: null }], assets: { original: complete.original, analysis: complete.analysis! } };
});
afterEach(async () => { delete process.env.DATA_DIR; await fs.rm(root, { recursive: true, force: true }); });
function result() { return transcriptionFixture(createHash('sha256').update(wav).digest('hex'), (wav.length - 44) / 2); }
function analysis(id = 'run-one') { return transcriptionAnalysisSchema.parse({ version: 1, id, created_at: now, originalSha256: clip.assets!.original.sha256, result: result() }); }
async function saved() { return new ProfileStore().create({ name: 'Transcription layers', audio_clips: [appendTranscriptionAnalysis(clip, analysis())] }); }

it('appends analyses without touching manual segments and copies only on explicit action', () => {
  const first = analysis(), next = appendTranscriptionAnalysis(clip, first), again = appendTranscriptionAnalysis(next, analysis('run-two'));
  expect(again.segments).toEqual(clip.segments); expect(again.transcriptions).toHaveLength(2);
  expect(appendTranscriptionAnalysis(again, first)).toEqual(again);
  const copied = manualTranscriptionSegments(first, () => 'copied'); copied[0].label = 'edited';
  expect(first.result.segments[0].text).toBe('test'); expect(copied[0].dictionary_entry_id).toBeNull();
});
it('retains both layers through authenticated mutation, lost-response retry and restart', async () => {
  const p = await saved(), next = appendTranscriptionAnalysis(p.audio_clips[0], analysis('run-two'));
  next.segments[0].label = 'new manual correction';
  const body = { expectedRevision: p.revision, mutationId: 'save-layers', operations: [{ type: 'put-clip', value: next }] };
  const response = await request(createApp(testSession)).post(`/api/profiles/${p.id}/mutations`).send(body);
  expect(response.status).toBe(200);
  expect(await new ProfileStore().mutate(p.id, body)).toMatchObject({ duplicate: true });
  expect((await new ProfileStore().get(p.id))!.audio_clips[0]).toEqual(next);
});
it('rejects alteration, omission and reordering of retained analyses through both save APIs', async () => {
  const p = await saved(), store = new ProfileStore();
  const variants = [ { ...p.audio_clips[0], transcriptions: [] }, { ...p.audio_clips[0], transcriptions: [analysis('different')] },
    { ...p.audio_clips[0], transcriptions: [{ ...analysis(), created_at: '2026-10-09T13:00:00.000Z' }] } ];
  for (const value of variants) {
    await expect(store.update(p.id, { audio_clips: [value] }, p.revision)).rejects.toMatchObject({ code: 'TRANSCRIPTION_HISTORY_IMMUTABLE' });
    await expect(store.mutate(p.id, { expectedRevision: p.revision, mutationId: 'bad', operations: [{ type: 'put-clip', value }] })).rejects.toMatchObject({ code: 'TRANSCRIPTION_HISTORY_IMMUTABLE' });
  }
  expect((await store.get(p.id))!.revision).toBe(p.revision);
});
it('rejects wrong audio identities, dangling manual sources and unknown record fields', async () => {
  for (const changed of [ { ...analysis(), originalSha256: 'a'.repeat(64) }, { ...analysis(), result: { ...result(), audio: { ...result().audio, sha256: 'b'.repeat(64) } } } ])
    expect(() => appendTranscriptionAnalysis(clip, changed)).toThrow('does not match');
  await expect(new ProfileStore().create({ name: 'bad', audio_clips: [{ ...clip, manual_source_transcription_id: 'missing' }] })).rejects.toHaveProperty('code', 'PROFILE_INVALID');
  expect(transcriptionAnalysisSchema.safeParse({ ...analysis(), confidence: 1 }).success).toBe(false);
});
it('enforces count limits without silently pruning earlier results', () => {
  const history = Array.from({ length: 8 }, (_, i) => analysis(`run-${i}`));
  expect(transcriptionHistorySchema.parse(history)).toHaveLength(8);
  expect(() => appendTranscriptionAnalysis({ ...clip, transcriptions: history }, analysis('ninth'))).toThrow();
  expect(history[0].id).toBe('run-0'); expect(transcriptionHistorySchema.safeParse([analysis(), analysis()]).success).toBe(false);
});
it('rejects histories above the byte budget without pruning earlier results', () => {
  const large = result();
  large.segments = Array.from({ length: 10 }, (_, i) => ({ start: i / 10, end: (i + 1) / 10, text: '界'.repeat(19999) }));
  large.text = large.segments.map(s => s.text).join(' ');
  const history = Array.from({ length: 8 }, (_, i) => ({ ...analysis(`large-${i}`), result: large }));
  const checked = transcriptionHistorySchema.safeParse(history);
  expect(checked.success).toBe(false);
  if (!checked.success) expect(checked.error.issues.some(issue => issue.message.includes('4 MiB'))).toBe(true);
});
it('checks stored audio bytes again when a new analysis is appended', async () => {
  const p = await saved();
  await fs.writeFile(path.join(new AudioStore().directory(clip.id), 'analysis'), 'corrupt');
  await expect(new ProfileStore().update(p.id, { audio_clips: [appendTranscriptionAnalysis(p.audio_clips[0], analysis('run-two'))] }, p.revision))
    .rejects.toMatchObject({ code: 'AUDIO_ASSET_CHANGED' });
});
it('retains the previous analysis and manual edits on stale revision or failed atomic write', async () => {
  const p = await saved(), next = appendTranscriptionAnalysis(p.audio_clips[0], analysis('run-two'));
  await expect(new ProfileStore().update(p.id, { audio_clips: [next] }, p.revision + 1)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  const store = new ProfileStore(async (file, data, options) => {
    if (file.endsWith(`${p.id}.json`)) throw new Error('injected write failure');
    await atomicWrite(file, data, options);
  });
  await expect(store.update(p.id, { audio_clips: [next] }, p.revision)).rejects.toThrow('injected write failure');
  expect((await new ProfileStore().get(p.id))!.audio_clips).toEqual(p.audio_clips);
});
it('preserves analysis IDs, hashes and manual source links through portable archive remapping', async () => {
  const generated = analysis(), c = appendTranscriptionAnalysis(clip, generated); c.manual_source_transcription_id = generated.id;
  const p = await new ProfileStore().create({ name: 'portable', audio_clips: [c] });
  const service = new ProjectArchives(), exported = await service.export(p.id, p.revision, true);
  const bytes = await fs.readFile(exported.file); await exported.dispose();
  const preview = await service.inspect(Readable.from([bytes])); const restored = (await service.restore(preview.token, { mode: 'new' })).profile;
  expect(restored.audio_clips[0].id).not.toBe(c.id);
  expect(restored.audio_clips[0].transcriptions).toEqual(c.transcriptions);
  expect(restored.audio_clips[0].manual_source_transcription_id).toBe(generated.id);
  expect(restored.audio_clips[0].segments[0].id).not.toBe(c.segments[0].id);
  expect(restored.audio_clips[0].segments[0].label).toBe('manual correction');
});
it('accepts retained native results without inventing provenance for older clips', async () => {
  const native = JSON.parse(await fs.readFile(new URL('../../../docs/verification/w23-stt-native.json', import.meta.url), 'utf8'));
  expect(transcriptionResultSchema.safeParse(native.automatic).success).toBe(true);
  const p = await new ProfileStore().create({ name: 'legacy layer', audio_clips: [clip] });
  expect(p.audio_clips[0].transcriptions).toBeUndefined();
});

it('rejects ambiguous manual source links and preserves a phone history alongside transcription', async () => {
  const phone = phoneAnalysisSchema.parse({ version: 1, id: 'phone-one', created_at: now, originalSha256: clip.assets!.original.sha256, result: phoneFixture(wav) });
  const both = appendTranscriptionAnalysis({ ...clip, phone_analyses: [phone], manual_source_analysis_id: phone.id }, analysis());
  expect(both.phone_analyses).toEqual([phone]);
  await expect(new ProfileStore().create({ name: 'ambiguous', audio_clips: [{ ...both, manual_source_transcription_id: analysis().id }] })).rejects.toHaveProperty('code', 'PROFILE_INVALID');
});
