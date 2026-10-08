import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseProfile, audioClipSchema } from '../../shared/schemas/profile.js';
import { phoneAnnotationIssues, appendPhoneAnalysis, preservePhoneHistory, manualPhoneSegments } from '../../shared/phone-annotations.js';
const here = new URL('.', import.meta.url);
async function read(name: string) { return JSON.parse(await readFile(new URL(name, here), 'utf8')); }
for (const platform of ['linux', 'windows']) {
  const record = await read(`w23-layers-browser-${platform}.json`);
  const saved = parseProfile(record.saved), analyzed = parseProfile(record.analyzed), restored = parseProfile(record.restored);
  assert.deepEqual(record.errors, []);
  assert.equal(saved.audio_clips[0].phone_analyses?.length, 2);
  assert.equal(analyzed.audio_clips[0].phone_analyses?.length, 3);
  assert.deepEqual(analyzed.audio_clips[0].phone_analyses!.slice(0, 2), saved.audio_clips[0].phone_analyses);
  assert.deepEqual(analyzed.audio_clips[0].phone_analyses, restored.audio_clips[0].phone_analyses);
  for (const p of [analyzed, restored]) {
    assert.equal(p.audio_clips[0].segments[0].label, 'saved correction');
    assert.equal(p.audio_clips[0].segments[0].dictionary_entry_id, p.dictionary[0].id);
    assert.equal(p.audio_clips[0].manual_source_analysis_id, p.audio_clips[0].phone_analyses![0].id);
  }
  assert.notEqual(analyzed.audio_clips[0].id, restored.audio_clips[0].id);
}
const installed = await read('w23-layers-installed.json');
assert.equal(installed.passed, true);
const source = audioClipSchema.parse(installed.sourceClip), restored = audioClipSchema.parse(installed.restoredClip);
assert.equal(source.phone_analyses?.length, 2);
assert.deepEqual(source.phone_analyses, restored.phone_analyses);
assert.notEqual(source.id, restored.id);
assert.deepEqual(source.segments.map(s => ({ ...s, id: '' })), restored.segments.map(s => ({ ...s, id: '' })));
assert.equal(source.segments[0].label, 'retained manual correction');
for (const clip of [source, restored]) {
  assert.deepEqual(phoneAnnotationIssues(clip), []);
  assert.equal(clip.manual_source_analysis_id, clip.phone_analyses![0].id);
  assert.equal(clip.assets!.original.sha256, installed.fixture.sha256);
}
const fixture = await readFile(new URL('../../server/src/__tests__/fixtures/hello-16k.wav', here));
assert.equal(createHash('sha256').update(fixture).digest('hex'), installed.fixture.sha256);
const appended = appendPhoneAnalysis(source, { ...source.phone_analyses![0], id: 'replay-only-third-analysis' });
assert.deepEqual(appended.segments, source.segments);
assert.equal(appended.phone_analyses?.length, 3);
preservePhoneHistory(appended, source);
assert.throws(() => preservePhoneHistory({ ...source, phone_analyses: [] }, source));
assert.throws(() => preservePhoneHistory({ ...source, phone_analyses: [...source.phone_analyses!].reverse() }, source));
let id = 0;
const copied = manualPhoneSegments(source.phone_analyses![0], () => `replay-segment-${id++}`);
copied[0].label = 'replay-only correction';
assert.notEqual(copied[0].label, source.phone_analyses![0].result.segments[0].phone);
console.log(JSON.stringify({ passed: true, revision: installed.source.revision, browserPlatforms: 2, browserAnalysesPerPlatform: 3,
  installedAnalyses: 2, originalSha256: installed.fixture.sha256, manualCorrection: source.segments[0].label,
  scope: 'Validates retained browser/native metadata, archive identity mapping, immutable history and independent manual copying. Does not rerun inference or reproduce native logits, timing or accuracy.' }));
