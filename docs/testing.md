# Acceptance testing

The current common commands and CI boundaries are documented in [CI and installed release verification](ci-release-gates.md). W12 adds six artifact-integrity tests to the 204 server/shared/client tests. The three gated native unit skips remain explicit; the installed acceptance workflow separately requires real native audio inference. See [dependency review](dependency-review.md) for updates and retained advisories.

The W01 harness separates reproducible defects from passing release requirements. Browser tests run the real bundled Express backend and built React application, with a fresh temporary data directory for each test. Individual browser checks use explicit deterministic model/status and failure fixtures where needed; the suite does not measure model quality.

## Commands

```sh
npm ci
npx playwright install chromium
npm test
npm run typecheck
npm run test:e2e
npm run test:public
node scripts/verify-ipa.mjs
node scripts/verify-stt.mjs
```

`test:e2e` rebuilds the client, server, and Electron bundles first. `test:e2e:run` reuses those bundles for test-authoring iterations. Do not use stale bundles to certify a source change. Reports, screenshots, traces, and native runtime/model hashes are written beneath the ignored `test-results/` directory. Browser and native scripts preserve their synthetic temporary data for diagnosis; they do not accept the normal user profile directory.

The browser suite has twenty-three working acceptance checks and one remaining expected failure: Unicode translation. The substring-grading and sandbox navigation defects now have passing assertions. Audio coverage includes original-file preservation, interrupted preparation, upload/profile failures, reload/retry, playback/download, linked segments, delete/undo, real WebM/Opus decoding and synthetic microphone capture. Expected failures execute setup before declaring the known failing assertion. Playwright counts expected failures as passed when reproduced; do not report them as working product flows.

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

## W08 evidence semantics

`npm test` totals 164 passing tests (134 server/shared and 30 client), with three gated native unit checks skipped. Type checks and client lint pass. The final full browser run passes 19 working checks and reproduces the one expected Unicode-translation failure. `workspace-evidence.spec.ts` covers duplicate counting, legacy rating preservation, unrated word/rule creation, rating removal, backend restart, failed-save history, range counts, sparse support, tied candidates and explicit base selection.

The final unpacked Windows executable also passes `verify:release -- <executable> test-results/w08-final-release.json --negative-model`. Its expanded check requires an unrated sandbox reward and a server-recorded metric snapshot visible in the dashboard after native recovery. See [verification/w08-windows-evidence.json](verification/w08-windows-evidence.json). Model inference and original audio playback pass separately from these deterministic UI assertions. No new independent CI or installer certification is claimed.


## W09 local boundary

`npm test` passes 183 tests (153 server/shared and 30 client), with three gated native unit checks skipped. Type checks, client lint and the desktop build pass. The complete 21-case browser suite passes 20 working checks and reproduces the existing expected Unicode-translation failure. Security coverage includes anonymous and binary API rejection, invalid origins, explicit pairing, HttpOnly cookie isolation, local fonts, no external asset requests and a real script blocked from evaluating code by CSP. Microphone coverage also asserts that browser SpeechRecognition never starts.

`node scripts/verify-development.mjs` separately passes the actual direct development server plus Vite proxy: pairing, profile creation, reload, inaccessible document cookie and secret-free server output. Both development ports must be available. Synthetic fixtures still require real credentials; production authentication has no bypass for tests.

The unpacked Windows probe passes trusted-main-frame API access, anonymous HTTP and second-window rejection, blocked navigation/popups, sandbox preferences, synthetic audio capture and camera rejection. Native inference, original-file checksums, playback, failed-save recovery, persisted sandbox state and evidence history work across a real relaunch. The missing-model negative check still returns `IPA_MODEL_MISSING`. See [verification/w09-windows-boundary.json](verification/w09-windows-boundary.json) and [local-security.md](local-security.md). A fake capture device supplies the microphone input; permission handlers remain active. This does not certify physical microphone hardware, a signed installer, model accuracy or a clean-machine W09 CI run.


## W10 readiness, inference and retained history

The final unit baseline is 202 passing tests (172 server/shared and 30 client) plus three gated native unit skips. Type checks, client lint and the build pass. The complete 23-case browser suite has 22 working checks and the existing expected Unicode failure. After the final pending-suggestion cleanup, the five affected runtime/sandbox checks passed again. The browser fixtures advertise explicit readiness; service reachability alone no longer enables AI controls.

`inference-boundary.test.ts` uses an actual local HTTP fixture service to verify that queued generation starts only after cancelled upstream work closes, both generation and pull disconnects propagate, failed/truncated streams retain an error, downloads require confirmation, and cancel/retry works. Model metadata tests cover aliased cloud models, embedding models, missing metadata and revalidation after display caching. These fixtures establish protocol behavior, not model quality.

`node scripts/verify-local-chat.mjs` requires an already-installed default local model and running Ollama. It runs the authenticated bundled backend in an isolated data directory, rejects installed remote/embedding candidates sends a synthetic dictionary prompt to the default, cancels a subsequent generation after its first token, and verifies another request succeeds. It performs no model download. The [retained result](verification/w10-local-models.json) distinguishes that run from the earlier two-model smoke comparison.

The final unpacked Windows probe verifies cancellation after a real phone child spawns, waits for its exit before reporting cancellation, then runs actual inference successfully. It reports storage/audio capabilities separately from unavailable chat, checks saved proposal recovery after native close/relaunch, and preserves all prior audio, sandbox and evidence checks. See [verification/w10-windows-runtime.json](verification/w10-windows-runtime.json). This local artifact is not a signed installer or independent clean-machine W10 certification.


## W11 public presentation and shared corpus

The unit baseline is now 204 passing tests (174 server/shared and 30 client), with the same three gated native skips. Shared-presentation tests ensure every public phrase/gloss comes from the app's versioned Eridian seed and unknown words remain unresolved. The existing download component tests now require a pinned asset/version and a visible distinction between the old installer and preview setup.

`npm run test:public` builds the public variant with the real `/Xenolinguist/` base path into an isolated generated directory, then starts Vite preview for eight Playwright checks. It does not overwrite the desktop client build. The checks cover exact dictionary input, unknown/empty input, no API/external requests from interaction, public `/app` redirection, pinned release links, internal anchors, keyboard selection, reduced motion, pause/resume and layouts at 320, 390, 768 and 1440 pixels. The eight checks pass, with no missing requested assets or observed page exceptions in the checked flows. This is not a comprehensive accessibility certification.

The complete 24-case workbench suite passes: 23 working checks plus the known expected Unicode failure. The new demo check creates a real profile through the authenticated backend, compares its corpus with the seed, confirms another existing profile is unchanged and opens it through the local workbench action. That check was rerun successfully with the model-status fixture removed and animations settled for its screenshot. Type checks, client lint, public and desktop builds pass; the desktop bundle retains the existing size warning. After a final public-gloss punctuation-spacing correction, all eight public checks passed again.

[W11 evidence](verification/w11-presentation.json) records source state, measurements and screenshots. External HEAD checks confirm the public site, GitHub release, direct installer, source branch, license and Ollama destinations; the installer response size matches GitHub metadata. The installer was not downloaded/installed in W11. New document paths are checked locally before push. Pages still deploys from `main`; pushing the implementation branch does not update the live site. [Presentation claims](public-presentation.md) map prominent statements to existing evidence and limits.
