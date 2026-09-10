# Acceptance testing

The W01 harness separates reproducible defects from passing release requirements. Browser tests run the real bundled Express backend and built React application, with a fresh temporary data directory for each test. Only Ollama status and generated sandbox input are deterministic fixtures; this suite does not measure model quality.

## Commands

```sh
npm ci
npx playwright install chromium
npm test
npm run typecheck
npm run test:e2e
node scripts/verify-ipa.mjs
node scripts/verify-stt.mjs
```

`test:e2e` rebuilds the client, server, and Electron bundles first. `test:e2e:run` reuses those bundles for test-authoring iterations. Do not use stale bundles to certify a source change. Reports, screenshots, traces, and native runtime/model hashes are written beneath the ignored `test-results/` directory. Browser and native scripts preserve their synthetic temporary data for diagnosis; they do not accept the normal user profile directory.

The current browser suite contains a passing text-save/restart check, a status-aware concurrency characterization, and four expected failures: one-letter sandbox grading, sandbox navigation state, Unicode translation, and WAV attachment. Expected failures execute their setup before declaring the known failing assertion. An unexpected pass fails the run so its annotation must be removed when repaired. A green characterization run does **not** mean these product defects are fixed. W03 must replace the concurrency characterization with revision/conflict and durability acceptance assertions.

## Packaged Windows application

Build an unpacked release outside the repository so it cannot resolve dependencies from the source checkout:

```sh
npm run build:desktop
npx electron-builder --config electron/builder.config.cjs --win --dir --publish never --config.directories.output=C:/Temp/xeno-acceptance-build
npm run verify:release -- C:/Temp/xeno-acceptance-build/win-unpacked/Xenolinguist.exe
```

This requires the existing native vendor assets, including `vendor/ipa-model/wav2vec2-phoneme/onnx/model.onnx`. The weights are ignored by Git; provision them using `docs/ipa-model-notes.md`. For the initial diagnosis, the weights from the previously downloaded 1.0.0 release were copied into the ignored vendor location, and the actual hashes were recorded. W05 will replace this manual provisioning with a validated manifest. This is an unpacked-app test, not a clean-machine installer or signing certification.

The release verifier launches the real Electron executable and utility process with a fresh system-temp user-data directory. Isolation requires the explicit `--xeno-test-user-data` argument, `XENO_TEST_MODE=1`, and a matching random ownership token in that directory. Normal launches do not honor a desktop test data override. Acceptance launches suppress updater checks and automatic model pulls and keep the window hidden; they still run the actual backend, renderer, and native endpoints.

The script records executable/archive hashes, fixture/model/runtime hashes, runtime versions, current source revision and changed-file hashes, safe endpoint responses, and local loader diagnostics. It checks actual profile writes and the workbench through the native window. It exits nonzero if any required native capability fails. The initial phoneme failure therefore intentionally returns exit code 1; do not suppress that result in release CI.

## Initial measured findings

The source baseline was `6345a0650bd0d048fdddbdc480a3cc848178db19`. On Windows x64 with Node 25.8.2, the original suites had 69 passing tests and 3 gated native tests skipped. After adding launch-isolation tests, there were 72 passing tests and the same 3 skips. Standalone IPA and whisper checks both produced nonempty output; these checks establish executable capability, not acoustic accuracy.

The packaged Electron 42.3.3 utility process used Node 24.15.0 and returned IPA HTTP 503. Its retained exception was `ERR_MODULE_NOT_FOUND`: the external `@huggingface/transformers` import could not resolve from the packaged server. Packaged whisper transcription, direct WAV upload, profile save, disk persistence, and workbench rendering succeeded. Resolving the package must precede any native ONNX diagnosis; the failing import never reached model loading.

The WAV browser probe identified the exact chain: `decodeAudioData` received 110,286 bytes and detached the buffer, leaving zero bytes. The importer built its Blob from that detached buffer, sent empty base64, received HTTP 400 (`Missing id or data`), and saved a sample with `audio_id: null`. Uploading the untouched fixture bytes directly returned HTTP 200. The defect is in client buffer ownership, not WAV format rejection.

Concurrency records include both HTTP responses and final disk-backed state for each of ten trials. A non-2xx write is classified separately from a lost edit following two acknowledged writes. See `testing-baseline.json` for the observed counts and artifact identifiers; fresh runs may change their distribution because this is a race.

## Before each implementation commit

Run the affected unit tests and type checks, then the real browser/native flow for the changed boundary. Keep failures explicit and record the exact commands, result, and remaining limitations in the commit's Situation, Task, Action, and Result description. Do not claim skipped tests, expected failures, or an unpacked executable as a verified installer or release.
