import { ipaModelDir } from '../config.js';
import type { IpaResult, IpaSegment } from '../../../shared/types.js';
import { loadTransformers } from './model-loader.js';
import { verifyPhoneAssets } from './model-assets.js';

/** Thrown when the IPA model is unavailable; the route maps this to HTTP 503. */
export class IpaUnavailableError extends Error {
  constructor(message: string, public readonly code = 'IPA_MODEL_LOAD_FAILED') { super(message); this.name = 'IpaUnavailableError'; }
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
let modelPromise: Promise<{ processor: any; tokenizer: any; model: any; identity: NonNullable<IpaResult['identity']> }> | null = null;

function getModel() {
  const dir = ipaModelDir();
  if (!dir) return Promise.reject(new IpaUnavailableError('ipa model not configured', 'IPA_MODEL_MISSING'));
  if (!modelPromise) {
    modelPromise = (async () => {
      const modelSha256 = await verifyPhoneAssets(dir);
      const tf = await loadTransformers();
      tf.env.allowRemoteModels = false;
      tf.env.localModelPath = dir;
      const [processor, tokenizer, model] = await Promise.all([
        tf.AutoProcessor.from_pretrained(MODEL_ID),
        tf.AutoTokenizer.from_pretrained(MODEL_ID),
        tf.AutoModelForCTC.from_pretrained(MODEL_ID, { device: 'cpu', dtype: 'fp32' }),
      ]);
      return { processor, tokenizer, model, identity: { modelId: MODEL_ID, modelSha256, alphabet: 'TIMIT ARPABET' as const,
        transformers: tf.env.version, backend: 'onnxruntime-node', node: process.versions.node } };
    })().catch((err) => {
      modelPromise = null;
      // Retain the actual loader exception locally; the public route still returns a safe 503.
      console.error('[ipa:model-load]', JSON.stringify({
        code: err?.code ?? 'IPA_MODEL_LOAD_FAILED', name: err?.name ?? 'Error',
        message: err?.message ?? String(err), modelId: MODEL_ID,
        node: process.versions.node, electron: process.versions.electron ?? null,
      }));
      const code = ['IPA_MODEL_MISSING', 'IPA_MODEL_INVALID'].includes(err?.code) ? err.code
        : ['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'].includes(err?.code) ? 'IPA_PACKAGE_MISSING'
        : err?.code === 'ERR_DLOPEN_FAILED' || /\.dll|\.node|dynamic library/i.test(err?.message ?? '') ? 'IPA_NATIVE_LOAD_FAILED' : 'IPA_MODEL_LOAD_FAILED';
      throw new IpaUnavailableError('Phone model could not be loaded', code);
    });
  }
  return modelPromise;
}

/** Parse a 16-bit PCM WAV buffer into mono Float32 samples in [-1, 1]. The model expects
 *  16 kHz mono; the fmt chunk is validated so non-16 kHz / multi-channel audio fails loudly
 *  (acoustically wrong phones) instead of being silently mis-decoded. */
export function wavToFloat32(buf: Buffer): Float32Array {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE'
    || buf.readUInt32LE(4) + 8 !== buf.length) throw new IpaBadInputError('Invalid RIFF/WAVE size or signature');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12, dataOff = -1, dataLen = 0, sampleRate = 0, channels = 0, format = 0, bits = 0, alignment = 0, byteRate = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = dv.getUint32(off + 4, true);
    if (off + 8 + sz > buf.length) throw new IpaBadInputError('Truncated WAV chunk');
    if (id === 'fmt ') {
      if (sz < 16 || format) throw new IpaBadInputError('Invalid or repeated WAV format');
      format = dv.getUint16(off + 8, true); channels = dv.getUint16(off + 10, true); sampleRate = dv.getUint32(off + 12, true);
      byteRate = dv.getUint32(off + 16, true); alignment = dv.getUint16(off + 20, true); bits = dv.getUint16(off + 22, true);
    }
    if (id === 'data') { if (dataOff >= 0) throw new IpaBadInputError('Repeated WAV data'); dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz & 1);
  }
  if (off !== buf.length || dataOff < 0 || dataLen < 800 || dataLen % 2 || dataLen > 16000 * 2 * 120) throw new IpaBadInputError('WAV must contain 25 ms to 120 seconds of complete PCM samples');
  if (format !== 1 || bits !== 16 || alignment !== 2 || byteRate !== 32000 || sampleRate !== 16000 || channels !== 1)
    throw new IpaBadInputError('Expected mono PCM16 WAV at 16000 Hz');
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

/** Transcribe 16 kHz mono WAV bytes into English-trained ARPABET phones + frame timings. */
export async function transcribePhones(input: IpaInput): Promise<IpaResult> {
  let audio: Float32Array;
  try { audio = wavToFloat32(input.wav); }
  catch (err) {
    if (err instanceof IpaBadInputError || err instanceof IpaUnavailableError) throw err;
    throw new IpaBadInputError('wav parse failed');
  }
  const { processor, tokenizer, model, identity } = await getModel();
  try {
    const inputs = await processor(audio);
    const out = await model(inputs);
    const logits = out.logits;
    const [, frames, vocab] = logits.dims as [number, number, number];
    const padId = tokenizer.pad_token_id ?? 0;
    return { ...decodeCtcPhones(logits.data as Float32Array, frames, vocab, padId, (id: number) => tokenizer.decode([id])), identity };
  } catch (err) {
    if (err instanceof IpaUnavailableError) throw err;
    console.error('[ipa:inference]', (err as Error)?.name, (err as Error)?.message?.slice(0, 500));
    throw new IpaUnavailableError('Phone inference failed', 'IPA_INFERENCE_FAILED');
  }
}
