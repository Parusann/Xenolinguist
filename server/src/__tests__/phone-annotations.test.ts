import { beforeEach, afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { AudioStore } from '../services/audio-store.js';
import { ProfileStore } from '../services/profile-store.js';
import { ProjectArchives } from '../services/project-archive.js';
import { phoneFixture } from './helpers/phone-analysis.js';
import { phoneHistorySchema, phoneAnalysisSchema, retainedPhoneResultSchema } from '../../../shared/schemas/phone-analysis.js';
import { appendPhoneAnalysis, manualPhoneSegments } from '../../../shared/phone-annotations.js';
import type { AudioClip } from '../../../shared/types.js';
import { atomicWrite } from '../services/atomic-file.js';
import request, { testSession } from './authenticated-request.js';
import { createApp } from '../app.js';

let root: string, wav: Buffer, clip: AudioClip;
const now = '2026-10-06T12:00:00.000Z';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-phone-layers-')); process.env.DATA_DIR = root;
  wav = await fs.readFile(new URL('./fixtures/hello-16k.wav', import.meta.url));
  const audio = new AudioStore(), stage = await audio.stage(wav), complete = await audio.complete(stage.id, wav);
  clip = { id: complete.id, filename: 'hello.wav', created_at: now, duration: complete.duration!, waveform: [],
    segments: [{ id: 'manual', start: 0.1, end: 0.5, label: 'manual correction', dictionary_entry_id: null }], assets: { original: complete.original, analysis: complete.analysis! } };
});
afterEach(async () => { delete process.env.DATA_DIR; await fs.rm(root, { recursive: true, force: true }); });
function analysis(id = 'run-one') { return phoneAnalysisSchema.parse({ version: 1, id, created_at: now, originalSha256: clip.assets!.original.sha256, result: phoneFixture(wav) }); }
async function saved() { return new ProfileStore().create({ name: 'Phone layers', audio_clips: [appendPhoneAnalysis(clip, analysis())] }); }

