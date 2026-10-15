import type { PhoneProcessing } from '../../../shared/types.js';
import { quietPhoneFrames } from './voice-activity.js';

export function planPhoneChunks(audio: Float32Array): PhoneProcessing {
  const quiet = quietPhoneFrames(audio), frames = quiet.length;
  const chunks: PhoneProcessing['chunks'] = [];
  for (let start = 0; start < frames;) {
    let end = Math.min(start + 400, frames);
    let boundary: PhoneProcessing['chunks'][number]['boundary'] = end === frames ? 'end' : 'limit';
    // Prefer the latest pair of quiet bins within the last second of a full core.
    if (end < frames) for (let candidate = end; candidate >= start + 350; candidate--) {
      if (quiet[candidate - 1] && quiet[candidate]) { end = candidate; boundary = 'low-energy'; break; }
    }
    const from = Math.max(0, start - 25), to = Math.min(frames, end + 25);
    chunks.push({ index: chunks.length, startSample: from * 320, endSample: to === frames ? audio.length : to * 320 + 80,
      startFrame: from, endFrameExclusive: to, keepStartFrame: start, keepEndFrameExclusive: end, boundary });
    start = end;
  }
  return { version: 1, strategy: 'overlap-frame-ownership', coreFrames: 400, contextFrames: 25, quietRms: 0.01,
    quietFrameCount: quiet.filter(Boolean).length, chunks };
}

export type PhoneChunkProgress = { completed: number; total: number };
type Tensor = { dims: readonly number[]; data: Float32Array; dispose?: () => void };
/** One native call at a time. Keep every global frame exactly once, then decode globally. */
export async function inferPhoneChunks(audio: Float32Array, infer: (samples: Float32Array) => Promise<Tensor>,
  options: { signal?: AbortSignal; onProgress?: (value: PhoneChunkProgress) => void } = {}) {
  options.signal?.throwIfAborted();
  const processing = planPhoneChunks(audio), frames = Math.floor((audio.length - 400) / 320) + 1;
  let logits: Float32Array | undefined, vocab = 0;
  for (const chunk of processing.chunks) {
    options.signal?.throwIfAborted();
    const output = await infer(audio.slice(chunk.startSample, chunk.endSample));
    try {
      options.signal?.throwIfAborted();
      const expected = chunk.endFrameExclusive - chunk.startFrame;
      const width = output.dims[2];
      if (output.dims.length !== 3 || output.dims[0] !== 1 || output.dims[1] !== expected || !Number.isInteger(width) || width < 2 || width > 256
        || !(output.data instanceof Float32Array) || output.data.length !== expected * width || vocab && width !== vocab) throw Error('Invalid chunk tensor geometry');
      for (const value of output.data) if (!Number.isFinite(value)) throw Error('Non-finite chunk logit');
      if (!logits) { vocab = width; logits = new Float32Array(frames * vocab); }
      const from = (chunk.keepStartFrame - chunk.startFrame) * vocab, to = (chunk.keepEndFrameExclusive - chunk.startFrame) * vocab;
      logits.set(output.data.subarray(from, to), chunk.keepStartFrame * vocab);
      options.onProgress?.({ completed: chunk.index + 1, total: processing.chunks.length });
    } finally { output.dispose?.(); }
  }
  if (!logits) throw Error('No phone chunks');
  return { logits, frames, vocab, processing };
}
