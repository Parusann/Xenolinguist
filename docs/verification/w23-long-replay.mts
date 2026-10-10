import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseProfile, audioClipSchema } from '../../shared/schemas/profile.js';
import { retainedPhoneResultSchema } from '../../shared/schemas/phone-analysis.js';
import { phoneAnnotationIssues } from '../../shared/phone-annotations.js';
import { planPhoneChunks } from '../../server/src/services/audio-chunks.js';
import { wavToFloat32 } from '../../server/src/services/ipa-phones.js';
import { longAudio } from '../../server/src/__tests__/helpers/long-audio.js';
// @ts-expect-error The standalone acceptance helper is JavaScript.
import { repeatPhoneFixture, verifyPhoneChunks } from '../../scripts/verify-phone-analysis.mjs';

const here = new URL('.', import.meta.url);
const read = async (name: string) => JSON.parse(await readFile(new URL(name, here), 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const verification = await read('w23-long-verification.json');
const revision = '448ddb33d633ab784ed67e8fd975237f8f757c34';
const runtimeRevision = 'ff854243d50970cfe8351f203682e75babce90ed';
assert.equal(verification.implementationRevision, revision);
for (const ci of [verification.sourceCi, verification.installedCi]) {
  assert.equal(ci.headSha, revision); assert.equal(ci.conclusion, 'success');
}
for (const [name, expected] of Object.entries(verification.artifacts) as [string, { bytes: number; sha256: string }][]) {
  const bytes = await readFile(new URL(name, here));
  assert.equal(bytes.length, expected.bytes, name); assert.equal(sha(bytes), expected.sha256, name);
}
const originalHash = sha(longAudio());
for (const platform of ['linux', 'windows']) {
  const record = await read(`w23-long-browser-${platform}.json`);
  assert.deepEqual(record.errors, []);
  const saved = parseProfile(record.saved).audio_clips[0], restored = parseProfile(record.restored).audio_clips[0];
  assert.equal(saved.duration, 300); assert.equal(saved.assets!.original.sha256, originalHash);
  assert.deepEqual(saved.assets, restored.assets); assert.notEqual(saved.id, restored.id);
  assert.deepEqual(saved.phone_analyses, restored.phone_analyses);
  for (const c of [saved, restored]) {
    assert.deepEqual(phoneAnnotationIssues(c), []);
    assert.equal(c.segments[0].label, 'long manual correction'); assert.equal(c.segments[0].end, 299.98);
    assert.equal(c.manual_source_analysis_id, c.phone_analyses![0].id);
    assert.equal(c.phone_analyses![0].result.ctc.frames, 14999);
  }
}
const fixture = await readFile(new URL('../../server/src/__tests__/fixtures/hello-16k.wav', here));
const wav: Buffer = repeatPhoneFixture(fixture, 86);
const plan = planPhoneChunks(wavToFloat32(wav));
const nativeModel = (await read('w23-long-native.json')).result.identity.modelSha256;
for (const name of ['w23-long-native.json', 'w23-long-installed.json']) {
  const record = await read(name); assert.equal(record.source.revision, name === 'w23-long-native.json' ? runtimeRevision : revision); assert.equal(record.passed, true);
  const result = retainedPhoneResultSchema.parse(record.result);
  assert.equal(result.identity.modelSha256, nativeModel);
  assert.ok(verifyPhoneChunks(result, wav).passed); assert.deepEqual(result.processing, plan);
  assert.equal(result.audio.durationSeconds, 296.275375);
  if (record.sourceClip) {
    const model = record.modelFiles.find((f: { file: string }) => f.file.replaceAll('\\', '/').endsWith('/model.onnx'));
    assert.ok(model); assert.equal(result.identity.modelSha256, model.sha256);
    const source = audioClipSchema.parse(record.sourceClip), restored = audioClipSchema.parse(record.restoredClip);
    assert.deepEqual(source.phone_analyses, restored.phone_analyses); assert.notEqual(source.id, restored.id);
    assert.deepEqual(source.phone_analyses![0].result, result);
    assert.equal(source.assets!.original.sha256, sha(wav)); assert.deepEqual(source.assets, restored.assets);
    for (const c of [source, restored]) {
      assert.deepEqual(phoneAnnotationIssues(c), []);
      assert.equal(c.segments[0].label, 'retained long correction');
      assert.equal(c.segments[0].start, 240); assert.equal(c.segments[0].end, 290);
      assert.equal(c.manual_source_analysis_id, c.phone_analyses![0].id);
    }
    assert.equal(record.restartRecovered, true);
    assert.equal(record.cancellation.code, 'JOB_CANCELLED');
    assert.ok(record.cancellation.progress.completed >= 1 && record.cancellation.progress.completed < record.cancellation.progress.total);
    assert.ok(record.heartbeatGapsMs.length > 0);
  }
}
console.log(JSON.stringify({ passed: true, browserPlatforms: 2, nativeRecords: 2, seconds: wavToFloat32(wav).length / 16000,
  scope: 'Reconstructs engineering WAV/window plans; validates retained audio identities, frame accounting, histories and archive mappings. Does not rerun inference, reproduce timing, score accuracy or establish cross-platform prediction equality.' }));
