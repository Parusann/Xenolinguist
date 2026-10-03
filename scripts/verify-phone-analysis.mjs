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
