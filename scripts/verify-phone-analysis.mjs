import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Acceptance of the actual API payload, independent of the decoder implementation. */
export function verifyPhoneAnalysis(result, wav) {
  let bytes;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    if (wav.toString('ascii', offset, offset + 4) === 'data') bytes = size;
    offset += 8 + size + (size & 1);
  }
  assert.ok(bytes > 0);
  assert.equal(result.audio.sha256, createHash('sha256').update(wav).digest('hex'));
  assert.equal(result.audio.sampleRate, 16000);
  assert.equal(result.audio.sampleCount, bytes / 2);
  assert.equal(result.audio.durationSeconds, bytes / 32000);
  const c = result.ctc;
  assert.equal(c.version, 1); assert.equal(c.decoder, 'greedy');
  assert.equal(c.scoreDefinition, 'mean-frame-softmax');
  assert.equal(c.timingDefinition, 'frame-bins-not-phonetic-boundaries');
  assert.equal(c.frames, Math.floor((bytes / 2 - 400) / 320) + 1);
  assert.equal(c.strideSeconds, .02);
  assert.equal(c.runs.length, result.segments.length);
  let accounted = c.blankFrames + c.specialFrames, lastEnd = 0;
  const near = (a,b) => assert.ok(Number.isFinite(a) && Math.abs(a-b) < 1e-6);
  for (const [i,run] of c.runs.entries()) {
    const segment = result.segments[i];
    assert.equal(run.segmentIndex,i);
    assert.ok(Number.isInteger(run.startFrame) && Number.isInteger(run.endFrameExclusive));
    assert.ok(run.startFrame >= lastEnd && run.endFrameExclusive > run.startFrame && run.endFrameExclusive <= c.frames);
    lastEnd = run.endFrameExclusive; accounted += run.endFrameExclusive-run.startFrame;
    near(segment.start,run.startFrame*.02);near(segment.end,run.endFrameExclusive*.02);
    assert.ok(segment.end <= result.audio.durationSeconds);
    assert.equal(run.candidates.length,Math.min(3,c.vocabularySize));
    assert.equal(run.candidates[0].tokenId,run.tokenId);
    assert.equal(run.candidates[0].label,segment.phone);
    assert.ok(run.meanEntropyBits >= 0 && run.meanEntropyBits <= Math.log2(c.vocabularySize)+1e-9);
    assert.ok(run.omittedProbability >= 0 && run.omittedProbability <= 1);
    for (const p of run.candidates) assert.ok(p.meanProbability >= 0 && p.meanProbability <= 1);
    near(run.candidates.reduce((sum,p)=>sum+p.meanProbability,0)+run.omittedProbability,1);
  }
  assert.equal(accounted,c.frames);
  return { passed:true, frames:c.frames, phoneRuns:c.runs.length, audioSha256:result.audio.sha256,
    modelSha256:result.identity.modelSha256, scoreDefinition:c.scoreDefinition };
}

/** Reproducible long engineering fixture; repeated speech is not a labeled corpus. */
export function repeatPhoneFixture(wav, repetitions) {
  let data;
  for (let offset=12;offset+8<=wav.length;) {
    const size=wav.readUInt32LE(offset+4);
    if(wav.toString('ascii',offset,offset+4)==='data')data=wav.subarray(offset+8,offset+8+size);
    offset+=8+size+(size&1);
  }
  assert.ok(data && Number.isInteger(repetitions) && repetitions>0 && data.length*repetitions<=9_600_000);
  const output=Buffer.alloc(44+data.length*repetitions);
  output.write('RIFF');output.writeUInt32LE(output.length-8,4);output.write('WAVEfmt ',8);output.writeUInt32LE(16,16);
  output.writeUInt16LE(1,20);output.writeUInt16LE(1,22);output.writeUInt32LE(16000,24);output.writeUInt32LE(32000,28);
  output.writeUInt16LE(2,32);output.writeUInt16LE(16,34);output.write('data',36);output.writeUInt32LE(output.length-44,40);
  for(let i=0;i<repetitions;i++)data.copy(output,44+i*data.length);
  return output;
}

export function verifyPhoneChunks(result, wav) {
  const acoustic=verifyPhoneAnalysis(result,wav),p=result.processing;
  assert.equal(p.version,1);assert.equal(p.strategy,'overlap-frame-ownership');
  assert.equal(p.coreFrames,400);assert.equal(p.contextFrames,25);assert.equal(p.quietRms,.01);
  assert.ok(Number.isInteger(p.quietFrameCount) && p.quietFrameCount>=0 && p.quietFrameCount<=acoustic.frames);
  let next=0,maxInputSamples=0;
  assert.ok(p.chunks.length>0 && p.chunks.length<=43);
  for(const [i,c] of p.chunks.entries()) {
    assert.equal(c.index,i);assert.equal(c.keepStartFrame,next);
    assert.ok(c.keepEndFrameExclusive>next && c.keepEndFrameExclusive-next<=400);
    assert.equal(c.startFrame,Math.max(0,next-25));assert.equal(c.endFrameExclusive,Math.min(acoustic.frames,c.keepEndFrameExclusive+25));
    assert.equal(c.startSample,c.startFrame*320);
    assert.equal(c.endSample,c.endFrameExclusive===acoustic.frames?result.audio.sampleCount:c.endFrameExclusive*320+80);
    assert.ok(c.endSample<=result.audio.sampleCount);
    assert.equal(Math.floor((c.endSample-c.startSample-400)/320)+1,c.endFrameExclusive-c.startFrame);
    assert.ok(['low-energy','limit','end'].includes(c.boundary));
    maxInputSamples=Math.max(maxInputSamples,c.endSample-c.startSample);next=c.keepEndFrameExclusive;
  }
  assert.equal(next,acoustic.frames);assert.ok(maxInputSamples<=144399);
  return {...acoustic,chunks:p.chunks.length,maxInputSamples};
}
