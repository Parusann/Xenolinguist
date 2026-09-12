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

The browser suite has seventeen working acceptance checks and one remaining expected failure: Unicode translation. The substring-grading and sandbox navigation defects now have passing assertions. Audio coverage includes original-file preservation, interrupted preparation, upload/profile failures, reload/retry, playback/download, linked segments, delete/undo, real WebM/Opus decoding and synthetic microphone capture. Expected failures execute setup before declaring the known failing assertion. Playwright counts expected failures as passed when reproduced; do not report them as working product flows.

W06 verification ran the full earlier 14-case suite (11 working checks and 3 expected failures), then all six affected audio checks against the final build after adding interrupted-preparation coverage. That checkpoint had 129 passing unit tests and three gated native unit checks skipped. W07 has 153 passing unit tests and the same three skips; the full 18-case browser suite passed (17 working checks and one expected failure), followed by all five affected sandbox checks after the final integer-grading correction.

## Packaged Windows application

Build an unpacked release outside the repository so it cannot resolve dependencies from the source checkout:

```sh
npm run build:desktop
npx electron-builder --config electron/builder.config.cjs --win --dir --publish never --config.directories.output=C:/Temp/xeno-acceptance-build
npm run verify:release -- C:/Temp/xeno-acceptance-build/win-unpacked/Xenolinguist.exe
```

This requires the native vendor assets, including `vendor/ipa-model/wav2vec2-phoneme/onnx/model.onnx`. The weights are ignored by Git; use `npm run provision:models -- --download` or the pinned local-archive option in `docs/ipa-model-notes.md`. Packaging validates the asset manifest and stages the locked runtime dependency closure. This is an unpacked-app test, not a clean-machine installer or signing certification.

The release verifier launches the real Electron executable and utility process with a fresh system-temp user-data directory. Isolation requires the explicit `--xeno-test-user-data` argument, `XENO_TEST_MODE=1`, and a matching random ownership token in that directory. Normal launches do not honor a desktop test data override. Acceptance launches suppress updater checks and automatic model pulls and keep the window hidden; they still run the actual backend, renderer, and native endpoints.

The script records executable/archive hashes, fixture/model/runtime hashes, runtime versions, current source revision and changed-file hashes, safe endpoint responses, and local loader diagnostics. It checks actual profile writes and the workbench through the native window. It then injects a failed mutation, persists a translation draft, drives the real window-close handshake, and restarts the same isolated user-data directory on a new local port. Only the test instance's native dialog response is controlled to choose Close anyway. Recovery must apply the pending sample exactly once and restore the draft across origins. W06 also persists an original WAV draft and notes, recovers them after relaunch, runs real bundled phone analysis through the UI, saves both verified assets, checks original byte identity and exercises playback. It exits nonzero if any required native capability fails. W05 repairs the original phoneme failure and requires nonempty output with matching model identity. Add `--negative-model` only for a temporary `xeno-acceptance-*` build to verify a missing-model error and automatic fixture restoration. W07 additionally saves a sandbox answer key, failed attempt, hint and unfinished answer under an injected write failure, closes and relaunches the app, verifies the identical restored session, and grades again without duplicate rewards. This generator response is a deterministic fixture. The separate `Packaged Windows phones` workflow runs inference on a fresh runner without source dependencies; retain that job's report as additional evidence.

## Initial measured findings

The source baseline was `6345a0650bd0d048fdddbdc480a3cc848178db19`. On Windows x64 with Node 25.8.2, the original suites had 69 passing tests and 3 gated native tests skipped. After adding launch-isolation tests, there were 72 passing tests and the same 3 skips. Standalone IPA and whisper checks both produced nonempty output; these checks establish executable capability, not acoustic accuracy.

The packaged Electron 42.3.3 utility process used Node 24.15.0 and returned IPA HTTP 503. Its retained exception was `ERR_MODULE_NOT_FOUND`: the external `@huggingface/transformers` import could not resolve from the packaged server. Packaged whisper transcription, direct WAV upload, profile save, disk persistence, and workbench rendering succeeded. Resolving the package must precede any native ONNX diagnosis; the failing import never reached model loading.

The WAV browser probe identified the exact chain: `decodeAudioData` received 110,286 bytes and detached the buffer, leaving zero bytes. The importer built its Blob from that detached buffer, sent empty base64, received HTTP 400 (`Missing id or data`), and saved a sample with `audio_id: null`. Uploading the untouched fixture bytes directly returned HTTP 200. The defect is in client buffer ownership, not WAV format rejection.

The initial concurrency records include both HTTP responses and final disk-backed state for each of ten trials. A non-2xx write is classified separately from a lost edit following two acknowledged writes. See `testing-baseline.json` for the historical observations. The W03 acceptance test now requires one HTTP 200 and one HTTP 409 per trial, retries the conflicting request at the next revision, and verifies both independent fields after a real backend restart in all ten trials.

## Before each implementation commit

Run the affected unit tests and type checks, then the real browser/native flow for the changed boundary. Keep failures explicit and record the exact commands, result, and remaining limitations in the commit's Situation, Task, Action, and Result description. Do not claim skipped tests, expected failures, or an unpacked executable as a verified installer or release.
