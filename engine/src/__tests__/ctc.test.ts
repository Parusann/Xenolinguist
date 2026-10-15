import { describe, expect, it } from 'vitest';
import { decodeCtcPhones, CTC_LIMITS } from '../audio/ctc.js';
const labels = ['aa', 'b', '<pad>', '[UNK]'];
const decode = (values: number[], vocab = 4, pad = 2) => decodeCtcPhones(new Float32Array(values), values.length / vocab, vocab, pad, id => labels[id]);

describe('bounded greedy CTC acoustic summaries', () => {
  it('preserves repeated phones separated by a blank or a special token', () => {
    const r = decode([9,0,0,0, 9,0,0,0, 0,0,9,0, 9,0,0,0, 0,0,0,9, 9,0,0,0]);
    expect(r.ipa).toBe('aa aa aa');
    expect(r.segments).toEqual([{phone:'aa',start:0,end:.04},{phone:'aa',start:.06,end:.08},{phone:'aa',start:.10,end:.12}]);
    expect(r.ctc).toMatchObject({blankFrames:1,specialFrames:1});
    expect(r.ctc.runs.map(r => [r.startFrame,r.endFrameExclusive])).toEqual([[0,2],[3,4],[5,6]]);
  });
  it('matches an independent softmax and entropy calculation, retaining omitted mass', () => {
    const r=decode([Math.log(4),Math.log(2),0,0]);
    const run=r.ctc.runs[0];
    expect(run.candidates.map(c=>c.tokenId)).toEqual([0,1,2]);
    [0.5,0.25,0.125].forEach((p,i)=>expect(run.candidates[i].meanProbability).toBeCloseTo(p,7));
    expect(run.omittedProbability).toBeCloseTo(.125,7);
    expect(run.meanEntropyBits).toBeCloseTo(1.75,7);
    expect(run.candidates[2]).toMatchObject({blank:true,special:true,label:'<pad>'});
  });
  it('averages frame probabilities, not logits or a sequence confidence', () => {
    const r=decode([Math.log(4),0, 0,0],2,1);
    expect(r.ctc.runs).toHaveLength(1);
    expect(r.ctc.runs[0].candidates[0].meanProbability).toBeCloseTo((.8+.5)/2,7);
    const firstEntropy=-.8*Math.log2(.8)-.2*Math.log2(.2);
    expect(r.ctc.runs[0].meanEntropyBits).toBeCloseTo((firstEntropy+1)/2,7);
  });
  it('uses lower token IDs for exact ties and is invariant to a shared logit offset', () => {
    const a=decode([1,1,1,1]),b=decode([10001,10001,10001,10001]);
    expect(a).toEqual(b);expect(a.ipa).toBe('aa');
    expect(a.ctc.runs[0].meanEntropyBits).toBe(2);
  });
  it('handles extreme finite logits without overflow or NaN', () => {
    const r=decode([1e30,-1e30,0,0]);
    expect(r.ctc.runs[0].candidates[0].meanProbability).toBe(1);
    expect(r.ctc.runs[0].meanEntropyBits).toBe(0);
  });
  it('accounts for an entirely blank/special output without inventing a phone', () => {
    const r=decode([0,0,9,0,0,0,0,9]);
    expect(r.ipa).toBe('');expect(r.ctc.runs).toEqual([]);
    expect(r.ctc.blankFrames+r.ctc.specialFrames).toBe(2);
  });
  it('rejects invalid geometry and non-finite output before producing a prefix', () => {
    for (const frames of [0,-1,1.5,Infinity,CTC_LIMITS.frames+1]) expect(()=>decodeCtcPhones(new Float32Array(4),frames,4,2,id=>labels[id])).toThrow();
    for (const vocab of [0,1,257,1.5]) expect(()=>decodeCtcPhones(new Float32Array(4),1,vocab,0,id=>labels[id])).toThrow();
    for (const pad of [-1,4,.5,NaN]) expect(()=>decodeCtcPhones(new Float32Array(4),1,4,pad,id=>labels[id])).toThrow();
    for (const stride of [0,-1,Infinity,NaN,2]) expect(()=>decodeCtcPhones(new Float32Array(4),1,4,2,id=>labels[id],stride)).toThrow();
    for (const bad of [NaN,Infinity,-Infinity]) expect(()=>decode([9,0,0,0,9,0,0,bad])).toThrow('Non-finite');
    expect(()=>decodeCtcPhones(new Float32Array(3),1,4,2,id=>labels[id])).toThrow();
    expect(()=>decodeCtcPhones(new Float32Array(4),1,4,2,()=> 'x'.repeat(81))).toThrow();
  });
  it('bounds a maximum-sized output and conserves frame accounting and score mass', () => {
    const values=Float32Array.from({length:15000*4},(_,i)=>i%4===Math.floor(i/4)%4 ? 1:0);
    const r=decodeCtcPhones(values,15000,4,2,id=>labels[id]);
    expect(r.segments).toHaveLength(7500);
    expect(r.ctc.runs.reduce((n,r)=>n+r.endFrameExclusive-r.startFrame,0)+r.ctc.blankFrames+r.ctc.specialFrames).toBe(15000);
    for (const run of r.ctc.runs) {
      expect(run.candidates).toHaveLength(3);
      expect(run.candidates.reduce((n,c)=>n+c.meanProbability,0)+run.omittedProbability).toBeCloseTo(1,12);
      expect(run.segmentIndex).toBeLessThan(r.segments.length);
    }
    expect(r.segments.at(-1)!.end).toBeLessThanOrEqual(300);
    expect(JSON.stringify(r).length).toBeLessThan(6_000_000);
  });
});
