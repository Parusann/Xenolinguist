import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planPhoneChunks, inferPhoneChunks } from '../../server/src/services/audio-chunks.js';
import { wavToFloat32 } from '../../server/src/services/ipa-phones.js';
import { decodeCtcPhones } from '../../engine/src/audio/ctc.js';
// @ts-expect-error The independent acceptance helper is a plain Node module.
import { repeatPhoneFixture, verifyPhoneChunks } from '../../scripts/verify-phone-analysis.mjs';
const here=new URL('.',import.meta.url);
const fixture=await readFile(new URL('../../server/src/__tests__/fixtures/hello-16k.wav',here));
const native=JSON.parse(await readFile(new URL('w23-chunks-native.json',here),'utf8'));
const installed=JSON.parse(await readFile(new URL('w23-chunks-installed.json',here),'utf8'));
const nearCap=JSON.parse(await readFile(new URL('w23-chunks-near-cap.json',here),'utf8'));
assert.equal(native.passed,true);assert.equal(native.source.workingFiles.length,0);
assert.equal(native.source.revision,installed.source.revision);
assert.equal(native.source.revision,nearCap.source.revision);
assert.ok(nearCap.source.workingFiles.every((f:{file:string})=>f.file.startsWith('docs/') && f.file.endsWith('.md')));
for(const record of [native,installed,nearCap]) {
  const wav=repeatPhoneFixture(fixture,record.repetitions);
  assert.deepEqual(verifyPhoneChunks(record.result,wav),record.check);
  assert.deepEqual(planPhoneChunks(wavToFloat32(wav)),record.result.processing);
}
const samples=new Float32Array(810*320+80).fill(.5),plan=planPhoneChunks(samples);let calls=0;
const stitched=await inferPhoneChunks(samples,async input=>{
  const chunk=plan.chunks[calls++],frames=Math.floor((input.length-400)/320)+1,data=new Float32Array(frames*3);
  for(let f=chunk.startFrame;f<chunk.endFrameExclusive;f++)data[(f-chunk.startFrame)*3+(f===400?2:0)]=9;
  return {dims:[1,frames,3],data};
});
const decoded=decodeCtcPhones(stitched.logits,stitched.frames,3,2,id=>['a','b','<pad>'][id]);
assert.equal(decoded.ipa,'a a');
assert.deepEqual(decoded.ctc.runs.map(r=>[r.startFrame,r.endFrameExclusive]),[[0,400],[401,810]]);
console.log(JSON.stringify({passed:true,revision:native.source.revision,nativeCheck:native.check,installedCheck:installed.check,nearCapCheck:nearCap.check,syntheticRuns:2,
  scope:'Recomputed real-audio window plans and synthetic overlap/CTC decoding; verified native response identities and accounting. Native logits, recognition accuracy and timings are not reproduced.'}));
