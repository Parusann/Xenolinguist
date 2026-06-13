// Standalone check that the vendored phoneme model transcribes the fixture, offline, in plain
// Node (mirrors the production server path; vitest can't reliably host onnxruntime on Windows).
// Run: node scripts/verify-ipa.mjs
// Local test against the un-quantized cache:
//   IPA_MODEL_DIR=vendor/ipa-model-cache IPA_MODEL_ID=aidankmcl/wav2vec2-large-lv60_phoneme-timit_english_timit-4k_simplified node scripts/verify-ipa.mjs
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_DIR = process.env.IPA_MODEL_DIR || path.join(ROOT, 'vendor', 'ipa-model');
const MODEL_ID = process.env.IPA_MODEL_ID || 'wav2vec2-phoneme';
const WAV = path.join(ROOT, 'server', 'src', '__tests__', 'fixtures', 'hello-16k.wav');

function wavToFloat32(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12, dataOff = -1, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), sz = dv.getUint32(off + 4, true);
    if (id === 'data') { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz & 1);
  }
  const n = Math.floor(dataLen / 2), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(dataOff + i * 2, true) / 32768;
  return out;
}

if (!existsSync(path.join(MODEL_DIR, MODEL_ID))) {
  console.error('MISSING model dir:', path.join(MODEL_DIR, MODEL_ID));
  process.exit(1);
}
const { pipeline, env } = await import('@huggingface/transformers');
env.allowRemoteModels = false;
env.localModelPath = MODEL_DIR;
const pipe = await pipeline('automatic-speech-recognition', MODEL_ID);
const out = await pipe(wavToFloat32(readFileSync(WAV)));
const phones = (out?.text ?? '').trim();
console.log('phones:', phones);
if (!phones) { console.error('FAIL: empty phonetic output'); process.exit(1); }
console.log('OK: bundled phoneme model produced a phonetic transcription.');
