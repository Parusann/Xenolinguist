import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { ZipFile } from 'yazl';
import * as yauzl from 'yauzl';
import { ProjectArchives } from '../services/project-archive.js';
import { ProfileStore } from '../services/profile-store.js';
import { AudioStore } from '../services/audio-store.js';
import { createSandboxSession, applySandboxAction, sandboxStats } from '../../../shared/sandbox/session.js';
import { ARCHIVE_LIMITS } from '../../../shared/schemas/archive.js';
import { atomicWrite } from '../services/atomic-file.js';
import request, { testSession } from './authenticated-request.js';
import supertest from 'supertest';
import { createApp } from '../app.js';

let root: string, wav: Buffer;
const now = '2026-09-15T10:00:00.000Z';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-archive-'));
  process.env.DATA_DIR = path.join(root, 'source');
  wav = await fs.readFile(new URL('./fixtures/hello-16k.wav', import.meta.url));
});
afterEach(async () => { delete process.env.DATA_DIR; await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const store = new ProfileStore(), audio = new AudioStore();
  const staged = await audio.stage(wav), complete = await audio.complete(staged.id, wav);
  const base = await store.create({ name: 'Portable language', description: 'Independent evidence and practice', is_sandbox: true,
    dictionary: [{ id: 'word', alien_word: 'tal', english_meaning: 'sky', part_of_speech: 'noun', confidence: null, context: 'Seen twice', examples: ['tal'], notes: '', created_at: now }],
    grammar_rules: [{ id: 'rule', rule: 'Subject first', evidence: ['tal'], confidence: null, created_at: now }],
    audio_clips: [{ id: complete.id, filename: 'hello.wav', created_at: now, duration: complete.duration!, waveform: [0.1],
      segments: [{ id: 'segment', start: 0, end: 1, label: 'tal', dictionary_entry_id: 'word' }], assets: { original: complete.original, analysis: complete.analysis! } }],
    samples: [{ id: 'sample', alien_text: 'tal', english_translation: 'sky', source: 'field', phonetic_notes: 'tɑl', decoded: false, audio_id: complete.id, ipa: 'tɑl', created_at: now }],
    ai_history: [{ id: 'proposal', role: 'assistant', content: 'Possible sky meaning; unverified.', state: 'complete', timestamp: now, model: 'fixture-model', task: 'patternAnalysis' }],
    sandbox_session: createSandboxSession({ language_name: 'Test', phoneme_set: ['a'], number_base: 10, word_order: 'SVO', rules: ['Subject first'],
      number_words: { '1': 'ka', '2': 'ki', '3': 'ku' }, vocabulary: [{ alien: 'tal', english: 'sky', pos: 'noun' }],
      sample_sentences: [{ alien: 'tal', english: 'sky' }] }, 'session', now, 'fixture-model') });
  const guessed = applySandboxAction(base, 'session', { type: 'guess', challengeId: 'number-0', value: '1' }, 'guess', now);
  const answered = applySandboxAction(guessed, 'session', { type: 'check', challengeId: 'number-0' }, 'attempt', now);
  return (await store.update(base.id, { sandbox_session: answered.sandbox_session }, base.revision))!;
}
async function archive(includeSandbox = true) {
  const profile = await fixture(), service = new ProjectArchives(), exported = await service.export(profile.id, profile.revision, includeSandbox);
  const bytes = await fs.readFile(exported.file); await exported.dispose(); return { profile, bytes };
}
async function unpack(bytes: Buffer) {
  const zip = await yauzl.fromBufferPromise(bytes, { lazyEntries: true }), members = new Map<string, Buffer>();
  for await (const entry of zip.eachEntry()) {
    const chunks: Buffer[] = []; for await (const chunk of await zip.openReadStreamPromise(entry)) chunks.push(chunk);
    members.set(entry.fileName, Buffer.concat(chunks));
  }
  return members;
}
async function pack(members: Map<string, Buffer>, extra?: (zip: ZipFile) => void) {
  const zip = new ZipFile(); for (const [name, bytes] of members) zip.addBuffer(bytes, name, { compress: false });
  extra?.(zip); zip.end(); const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream as Readable) chunks.push(chunk);
  return Buffer.concat(chunks);
}
function rewriteManifest(members: Map<string, Buffer>) {
  const manifest = JSON.parse(members.get('manifest.json')!.toString());
  manifest.members = [...members].filter(([name]) => name !== 'manifest.json').map(([name, bytes]) => ({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
  members.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
}

describe('portable project archives', () => {
  it('retains executable grammar and lexical frames through mutation and archive ID remapping', async () => {
    const store = new ProfileStore(), profile = await fixture();
    const executable = { kind: 'plural-affix', position: 'suffix', affix: '-en' };
    const updated = await store.mutate(profile.id, { expectedRevision: profile.revision, mutationId: 'typed-grammar', operations: [
      { type: 'put-rule', value: { ...profile.grammar_rules[0], executable } },
      { type: 'put-word', value: { ...profile.dictionary[0], english_plural: 'skies' } },
    ] });
    const exported = await new ProjectArchives().export(profile.id, updated!.profile.revision, true);
    const bytes = await fs.readFile(exported.file); await exported.dispose();
    process.env.DATA_DIR = path.join(root, 'grammar-destination');
    const archives = new ProjectArchives(), preview = await archives.inspect(Readable.from([bytes]));
    const { profile: restored } = await archives.restore(preview.token, { mode: 'new' });
    expect(restored.grammar_rules[0].executable).toEqual(executable);
    expect(restored.grammar_rules[0].id).not.toBe(profile.grammar_rules[0].id);
    expect(restored.dictionary[0].english_plural).toBe('skies');
    const { derive } = await import('../../../engine/src/translation/derive.js');
    const result = derive('tal-en', restored);
    expect(result.status).toBe('resolved');
    expect(result.candidates[0].ruleIds).toEqual([restored.grammar_rules[0].id]);
    expect(result.candidates[0].tree).toMatchObject({ kind: 'nominal', nominal: { englishPlural: 'skies' } });
    const invalid = await request(createApp(testSession)).post(`/api/profiles/${restored.id}/mutations`).send({ expectedRevision: restored.revision, mutationId: 'invalid-grammar',
      operations: [{ type: 'put-rule', value: { ...restored.grammar_rules[0], executable: { ...executable, affix: '' } } }] });
    expect(invalid.status).toBe(400);
    expect((await new ProfileStore().get(restored.id))!.grammar_rules).toEqual(restored.grammar_rules);
  });

  it('persists lexical policy and explicit senses through mutation, reload and archive remapping', async () => {
    const store = new ProfileStore(), profile = await fixture();
    const policy = { caseSensitive: true, apostrophes: 'boundary', hyphens: 'internal', segmentation: 'dictionary' };
    const word = { ...profile.dictionary[0], alien_word: '水', english_meaning: 'water / liquid',
      form_aliases: ['மீன்'], senses: [{ meaning: 'water', aliases: ['fresh water'] }, { meaning: 'liquid', aliases: [] }] };
    const updated = await store.mutate(profile.id, { expectedRevision: profile.revision, mutationId: 'lexical', operations: [
      { type: 'set-fields', fields: { lexical_policy: policy } }, { type: 'put-word', value: word },
    ] });
    const saved = (await new ProfileStore().get(profile.id))!;
    expect(saved.lexical_policy).toEqual(policy);
    expect(saved.dictionary[0]).toMatchObject(word);
    const exported = await new ProjectArchives().export(saved.id, updated!.profile.revision, true);
    const bytes = await fs.readFile(exported.file); await exported.dispose();
    process.env.DATA_DIR = path.join(root, 'lexical-destination');
    const archives = new ProjectArchives(), preview = await archives.inspect(Readable.from([bytes]));
    const { profile: restored } = await archives.restore(preview.token, { mode: 'new' });
    expect(restored.lexical_policy).toEqual(policy);
    expect(restored.dictionary[0]).toMatchObject({ ...word, id: restored.dictionary[0].id });
    expect(restored.dictionary[0].id).not.toBe(word.id);
    const invalid = await request(createApp(testSession)).post(`/api/profiles/${restored.id}/mutations`).send({ expectedRevision: restored.revision, mutationId: 'invalid-sense',
      operations: [{ type: 'put-word', value: { ...restored.dictionary[0], senses: [{ meaning: '', aliases: [] }] } }] });
    expect(invalid.status).toBe(400);
    expect((await new ProfileStore().get(restored.id))!.dictionary).toEqual(restored.dictionary);
  });

  it('restores all saved state and byte-identical audio into an independent empty data directory', async () => {
    const { profile, bytes } = await archive(); process.env.DATA_DIR = path.join(root, 'destination');
    const service = new ProjectArchives(), preview = await service.inspect(Readable.from([bytes]));
    expect(preview.counts).toEqual({ words: 1, rules: 1, samples: 1, recordings: 1, proposals: 1, snapshots: 1 });
    expect(await new ProfileStore().list()).toEqual([]);
    const { profile: restored } = await service.restore(preview.token, { mode: 'new' });
    expect(restored.id).not.toBe(profile.id); expect(restored.description).toBe(profile.description);
    expect(restored.samples[0].audio_id).toBe(restored.audio_clips[0].id);
    expect(restored.audio_clips[0].segments[0].dictionary_entry_id).toBe(restored.dictionary[0].id);
    expect(restored.dictionary[0].id).not.toBe(profile.dictionary[0].id);
    expect(restored.audio_clips[0].id).not.toBe(profile.audio_clips[0].id);
    expect(restored.samples[0].ipa).toBe(profile.samples[0].ipa);
    expect(restored.metric_snapshots).toEqual(profile.metric_snapshots);
    expect(restored.ai_history?.[0]).toMatchObject({ content: profile.ai_history![0].content, model: 'fixture-model' });
    expect(sandboxStats(restored.sandbox_session!)).toEqual(sandboxStats(profile.sandbox_session!));
    expect(restored.sandbox_session!.challenges).toEqual(profile.sandbox_session!.challenges);
    expect(restored.sandbox_session!.events[0].id).not.toBe(profile.sandbox_session!.events[0].id);
    await new AudioStore().verifyProfile(restored);
    for (const kind of ['original', 'analysis'] as const)
      expect(await new AudioStore().verifyFile(restored.audio_clips[0].id, kind, restored.audio_clips[0].assets![kind])).toEqual(wav);
    const app = createApp(testSession);
    expect((await request(app).get(`/api/audio/${restored.audio_clips[0].id}`)).body).toEqual(wav);
    const answered = applySandboxAction(restored, restored.sandbox_session!.id, { type: 'guess', challengeId: 'number-1', value: '2' }, 'new-guess', now);
    const checked = applySandboxAction(answered, answered.sandbox_session!.id, { type: 'check', challengeId: 'number-1' }, 'new-attempt', now);
    expect(checked.sandbox_session!.events.length).toBe(2);
    expect(await new ProfileStore().get(restored.id)).toEqual(restored);
    await expect(service.restore(preview.token, { mode: 'new' })).rejects.toMatchObject({ code: 'ARCHIVE_EXPIRED' });
    const again = await service.inspect(Readable.from([bytes]));
    const second = await service.restore(again.token, { mode: 'new' });
    expect(second.profile.audio_clips[0].id).not.toBe(restored.audio_clips[0].id);
  });
  it('excludes sandbox state unless explicitly selected and preserves legacy audio', async () => {
    const { bytes } = await archive(false), service = new ProjectArchives();
    const preview = await service.inspect(Readable.from([bytes]));
    expect(preview.sandboxIncluded).toBe(false);
    expect((await service.restore(preview.token, { mode: 'new' })).profile.sandbox_session).toBeUndefined();
    const members = await unpack(bytes), raw = JSON.parse(members.get('profile.json')!.toString()), clip = raw.audio_clips[0];
    delete clip.assets;
    members.delete(`audio/${clip.id}/original`); members.delete(`audio/${clip.id}/analysis`);
    members.set(`audio/${clip.id}/legacy.wav`, wav); members.set('profile.json', Buffer.from(JSON.stringify(raw))); rewriteManifest(members);
    const legacy = await service.inspect(Readable.from([await pack(members)]));
    expect(legacy.warnings.join(' ')).toContain('Legacy');
    const restored = await service.restore(legacy.token, { mode: 'new' });
    expect(await fs.readFile(path.join(process.env.DATA_DIR!, 'audio', `${restored.profile.audio_clips[0].id}.wav`))).toEqual(wav);
  });
  it('checks replacement revisions, keeps a complete independent backup and restores that backup', async () => {
    const { profile, bytes } = await archive(), service = new ProjectArchives();
    const target = (await new ProfileStore().update(profile.id, { name: 'Current project' }, profile.revision))!;
    const preview = await service.inspect(Readable.from([bytes]));
    await expect(service.restore(preview.token, { mode: 'replace', targetId: target.id, expectedRevision: profile.revision })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const result = await service.restore(preview.token, { mode: 'replace', targetId: target.id, expectedRevision: target.revision });
    expect(result.profile.id).toBe(target.id); expect(result.profile.revision).toBe(target.revision + 1);
    const backup = await fs.readFile(path.join(process.env.DATA_DIR!, 'archive-backups', result.backupId!));
    const backupPreview = await service.inspect(Readable.from([backup]));
    const recovered = await service.restore(backupPreview.token, { mode: 'new' });
    expect(recovered.profile.name).toBe('Current project');
    expect(recovered.profile.sandbox_session!.events).toHaveLength(1);
    expect(await new AudioStore().verifyFile(recovered.profile.audio_clips[0].id, 'original', recovered.profile.audio_clips[0].assets!.original)).toEqual(wav);
  });
  it('keeps the old profile byte-for-byte if publication fails, then permits a clean retry', async () => {
    const { profile, bytes } = await archive(), file = path.join(process.env.DATA_DIR!, 'profiles', `${profile.id}.json`);
    const before = await fs.readFile(file);
    let fail = true;
    const store = new ProfileStore(async (target, content, options) => {
      if (target === file && fail) throw new Error('Injected publication failure');
      return atomicWrite(target, content, options);
    });
    const service = new ProjectArchives(store), preview = await service.inspect(Readable.from([bytes]));
    await expect(service.restore(preview.token, { mode: 'replace', targetId: profile.id, expectedRevision: profile.revision })).rejects.toThrow('Injected');
    expect(await fs.readFile(file)).toEqual(before);
    expect((await new ProfileStore().get(profile.id))!.samples).toEqual(profile.samples);
    await new AudioStore().verifyProfile(profile);
    fail = false;
    expect((await service.restore(preview.token, { mode: 'replace', targetId: profile.id, expectedRevision: profile.revision })).profile.revision).toBe(profile.revision + 1);
  });
  it.each(['truncated', 'checksum', 'missing-audio', 'future', 'extra-field', 'duplicate', 'path', 'symlink', 'ratio', 'entry-count', 'wrong-audio'])('rejects %s before writing live data', async failure => {
    const { profile, bytes } = await archive(), members = await unpack(bytes), originalFile = path.join(process.env.DATA_DIR!, 'profiles', `${profile.id}.json`);
    const original = await fs.readFile(originalFile), raw = JSON.parse(members.get('profile.json')!.toString());
    let changed = bytes;
    if (failure === 'truncated') changed = bytes.subarray(0, bytes.length - 40);
    if (failure === 'checksum') members.set('profile.json', Buffer.from('{}'));
    if (failure === 'missing-audio') members.delete(`audio/${profile.audio_clips[0].id}/analysis`);
    if (failure === 'future') { const manifest = JSON.parse(members.get('manifest.json')!.toString()); manifest.archiveVersion = 99; members.set('manifest.json', Buffer.from(JSON.stringify(manifest))); }
    if (failure === 'extra-field') { raw.futureEvidence = []; members.set('profile.json', Buffer.from(JSON.stringify(raw))); rewriteManifest(members); }
    if (failure === 'wrong-audio') {
      const invalid = Buffer.from('not a WAV'); members.set(`audio/${profile.audio_clips[0].id}/analysis`, invalid);
      raw.audio_clips[0].assets.analysis.bytes = invalid.length; raw.audio_clips[0].assets.analysis.sha256 = createHash('sha256').update(invalid).digest('hex');
      members.set('profile.json', Buffer.from(JSON.stringify(raw))); rewriteManifest(members);
    }
    if (!['truncated', 'path', 'entry-count', 'ratio'].includes(failure)) changed = await pack(members, zip => {
      if (failure === 'duplicate') zip.addBuffer(members.get('profile.json')!, 'profile.json');
      if (failure === 'symlink') zip.addBuffer(Buffer.from('/outside'), 'audio/link/original', { mode: 0o120777 });
    });
    if (failure === 'path') changed = Buffer.from(bytes.toString('latin1').replaceAll('profile.json', '../evil.json'), 'latin1');
    if (failure === 'entry-count') { changed = Buffer.from(bytes); const end = changed.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); changed.writeUInt16LE(ARCHIVE_LIMITS.entries + 1, end + 8); changed.writeUInt16LE(ARCHIVE_LIMITS.entries + 1, end + 10); }
    if (failure === 'ratio') changed = await pack(new Map(), zip => zip.addBuffer(Buffer.alloc(2 * 1024 * 1024), 'profile.json', { compress: true }));
    await expect(new ProjectArchives().inspect(Readable.from([changed]))).rejects.toMatchObject({ code: failure === 'future' ? 'ARCHIVE_VERSION_UNSUPPORTED' : 'ARCHIVE_INVALID' });
    expect(await fs.readFile(originalFile)).toEqual(original);
    expect(await fs.readdir(path.join(process.env.DATA_DIR!, 'archive-staging'))).toEqual([]);
  });
  it('rejects tampering after preview and missing evidence during export without replacing the project', async () => {
    const { profile, bytes } = await archive(), service = new ProjectArchives();
    const preview = await service.inspect(Readable.from([bytes]));
    await fs.writeFile(path.join(process.env.DATA_DIR!, 'archive-staging', preview.token, 'member-1'), 'tampered');
    await expect(service.restore(preview.token, { mode: 'new' })).rejects.toMatchObject({ code: 'ARCHIVE_INVALID' });
    expect(await new ProfileStore().list()).toHaveLength(1);
    await service.discard(preview.token);
    await fs.unlink(path.join(new AudioStore().directory(profile.audio_clips[0].id), 'original'));
    await expect(service.export(profile.id, profile.revision, true)).rejects.toThrow();
  });
  it('serves authenticated binary archive inspection and restore with strict replacement options', async () => {
    const { bytes } = await archive(), app = createApp(testSession);
    expect((await supertest(app).post('/api/archives/inspect').type('application/octet-stream').send(Buffer.from('unauthorized'))).status).toBe(401);
    expect((await request(app).post('/api/archives/inspect').send({ bytes: 'invalid' })).status).toBe(415);
    const preview = await request(app).post('/api/archives/inspect').type('application/octet-stream').send(bytes);
    expect(preview.status).toBe(201);
    expect((await request(app).post(`/api/archives/${preview.body.token}/restore`).send({ mode: 'replace' })).status).toBe(400);
    const restored = await request(app).post(`/api/archives/${preview.body.token}/restore`).send({ mode: 'new' });
    expect(restored.status).toBe(201);
    expect(restored.body.profile.name).toBe('Portable language');
  });
});
