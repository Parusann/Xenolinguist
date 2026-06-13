import { ipaModelDir } from '../config.js';
import type { IpaResult, IpaSegment } from '../../../shared/types.js';

/** Thrown when the IPA model is unavailable; the route maps this to HTTP 503. */
export class IpaUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'IpaUnavailableError'; }
}

/** Thrown when the supplied audio is malformed/unsupported; the route maps this to HTTP 400
 *  (a client error, distinct from a 503 server-capability error). */
export class IpaBadInputError extends Error {
  constructor(message: string) { super(message); this.name = 'IpaBadInputError'; }
}

// The folder name under the model dir (see docs/ipa-model-notes.md). Keep in sync with
// scripts/verify-ipa.mjs and the vendored vendor/ipa-model/<MODEL_ID>/ layout.
const MODEL_ID = 'wav2vec2-phoneme';

// wav2vec2 downsamples 16 kHz audio by 320 samples per output frame → 20 ms / frame.
export const PHONE_STRIDE_SEC = 0.02;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelPromise: Promise<{ processor: any; tokenizer: any; model: any }> | null = null;

function getModel() {
  const dir = ipaModelDir();
  if (!dir) return Promise.reject(new IpaUnavailableError('ipa model not configured'));
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import('@huggingface/transformers');
      tf.env.allowRemoteModels = false;
      tf.env.localModelPath = dir;
      const [processor, tokenizer, model] = await Promise.all([
        tf.AutoProcessor.from_pretrained(MODEL_ID),
        tf.AutoTokenizer.from_pretrained(MODEL_ID),
        tf.AutoModelForCTC.from_pretrained(MODEL_ID),
      ]);
      return { processor, tokenizer, model };
    })().catch((err) => { modelPromise = null; throw new IpaUnavailableError(`ipa model load failed: ${err?.message ?? err}`); });
  }
  return modelPromise;
}

/** Parse a 16-bit PCM WAV buffer into mono Float32 samples in [-1, 1]. The model expects
 *  16 kHz mono; the fmt chunk is validated so non-16 kHz / multi-channel audio fails loudly
 *  (acoustically wrong phones) instead of being silently mis-decoded. */
function wavToFloat32(buf: Buffer): Float32Array {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12, dataOff = -1, dataLen = 0, sampleRate = 0, channels = 1;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = dv.getUint32(off + 4, true);
    if (id === 'fmt ') { channels = dv.getUint16(off + 10, true); sampleRate = dv.getUint32(off + 12, true); }
    if (id === 'data') { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz & 1);
  }
  if (dataOff < 0) throw new IpaBadInputError('invalid wav: no data chunk');
  if (sampleRate && sampleRate !== 16000) throw new IpaBadInputError(`expected 16 kHz wav, got ${sampleRate} Hz`);
  if (channels > 1) throw new IpaBadInputError(`expected mono wav, got ${channels} channels`);
  const n = Math.floor(dataLen / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(dataOff + i * 2, true) / 32768;
  return out;
}

/**
 * Greedy CTC decode of raw frame logits into time-aligned phones: argmax per frame, then collapse
 * runs of the same id and drop the blank (pad) id, mapping frame index → seconds via `stride`.
 * Pure + deterministic — unit-tested without the model.
 */
export function decodeCtcPhones(
  logits: Float32Array,
  frames: number,
  vocab: number,
  padId: number,
  idToPhone: (id: number) => string,
  stride: number = PHONE_STRIDE_SEC,
): IpaResult {
  const segments: IpaSegment[] = [];
  let prev = -1, startF = 0;
  for (let f = 0; f <= frames; f++) {
    let id = -2; // sentinel past the last frame to flush the final run
    if (f < frames) {
      let best = 0, bestVal = -Infinity;
      for (let v = 0; v < vocab; v++) { const val = logits[f * vocab + v]; if (val > bestVal) { bestVal = val; best = v; } }
      id = best;
    }
    if (id !== prev) {
      if (prev !== -1 && prev !== padId) {
        const phone = idToPhone(prev).trim();
        // Skip special tokens: a CTC head can win-argmax on class ids beyond the real
        // phone set, which tokenizer.decode maps to bracketed markers ([UNK], <unk>, <s>…).
        // Real ARPABET/IPA phones never contain angle/square brackets, so this is safe.
        if (phone && !/^[<[].*[>\]]$/.test(phone)) {
          segments.push({ phone, start: +(startF * stride).toFixed(3), end: +(f * stride).toFixed(3) });
        }
      }
      prev = id; startF = f;
    }
  }
  return { ipa: segments.map((s) => s.phone).join(' ').trim(), segments };
}

export interface IpaInput { wav: Buffer }

/** Transcribe 16 kHz mono WAV bytes into a language-independent phone string + per-phone timings. */
export async function transcribePhones(input: IpaInput): Promise<IpaResult> {
  const { processor, tokenizer, model } = await getModel();
  let audio: Float32Array;
  try { audio = wavToFloat32(input.wav); }
  catch (err) {
    if (err instanceof IpaBadInputError || err instanceof IpaUnavailableError) throw err;
    throw new IpaBadInputError('wav parse failed');
  }
  try {
    const inputs = await processor(audio);
    const out = await model(inputs);
    const logits = out.logits;
    const [, frames, vocab] = logits.dims as [number, number, number];
    const padId = tokenizer.pad_token_id ?? 0;
    return decodeCtcPhones(logits.data as Float32Array, frames, vocab, padId, (id: number) => tokenizer.decode([id]));
  } catch (err) {
    if (err instanceof IpaUnavailableError) throw err;
    throw new IpaUnavailableError(`ipa inference failed: ${(err as Error)?.message ?? err}`);
  }
}
