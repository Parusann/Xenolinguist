import { ipaModelDir } from '../config.js';

/** Thrown when the IPA model is unavailable; the route maps this to HTTP 503. */
export class IpaUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'IpaUnavailableError'; }
}

// The folder name under the model dir (see docs/ipa-model-notes.md). Keep in sync with
// scripts/verify-ipa.mjs and the vendored vendor/ipa-model/<MODEL_ID>/ layout.
const MODEL_ID = 'wav2vec2-phoneme';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipePromise: Promise<any> | null = null;

function getPipeline() {
  const dir = ipaModelDir();
  if (!dir) return Promise.reject(new IpaUnavailableError('ipa model not configured'));
  if (!pipePromise) {
    pipePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowRemoteModels = false;
      env.localModelPath = dir;
      return pipeline('automatic-speech-recognition', MODEL_ID);
    })().catch((err) => { pipePromise = null; throw new IpaUnavailableError(`ipa model load failed: ${err?.message ?? err}`); });
  }
  return pipePromise;
}

/** Parse a 16-bit PCM WAV buffer into mono Float32 samples in [-1, 1]. */
function wavToFloat32(buf: Buffer): Float32Array {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12, dataOff = -1, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = dv.getUint32(off + 4, true);
    if (id === 'data') { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz & 1);
  }
  if (dataOff < 0) throw new IpaUnavailableError('invalid wav: no data chunk');
  const n = Math.floor(dataLen / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(dataOff + i * 2, true) / 32768;
  return out;
}

export interface IpaInput { wav: Buffer }

/** Transcribe 16 kHz mono WAV bytes into a language-independent phone/IPA string. */
export async function transcribePhones(input: IpaInput): Promise<{ ipa: string }> {
  const pipe = await getPipeline();
  let audio: Float32Array;
  try { audio = wavToFloat32(input.wav); }
  catch (err) { if (err instanceof IpaUnavailableError) throw err; throw new IpaUnavailableError('wav parse failed'); }
  try {
    const out = await pipe(audio);
    return { ipa: (out?.text ?? '').trim() };
  } catch (err) {
    throw new IpaUnavailableError(`ipa inference failed: ${(err as Error)?.message ?? err}`);
  }
}
