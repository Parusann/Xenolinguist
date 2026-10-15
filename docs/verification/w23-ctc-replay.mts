import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeCtcPhones } from '../../engine/src/audio/ctc.js';
// @ts-expect-error The independent acceptance helper is a plain Node module.
import { verifyPhoneAnalysis } from '../../scripts/verify-phone-analysis.mjs';

const here = new URL('.', import.meta.url);
const fixture = await readFile(new URL('../../server/src/__tests__/fixtures/hello-16k.wav', here));
const native = JSON.parse(await readFile(new URL('w23-ctc-native.json', here), 'utf8'));
assert.equal(native.source.workingFiles.length, 0);
assert.equal(native.passed, true);
assert.deepEqual(verifyPhoneAnalysis(native.result, fixture), native.analysisCheck);
const example = JSON.parse(await readFile(new URL('w23-ctc-example.json', here), 'utf8'));
const decoded = decodeCtcPhones(new Float32Array(example.logits), example.frames, example.labels.length, example.blankId, id => example.labels[id]);
assert.deepEqual(decoded, example.result);
// Installed payload is retained after independent acceptance, without another native call.
const installed = JSON.parse(await readFile(new URL('w23-ctc-installed.json', here), 'utf8'));
assert.equal(installed.source.revision, native.source.revision);
assert.deepEqual(verifyPhoneAnalysis(installed.result, fixture), installed.analysisCheck);
console.log(JSON.stringify({ passed:true, sourceRevision:native.source.revision, syntheticRuns:decoded.ctc.runs.length,
  nativeRuns:native.result.ctc.runs.length, installedRuns:installed.result.ctc.runs.length,
  scope:'Synthetic logits recomputed; native/installed response identities, frame geometry and score mass verified. Native logits and inference are not replayed.' }));
