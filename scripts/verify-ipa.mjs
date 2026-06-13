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
// Mirror the service: model-level CTC so we also get per-phone timings (the pipeline omits them
// for this delimiter-less phoneme model).
const tf = await import('@huggingface/transformers');
tf.env.allowRemoteModels = false;
tf.env.localModelPath = MODEL_DIR;
const processor = await tf.AutoProcessor.from_pretrained(MODEL_ID);
const tokenizer = await tf.AutoTokenizer.from_pretrained(MODEL_ID);
const model = await tf.AutoModelForCTC.from_pretrained(MODEL_ID);
const inputs = await processor(wavToFloat32(readFileSync(WAV)));
const out = await model(inputs);
const [, frames, vocab] = out.logits.dims;
const data = out.logits.data;
const pad = tokenizer.pad_token_id ?? 0;
const segments = [];
let prev = -1, startF = 0;
for (let f = 0; f <= frames; f++) {
  let id = -2;
  if (f < frames) { let best = 0, bv = -Infinity; for (let v = 0; v < vocab; v++) { const val = data[f * vocab + v]; if (val > bv) { bv = val; best = v; } } id = best; }
  if (id !== prev) {
    if (prev !== -1 && prev !== pad) { const p = tokenizer.decode([prev]).trim(); if (p) segments.push({ phone: p, start: +(startF * 0.02).toFixed(3), end: +(f * 0.02).toFixed(3) }); }
    prev = id; startF = f;
  }
}
const phones = segments.map((s) => s.phone).join(' ');
console.log('phones:', phones);
console.log('segments:', segments.length, '| first 8:', JSON.stringify(segments.slice(0, 8)));
if (!phones) { console.error('FAIL: empty phonetic output'); process.exit(1); }
console.log('OK: bundled phoneme model produced a time-aligned phonetic transcription.');
