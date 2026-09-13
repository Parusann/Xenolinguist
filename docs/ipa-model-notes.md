# Phone model provisioning and packaged verification

The phone service loads a local wav2vec2 CTC model and returns **TIMIT ARPABET phones from an English-trained model**, with approximate 20 ms frame timings. The existing `/api/ipa` route and `ipa` field remain compatibility names. This is not strict IPA, a universal phoneme recognizer, or an accuracy benchmark.

This document describes the implementation preview. The published v1.0.0 installer predates these repairs; see [release status](desktop-release.md).

## Runtime resolution

Development uses the installed Transformers package. Electron passes `XENO_RUNTIME_ROOT` pointing to `resources/server-deps`. `model-loader.ts` uses a `createRequire` anchor inside that directory and the package's supported Node require export. It rejects resolution outside that root. This removes the former reliance on `NODE_PATH`, which [Node ESM does not use](https://nodejs.org/api/esm.html#no-node_path). The anchor follows [Node's createRequire API](https://nodejs.org/api/module.html#modulecreaterequirefilename).

Before packaging, `stage-runtime.mjs` walks installed production dependencies and available optional dependencies from Transformers, checks their versions against `package-lock.json`, and preserves their nested layout and license files outside ASAR. Its generated manifest records package versions and lockfile integrity values. Run `npm ci` first: matching a version is not a substitute for npm's package-integrity verification. Electron Builder copies the staged node_modules root explicitly; its ordinary directory copier excludes that root. An after-pack check verifies that every staged package reached the artifact.

## Exact assets

`vendor/model-manifest.json` records bytes and SHA256 for the phone model/configuration, whisper model/binaries and eSpeak data/binaries. The build fails if any expected file is missing or changed. Model files are checked again before the first phone-model initialization. No runtime download is attempted.

```sh
npm ci
npm run provision:models
# If the ignored weights are absent, explicitly download the pinned distribution:
npm run provision:models -- --download
# Or extract them from an already downloaded, checksum-matching installer:
npm run provision:models -- --release-file=C:/Downloads/Xenolinguist-Setup-1.0.0.exe
npm run build:desktop
```

Provisioning checks the whole archive before extracting its exact model member, then checks the extracted model. It preserves mismatched local files and fails rather than replacing them silently. Downloads use temporary files. The legacy archive extraction currently requires Windows x64 and the locked 7-Zip binary supplied through build dependencies. The phone weights remain ignored by Git. Tracked native files can be restored from the manifest's pinned repository commit.

The distributed ONNX weights have SHA256 `8c4299744f0b7998c4fdc53438fa76835eaf9f9c6657e713f89a01aa56b44935` and 317,482,069 bytes. The v1.0.0 source archive is independently pinned. Its original quantization tool version and model commit were not retained, so reproducing that conversion from upstream source is **not** claimed. See [native/model provenance](../vendor/THIRD_PARTY.md). Source and license references remain intact.

## Request and failure contract

Input must be RIFF/WAVE, mono PCM16 at 16000 Hz, between 25 ms and 120 seconds. Container sizes, chunk bounds, sample format, byte rate, block alignment and complete PCM samples are validated before loading a model. Unsupported containers, empty data, truncated chunks and incorrect rates/channels return HTTP 400 with `IPA_UNSUPPORTED_INPUT`.

Each W10 phone job runs in a fresh disposable child process. Failed initialization is isolated to that job; a later job can retry. Jobs share the acoustic lane with whisper and cancellation kills the child and waits for exit before releasing capacity. Capability failures return HTTP 503 with a safe code and request ID: `IPA_MODEL_MISSING`, `IPA_MODEL_INVALID`, `IPA_PACKAGE_MISSING`, `IPA_NATIVE_LOAD_FAILED`, `IPA_MODEL_LOAD_FAILED`, or `IPA_INFERENCE_FAILED`. Detailed loader diagnostics remain local. The recorder displays actionable errors and retains its recording when phone analysis is unavailable. The W06 audio flow provides independent analysis/retry controls and atomic audio transactions.

Success includes `ipa`, `segments`, and `identity` containing the model ID/hash, output alphabet, Transformers version, backend and Node runtime version. Initial loading verifies the full model once per child process; it is not continuously monitored during that inference. A 120-second input limit bounds request size but is not a performance target or a calibrated acoustic limit.

## Verification

`node scripts/verify-ipa.mjs` bundles and invokes the actual server service in Node. It no longer maintains a separate parser and inference implementation. `npm run verify:release -- <outside-repository-executable> test-results/w05-release.json --negative-model` tests the actual Electron utility process, model identity, output, STT, upload, profile saves and desktop restart recovery. The optional negative-model test may modify only an isolated `xeno-acceptance-*` build in system temp; it restores the hidden model afterward.

Local Windows x64 verification produced 46 ARPABET segments in Node and nonempty, hash-identified phone output in a freshly packaged application. The full packaged acceptance probe now passes, including the missing-model negative test. This corrects the old claim that copying dependencies and setting NODE_PATH had already verified packaged IPA: the W01 audit reproduced that claim as false.

The `Packaged Windows phones` workflow builds on one Windows runner and verifies on a separate runner with no source checkout. The second job installs only Playwright and rejects a harness environment that can resolve Transformers. Its result is retained as `clean-phone-result`. A green job verifies that artifact's loading/inference, not a signed installer, clean-machine installation, phonetic accuracy, or another operating system. Windows x64 is the only manifested native build target; broader release gates remain W12/W25.

The first [independent Windows run](https://github.com/Parusann/Xenolinguist/actions/runs/34648733076) passed on September 11, 2026 for commit `17ff2c2111a262bebe91bb7aaf0d635b3e844a5b`. It returned HTTP 200 and 46 ARPABET segments under Node 24.15.0 with Transformers 4.2.0, and the model hash matched the packaged bytes. A [permanent result snapshot](verification/w05-clean-windows.json) preserves the evidence after the workflow artifacts expire.
