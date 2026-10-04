import { describe, expect, it, vi } from 'vitest';
import { planPhoneChunks, inferPhoneChunks } from '../services/audio-chunks.js';
import { quietPhoneFrames } from '../services/voice-activity.js';
import { decodeCtcPhones } from '../../../engine/src/audio/ctc.js';
const audio = (frames: number, value = .5) => new Float32Array(frames * 320 + 80).fill(value);
const framesIn = (a: Float32Array) => Math.floor((a.length - 400) / 320) + 1;
const tensor = (frames: number, width = 3) => ({ dims: [1, frames, width], data: new Float32Array(frames * width) });

describe('bounded phone windows and global CTC ownership', () => {
  it('keeps short input and its trailing samples in one unchanged window', () => {
    for (const n of [400,55121,128080]) {
      const plan=planPhoneChunks(new Float32Array(n));
      expect(plan.chunks).toHaveLength(1);
      expect(plan.chunks[0]).toMatchObject({ startSample:0,endSample:n,keepStartFrame:0,keepEndFrameExclusive:Math.floor((n-400)/320)+1,boundary:'end' });
    }
  });
  it('assigns every frame once with aligned context and bounded native inputs', () => {
    for (const n of [128081,128400,240000,800000,1920000]) {
      const samples=new Float32Array(n).fill(.5), plan=planPhoneChunks(samples), owned=new Uint8Array(framesIn(samples));
      expect(plan.chunks.length).toBeLessThanOrEqual(18);
      for (const c of plan.chunks) {
        expect(c.startSample).toBe(c.startFrame*320);
        expect(framesIn(samples.subarray(c.startSample,c.endSample))).toBe(c.endFrameExclusive-c.startFrame);
        expect(c.endSample-c.startSample).toBeLessThanOrEqual(144399);
        expect(c.keepEndFrameExclusive-c.keepStartFrame).toBeLessThanOrEqual(400);
        expect(c.keepStartFrame-c.startFrame).toBeLessThanOrEqual(25);
        expect(c.endFrameExclusive-c.keepEndFrameExclusive).toBeLessThanOrEqual(25);
        for (let f=c.keepStartFrame;f<c.keepEndFrameExclusive;f++) owned[f]++;
      }
      expect([...owned].every(n=>n===1)).toBe(true);
    }
  });
  it('prefers a quiet boundary in the last second without removing silence', () => {
    const samples=audio(850);samples.fill(0,370*320,375*320+400);
    const p=planPhoneChunks(samples);
    expect(p.chunks[0]).toMatchObject({keepEndFrameExclusive:375,boundary:'low-energy'});
    expect(p.chunks.at(-1)!.keepEndFrameExclusive).toBe(850);
    expect(p.quietFrameCount).toBe(6);
  });
  it('does not mistake low amplitude for proven silence or skip all-quiet audio', () => {
    expect(quietPhoneFrames(audio(2,0))).toEqual([true,true]);
    expect(quietPhoneFrames(audio(2,.011))).toEqual([false,false]);
    expect(planPhoneChunks(audio(1000,0)).chunks.map(c=>c.keepEndFrameExclusive)).toEqual([400,800,1000]);
  });
  it('rejects malformed, oversized and non-finite decoded audio', () => {
    for (const a of [new Float32Array(399),new Float32Array(1920001),new Float32Array(400).fill(NaN),new Float32Array(400).fill(1.01)]) expect(()=>planPhoneChunks(a)).toThrow();
  });
  it('stitches owned logits exactly and never uses contradictory overlap context', async () => {
    const samples=audio(901), plan=planPhoneChunks(samples);let call=0;
    const out=await inferPhoneChunks(samples,async input=>{
      const c=plan.chunks[call++],t=tensor(framesIn(input));
      t.data.fill(-99);
      for(let f=c.keepStartFrame;f<c.keepEndFrameExclusive;f++) for(let id=0;id<3;id++) t.data[(f-c.startFrame)*3+id]=f+id;
      return t;
    });
    expect(out.logits).toEqual(Float32Array.from({length:901*3},(_,i)=>Math.floor(i/3)+i%3));
    expect(call).toBe(plan.chunks.length);
  });
  it('decodes globally across joins, preserving real repeats separated by a blank', async () => {
    const samples=audio(810),plan=planPhoneChunks(samples);let call=0;
    const out=await inferPhoneChunks(samples,async input=>{
      const c=plan.chunks[call++],t=tensor(framesIn(input));
      for(let f=c.startFrame;f<c.endFrameExclusive;f++) t.data[(f-c.startFrame)*3+(f===400?2:0)]=9;
      return t;
    });
    const decoded=decodeCtcPhones(out.logits,out.frames,out.vocab,2,id=>['a','b','<pad>'][id]);
    expect(decoded.ipa).toBe('a a');
    expect(decoded.ctc.runs.map(r=>[r.startFrame,r.endFrameExclusive])).toEqual([[0,400],[401,810]]);
    out.logits[400*3]=10;
    expect(decodeCtcPhones(out.logits,out.frames,out.vocab,2,id=>['a','b','<pad>'][id]).ipa).toBe('a');
  });
  it('runs sequentially, reports monotone progress and releases every output tensor', async () => {
    let active=0,max=0;const dispose=vi.fn(),progress=vi.fn();
    const out=await inferPhoneChunks(audio(900),async input=>{
      active++;max=Math.max(max,active);await Promise.resolve();active--;return {...tensor(framesIn(input)),dispose};
    },{onProgress:progress});
    expect(max).toBe(1);expect(dispose).toHaveBeenCalledTimes(3);
    expect(progress.mock.calls.map(([p])=>p)).toEqual([{completed:1,total:3},{completed:2,total:3},{completed:3,total:3}]);
    expect(out.processing.chunks).toHaveLength(3);
  });
  it('rejects changed vocabulary, invalid context logits and mismatched geometry, releasing outputs', async () => {
    for(const fault of ['vocab','nan','shape']) {
      let call=0;const dispose=vi.fn();
      await expect(inferPhoneChunks(audio(900),async input=>{
        const t=tensor(framesIn(input),fault==='vocab' && call===1?4:3);
        if(call++===1) { if(fault==='nan')t.data[0]=NaN;if(fault==='shape')t.dims[1]--; }
        return {...t,dispose};
      })).rejects.toThrow();expect(call).toBe(2);expect(dispose).toHaveBeenCalledTimes(2);
    }
  });
  it('stops between chunks after cancellation and never returns partial analysis', async () => {
    const controller=new AbortController(),infer=vi.fn(async (input:Float32Array)=>tensor(framesIn(input)));
    await expect(inferPhoneChunks(audio(900),infer,{signal:controller.signal,onProgress:()=>controller.abort(new Error('cancelled'))})).rejects.toThrow('cancelled');
    expect(infer).toHaveBeenCalledTimes(1);
    await expect(inferPhoneChunks(audio(900),infer,{signal:controller.signal})).rejects.toThrow('cancelled');
    expect(infer).toHaveBeenCalledTimes(1);
  });
  it('releases a returned tensor when cancellation arrives during native work', async () => {
    const c=new AbortController(),dispose=vi.fn();
    await expect(inferPhoneChunks(audio(900),async input=>{c.abort(new Error('cancelled'));return {...tensor(framesIn(input)),dispose};},{signal:c.signal})).rejects.toThrow('cancelled');
    expect(dispose).toHaveBeenCalledOnce();
  });
  it('propagates a later native failure without starting subsequent windows', async () => {
    let call=0;
    await expect(inferPhoneChunks(audio(900),async input=>{if(call++===1)throw Error('native failed');return tensor(framesIn(input));})).rejects.toThrow('native failed');
    expect(call).toBe(2);
  });
});