it('appends analyses without touching manual segments and copies only on explicit action', () => {
  const first = analysis(), next = appendPhoneAnalysis(clip, first), again = appendPhoneAnalysis(next, analysis('run-two'));
  expect(again.segments).toEqual(clip.segments); expect(again.phone_analyses).toHaveLength(2);
  expect(appendPhoneAnalysis(again, first)).toEqual(again);
  const copied = manualPhoneSegments(first, () => 'copied'); copied[0].label = 'edited';
  expect(first.result.segments[0].phone).toBe('aa'); expect(copied[0].dictionary_entry_id).toBeNull();
});
it('retains both layers through authenticated mutation, lost-response retry and restart', async () => {
  const p = await saved(), next = appendPhoneAnalysis(p.audio_clips[0], analysis('run-two'));
  next.segments[0].label = 'new manual correction';
  const body = { expectedRevision: p.revision, mutationId: 'save-layers', operations: [{ type: 'put-clip', value: next }] };
  const response = await request(createApp(testSession)).post(`/api/profiles/${p.id}/mutations`).send(body);
  expect(response.status).toBe(200);
  expect(await new ProfileStore().mutate(p.id, body)).toMatchObject({ duplicate: true });
  expect((await new ProfileStore().get(p.id))!.audio_clips[0]).toEqual(next);
});
it('rejects alteration, omission and reordering of retained analyses through both save APIs', async () => {
  const p = await saved(), store = new ProfileStore();
  const variants = [ { ...p.audio_clips[0], phone_analyses: [] }, { ...p.audio_clips[0], phone_analyses: [analysis('different')] },
    { ...p.audio_clips[0], phone_analyses: [{ ...analysis(), created_at: '2026-10-06T13:00:00.000Z' }] } ];
  for (const value of variants) {
    await expect(store.update(p.id, { audio_clips: [value] }, p.revision)).rejects.toMatchObject({ code: 'PHONE_HISTORY_IMMUTABLE' });
    await expect(store.mutate(p.id, { expectedRevision: p.revision, mutationId: 'bad', operations: [{ type: 'put-clip', value }] })).rejects.toMatchObject({ code: 'PHONE_HISTORY_IMMUTABLE' });
  }
  expect((await store.get(p.id))!.revision).toBe(p.revision);
});
it('rejects wrong audio identities, dangling manual sources and unknown record fields', async () => {
  for (const changed of [ { ...analysis(), originalSha256: 'a'.repeat(64) }, { ...analysis(), result: { ...phoneFixture(wav), audio: { ...phoneFixture(wav).audio, sha256: 'b'.repeat(64) } } } ])
    expect(() => appendPhoneAnalysis(clip, changed)).toThrow('does not match');
  await expect(new ProfileStore().create({ name: 'bad', audio_clips: [{ ...clip, manual_source_analysis_id: 'missing' }] })).rejects.toHaveProperty('code', 'PROFILE_INVALID');
  expect(phoneAnalysisSchema.safeParse({ ...analysis(), confidence: 1 }).success).toBe(false);
});
it('rejects inconsistent run geometry, scores and window ownership', () => {
  const result = phoneFixture(wav);
  const cases = [ { ...result, ipa: 'different' }, { ...result, audio: { ...result.audio, durationSeconds: 1 } },
    { ...result, ctc: { ...result.ctc, blankFrames: 2 } }, { ...result, processing: { ...result.processing, chunks: [{ ...result.processing.chunks[0], keepStartFrame: 1 }] } } ];
  for (const value of cases) expect(retainedPhoneResultSchema.safeParse(value).success).toBe(false);
  const corrupt = structuredClone(result); corrupt.ctc.runs[0].candidates[0].meanProbability = 0;
  expect(retainedPhoneResultSchema.safeParse(corrupt).success).toBe(false);
});
it('enforces count limits without silently pruning earlier results', () => {
  const history = Array.from({ length: 8 }, (_, i) => analysis(`run-${i}`));
  expect(phoneHistorySchema.parse(history)).toHaveLength(8);
  expect(() => appendPhoneAnalysis({ ...clip, phone_analyses: history }, analysis('ninth'))).toThrow();
  expect(history[0].id).toBe('run-0'); expect(phoneHistorySchema.safeParse([analysis(), analysis()]).success).toBe(false);
});
it('rejects oversized histories even below the record-count ceiling', async () => {
  const native = JSON.parse(await fs.readFile(new URL('../../../docs/verification/w23-chunks-near-cap.json', import.meta.url), 'utf8'));
  const history = Array.from({ length: 8 }, (_, i) => ({ ...analysis(`large-${i}`), result: native.result }));
  const checked = phoneHistorySchema.safeParse(history);
  expect(checked.success).toBe(false);
  if (!checked.success) expect(checked.error.issues.some(issue => issue.message.includes('4 MiB'))).toBe(true);
});
it('checks stored audio bytes again when a new analysis is appended', async () => {
  const p = await saved();
  await fs.writeFile(path.join(new AudioStore().directory(clip.id), 'analysis'), 'corrupt');
  await expect(new ProfileStore().update(p.id, { audio_clips: [appendPhoneAnalysis(p.audio_clips[0], analysis('run-two'))] }, p.revision))
    .rejects.toMatchObject({ code: 'AUDIO_ASSET_CHANGED' });
});
it('retains the previous analysis and manual edits on stale revision or failed atomic write', async () => {
  const p = await saved(), next = appendPhoneAnalysis(p.audio_clips[0], analysis('run-two'));
  await expect(new ProfileStore().update(p.id, { audio_clips: [next] }, p.revision + 1)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  const store = new ProfileStore(async (file, data, options) => {
    if (file.endsWith(`${p.id}.json`)) throw new Error('injected write failure');
    await atomicWrite(file, data, options);
  });
  await expect(store.update(p.id, { audio_clips: [next] }, p.revision)).rejects.toThrow('injected write failure');
  expect((await new ProfileStore().get(p.id))!.audio_clips).toEqual(p.audio_clips);
});
it('preserves analysis IDs, hashes and manual source links through portable archive remapping', async () => {
  const generated = analysis(), c = appendPhoneAnalysis(clip, generated); c.manual_source_analysis_id = generated.id;
  const p = await new ProfileStore().create({ name: 'portable', audio_clips: [c] });
  const service = new ProjectArchives(), exported = await service.export(p.id, p.revision, true);
  const bytes = await fs.readFile(exported.file); await exported.dispose();
  const preview = await service.inspect(Readable.from([bytes])); const restored = (await service.restore(preview.token, { mode: 'new' })).profile;
  expect(restored.audio_clips[0].id).not.toBe(c.id);
  expect(restored.audio_clips[0].phone_analyses).toEqual(c.phone_analyses);
  expect(restored.audio_clips[0].manual_source_analysis_id).toBe(generated.id);
  expect(restored.audio_clips[0].segments[0].id).not.toBe(c.segments[0].id);
  expect(restored.audio_clips[0].segments[0].label).toBe('manual correction');
});
it('accepts retained native results without inventing provenance for older clips', async () => {
  const native = JSON.parse(await fs.readFile(new URL('../../../docs/verification/w23-chunks-native.json', import.meta.url), 'utf8'));
  expect(retainedPhoneResultSchema.safeParse(native.result).success).toBe(true);
  const p = await new ProfileStore().create({ name: 'legacy layer', audio_clips: [clip] });
  expect(p.audio_clips[0].phone_analyses).toBeUndefined();
});
