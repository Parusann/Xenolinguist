import { ipaModelDir } from '../config.js';
import type { IpaResult } from '../../../shared/types.js';
import { loadTransformers } from './model-loader.js';
import { verifyPhoneAssets } from './model-assets.js';
import { createHash } from 'node:crypto';
import { inferPhoneChunks, type PhoneChunkProgress } from './audio-chunks.js';
import { decodeCtcPhones } from '../../../engine/src/audio/ctc.js';
export { decodeCtcPhones } from '../../../engine/src/audio/ctc.js';

/** Thrown when the IPA model is unavailable; the route maps this to HTTP 503. */
export class IpaUnavailableError extends Error {
  constructor(message: string, public readonly code = 'IPA_MODEL_LOAD_FAILED') { super(message); this.name = 'IpaUnavailableError'; }
}

import { inspectAudioWav as inspectPhoneWav, IpaBadInputError } from './audio-wav.js';
export { inspectAudioWav as inspectPhoneWav, IpaBadInputError } from './audio-wav.js';

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

/** Allocate decoded samples only in the inference process, after header validation. */
export function wavToFloat32(buf: Buffer): Float32Array {
  const { sampleCount, dataOffset } = inspectPhoneWav(buf);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) out[i] = buf.readInt16LE(dataOffset + i * 2) / 32768;
  return out;
}

export interface IpaInput { wav: Buffer; onProgress?: (value: PhoneChunkProgress) => void }

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
    const { logits, frames, vocab, processing } = await inferPhoneChunks(audio, async samples => {
      const inputs = await processor(samples);
      try {
        const out = await model(inputs);
        return out.logits;
      } finally {
        for (const tensor of Object.values(inputs) as { dispose?: () => void }[]) tensor.dispose?.();
      }
    }, { onProgress: input.onProgress });
    const padId = tokenizer.pad_token_id ?? 0;
    return { ...decodeCtcPhones(logits, frames, vocab, padId, (id: number) => tokenizer.decode([id])), identity, processing,
      audio: { sha256: createHash('sha256').update(input.wav).digest('hex'), sampleRate: 16000, sampleCount: audio.length, durationSeconds: audio.length / 16000 } };
  } catch (err) {
    if (err instanceof IpaUnavailableError) throw err;
    console.error('[ipa:inference]', (err as Error)?.name, (err as Error)?.message?.slice(0, 500));
    throw new IpaUnavailableError('Phone inference failed', 'IPA_INFERENCE_FAILED');
  }
}
