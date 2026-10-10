import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseProfile, audioClipSchema } from '../../shared/schemas/profile.js';
import { transcriptionAnnotationIssues, appendTranscriptionAnalysis, preserveTranscriptionHistory, manualTranscriptionSegments } from '../../shared/transcription-annotations.js';
import { createHash } from 'node:crypto';

const here = new URL('.', import.meta.url);
async function read(name: string) { return JSON.parse(await readFile(new URL(name, here), 'utf8')); }
const verification = await read('w23-transcripts-verification.json');
assert.equal(verification.implementationRevision, 'dd472e09e0ea72174ac8d269a994cab258e92922');
for (const ci of [verification.sourceCi, verification.installedCi]) {
  assert.equal(ci.headSha, verification.implementationRevision);
  assert.equal(ci.conclusion, 'success');
}
for (const [name, expected] of Object.entries(verification.artifacts) as [string, { bytes: number; sha256: string }][]) {
  const bytes = await readFile(new URL(name, here));
  assert.equal(bytes.length, expected.bytes, `${name}: byte count`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, `${name}: digest`);
}
for (const platform of ['linux', 'windows']) {
  const record = await read(`w23-transcripts-browser-${platform}.json`);
  const saved = parseProfile(record.saved), analyzed = parseProfile(record.analyzed), restored = parseProfile(record.restored);
  assert.deepEqual(record.errors, []);
  assert.equal(saved.audio_clips[0].transcriptions?.length, 2);
  assert.equal(analyzed.audio_clips[0].transcriptions?.length, 3);
  assert.deepEqual(analyzed.audio_clips[0].transcriptions!.slice(0, 2), saved.audio_clips[0].transcriptions);
  assert.deepEqual(analyzed.audio_clips[0].transcriptions, restored.audio_clips[0].transcriptions);
  for (const p of [analyzed, restored]) {
    const c = p.audio_clips[0];
    assert.equal(c.segments[0].label, 'saved correction');
    assert.equal(c.segments[0].dictionary_entry_id, p.dictionary[0].id);
    assert.equal(c.manual_source_transcription_id, c.transcriptions![0].id);
    assert.equal(c.manual_source_analysis_id, undefined);
  }
  assert.notEqual(analyzed.audio_clips[0].id, restored.audio_clips[0].id);
}
const installed = await read('w23-transcripts-installed.json');
assert.equal(installed.source.revision, 'dd472e09e0ea72174ac8d269a994cab258e92922');
const source = audioClipSchema.parse(installed.sourceClip), restored = audioClipSchema.parse(installed.restoredClip);
assert.equal(source.transcriptions?.length, 2);
assert.deepEqual(source.transcriptions, restored.transcriptions);
assert.deepEqual(source.phone_analyses, restored.phone_analyses);
assert.notEqual(source.id, restored.id);
assert.deepEqual(transcriptionAnnotationIssues(source), []);
assert.deepEqual(transcriptionAnnotationIssues(restored), []);
assert.equal(source.segments[0].label, 'retained manual correction');
assert.equal(restored.segments[0].label, source.segments[0].label);
assert.equal(source.manual_source_analysis_id, source.phone_analyses![0].id);
assert.equal(restored.manual_source_analysis_id, source.manual_source_analysis_id);
const wav = await readFile(new URL('../../server/src/__tests__/fixtures/hello-16k.wav', here));
assert.equal(createHash('sha256').update(wav).digest('hex'), source.assets!.original.sha256);
for (const a of source.transcriptions!) {
  assert.equal(a.originalSha256, source.assets!.original.sha256);
  assert.equal(a.result.audio.sha256, source.assets!.analysis.sha256);
  for (const file of a.result.provenance.runtimeFiles) {
    const actual = installed.runtimeFiles.find((f: { file: string }) => f.file.replaceAll('\\', '/').split('/').at(-1) === file.file);
    assert.ok(actual); assert.equal(file.sha256, actual.sha256); assert.equal(file.bytes, actual.bytes);
  }
}
const next = appendTranscriptionAnalysis(source, { ...source.transcriptions![0], id: 'replay-third-transcription' });
assert.deepEqual(next.segments, source.segments); preserveTranscriptionHistory(next, source);
assert.throws(() => preserveTranscriptionHistory({ ...source, transcriptions: [] }, source));
assert.throws(() => preserveTranscriptionHistory({ ...source, transcriptions: [...source.transcriptions!].reverse() }, source));
const manual = manualTranscriptionSegments(source.transcriptions![0], () => 'replay-manual');
manual[0].label = 'replay-only correction';
assert.notEqual(manual[0].label, source.transcriptions![0].result.segments[0].text);
console.log(JSON.stringify({ passed: true, browserPlatforms: 2, installedTranscriptions: 2,
  scope: 'Validates retained records, generated/manual separation, recorded prepared-audio identity, original fixture bytes, native inventory and archive mapping. Does not rerun inference or score recognition accuracy.' }));
