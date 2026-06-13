# IPA / phoneme model — Increment 3 spike notes

**Decision: GO.** Transformers.js (`@huggingface/transformers` v4) loads a wav2vec2 CTC phoneme
model offline in plain Node (the production Electron-forked-server runtime) and emits a phonetic
transcription — no Python at runtime.

## Chosen model
- **`aidankmcl/wav2vec2-large-lv60_phoneme-timit_english_timit-4k_simplified`** — the only
  candidate on HF that ships a *complete* Transformers.js-ready set (`onnx/model.onnx` +
  `tokenizer.json` + `vocab.json` + `config.json` + `preprocessor_config.json`).
- Output is **TIMIT ARPABET phones** (e.g. `h# dh ax l ow w ih l d … jh ah m p … d ao g`), not
  strict IPA — so the app labels it "phones" honestly. It is a real, language-independent-ish
  acoustic phone transcription suitable for feeding the AI partner.
- Rejected: `mattkimcreates/...-js` (no ONNX weights), `proclivitystudios/...` (no `tokenizer.json`),
  `Xenova/onnx-community/...espeak...` (repos don't exist). The ideal multilingual eSpeak→IPA model
  has no complete Transformers.js ONNX conversion published.

## Vendored layout (for `IPA_MODEL_DIR` / `env.localModelPath`)
```
vendor/ipa-model/
  wav2vec2-phoneme/                <- MODEL_ID = "wav2vec2-phoneme"
    config.json
    tokenizer.json
    tokenizer_config.json
    preprocessor_config.json
    onnx/model.onnx                <- quantized (see below)
```
The service (`server/src/services/ipa-phones.ts`), `scripts/verify-ipa.mjs`, and this note share
`MODEL_ID = "wav2vec2-phoneme"`.

## Size — must quantize before vendoring
- fp32 `model.onnx` is **~1.2 GB** — too large to commit. Quantize to int8 (~300 MB target) at
  dev-time with onnxruntime (a one-time *converter*; NOT shipped):
  ```bash
  python -m pip install onnxruntime
  python -c "from onnxruntime.quantization import quantize_dynamic, QuantType; quantize_dynamic('vendor/ipa-model-cache/aidankmcl/wav2vec2-large-lv60_phoneme-timit_english_timit-4k_simplified/onnx/model.onnx','vendor/ipa-model/wav2vec2-phoneme/onnx/model.onnx',weight_type=QuantType.QInt8)"
  ```
  Then copy the non-onnx files (config/tokenizer/preprocessor) into `vendor/ipa-model/wav2vec2-phoneme/`.
- Until the quantized model is vendored, `/api/ipa` returns 503 and IPA degrades gracefully.

## Backend
- Transformers.js used **`onnxruntime-node`** (native). For packaging, `@huggingface/transformers`
  + `onnxruntime-node` must be esbuild-`external` in `scripts/bundle.mjs` and their native files
  `asarUnpack`ed in `electron/builder.config.cjs` (Task 10). (WASM backend is the fallback if the
  native `.node` files can't be unpacked cleanly.)

## Verify
`node scripts/verify-ipa.mjs` (uses `vendor/ipa-model/wav2vec2-phoneme`). For local testing against
the un-quantized cache:
`IPA_MODEL_DIR=vendor/ipa-model-cache IPA_MODEL_ID=aidankmcl/wav2vec2-large-lv60_phoneme-timit_english_timit-4k_simplified node scripts/verify-ipa.mjs`

## Status (what's done vs. remaining)

**Done + merged-ready (branch `phonetic/ipa`):** the full pipeline — `ipaModelDir` config, the
`ipa-phones` Transformers.js service + `IpaUnavailableError`, `POST /api/ipa`, the client `ipa`
service, parallel capture wiring + IPA chip, AI feeding (`formatSamplesForPrompt` + `phoneticAnalysis`
task + button), decode-view display, `Sample.ipa`, Electron `IPA_MODEL_DIR` env + `extraResources` +
`.gitattributes`. `scripts/bundle.mjs` marks `@huggingface/transformers` **external** so the desktop
build (`npm run bundle`) succeeds — in dev the service loads it from `node_modules`; in the packaged
app it's absent → `/api/ipa` returns 503 and IPA degrades gracefully. The **engine is proven**:
`node scripts/verify-ipa.mjs` (against the cached model) transcribes the fixture to phones.

**Packaged IPA — DONE + verified.**
1. **Model vendored:** the int8-quantized `model.onnx` (303 MB) + config/tokenizer live in
   `vendor/ipa-model/wav2vec2-phoneme/`. The config/tokenizer files ARE committed; the 303 MB
   `model.onnx` is **gitignored** (exceeds GitHub's 100 MB file limit) and regenerated locally via
   the quantize command above (a build artifact). To put the weights in the repo, use **Git LFS**
   (`git lfs track 'vendor/ipa-model/**/*.onnx'`; ~303 MB fits the free 1 GB tier) or
   download-on-first-run. The local + packaged builds already have it on disk.
2. **Runtime deps shipped:** `@huggingface/transformers` (+ `@huggingface/jinja`,
   `@huggingface/tokenizers`, `onnxruntime-node`, `onnxruntime-common`, `onnxruntime-web`) are
   copied to `resources/server-deps/node_modules` via `extraResources` (plain files, outside the
   asar so the native `.node` loads). `electron/main.ts` sets `NODE_PATH` to that dir for the
   forked server, so the external `@huggingface/transformers` resolves.
3. **Verified:** a packaged `--dir` build + `POST /api/ipa` (16 kHz WAV) returns phones — confirmed
   end-to-end in the running app (server port discovered via the listening socket).
