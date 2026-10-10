# Acoustic analysis and evaluation

W23 is in progress. Its first unit adds bounded greedy CTC summaries to the existing phone endpoint. Inference remains in a disposable process in the acoustic queue; cancellation waits for that process to exit. WAV header validation on the server now checks container and sample geometry without allocating a decoded Float32 copy. The inference process performs sample conversion and native processing.

## Current output contract

The compatibility route `/api/ipa` still returns `ipa`, `segments` and model `identity`. It now also returns `audio` and `ctc`. `audio.sha256` identifies the exact submitted PCM WAV bytes, including their container; it is not the hash of the original browser recording if preparation converted that recording. Sample rate, sample count and duration identify the analyzed signal. Model identity retains the verified ONNX digest, alphabet and runtime versions.

`ctc` records greedy decoding, frame/vocabulary counts, blank ID, stride, blank/special frame counts and one score summary per emitted phone run. Each run links to its segment index and gives a start frame and exclusive end frame. Adjacent repetitions of the same class collapse; blanks and special-token runs break repetitions. Bracketed special tokens and empty labels are suppressed from displayed phones, but their frame counts remain explicit. An acoustic label such as TIMIT `h#` is retained; it is not the CTC blank token.

For each frame, the decoder computes stable softmax over the full vocabulary after subtracting the maximum logit. For each emitted run it averages those probabilities across its frames, retains the three largest means with token IDs and labels, and records the remaining probability mass. Ties choose lower token IDs. It also reports the mean frame entropy in bits. These are **uncalibrated acoustic model outputs**, not probabilities that a word, meaning or phone sequence is correct. Averaging probabilities is not softmax of averaged logits; the retained candidates are not a beam search or alternate transcription.

Timings preserve the existing frame-bin convention: frame index multiplied by 20 ms. They are approximate model bins, not measured phonetic boundaries. The pinned model's seven convolution layers imply a 320-sample stride and 400-sample receptive field. The service checks that the output frame count is `floor((samples - 400) / 320) + 1` and that the batch size is one. Receptive-field centers, phonetic boundary adjustment and forced alignment are not implemented.

The decoder rejects non-finite logits, invalid tensor sizes/blank IDs/strides, more than 6,000 frames or more than 256 output classes. Candidate retention is capped at three per run. It never returns a plausible partial transcript from corrupt logits. Input remains mono PCM16 WAV at 16 kHz, 25 ms–120 seconds (400–1,920,000 samples). This is a resource ceiling, not a latency guarantee. The second unit below bounds each native phone window; overall native memory and recognition accuracy still require measurement.

## Verification and limits

`engine/src/__tests__/ctc.test.ts` checks CTC repeat/blank behavior, independent softmax and entropy arithmetic, frame-probability averaging, tie/offset invariance, extreme finite logits, special/blank-only output, invalid inputs and maximum-sized output accounting. Server cases check sample geometry and duration limits, exact input hashes, shared initialization, corrupt native output and existing input/runtime boundaries.

Run the actual native service with `node scripts/verify-ipa.mjs`. It validates input identity, frame geometry, complete frame accounting, run/segment links, score mass and model identity through an independent acceptance helper. The clean installed-app harness applies the same checks to the actual authenticated endpoint after verifying native cancellation. This tests execution and metadata integrity, not phone recognition accuracy. Raw native logits are not retained, so a saved response alone cannot reproduce the softmax calculation; deterministic numerical correctness is tested using explicit synthetic tensors.

The current UI continues consuming the original phone string and timings. The new summaries are API output, not yet a saved annotation layer or a score viewer. No new persistence claim or preservation of manual corrections across re-analysis is made by this first unit.

## Remaining W23 work

1. Verify the five-minute phone workflow described below on both source platforms and the independent Windows installer. Whisper transcription and microphone capture retain the two-minute ceiling. The energy heuristic is not a validated voice-activity model.
2. Generated phone and transcription histories now preserve independent manual annotations through restart and archives. Manual edits remain a mutable layer rather than an append-only edit log.
3. Curate a licensed labeled corpus within the current model's English ARPABET domain. Before evaluating it, freeze inventory normalization, silence handling, word/phone edit-distance denominators, alignment tolerance, failure accounting and cold/warm timing procedure. No labeled-corpus accuracy, latency target or calibrated uncertainty is established yet.
4. Consider beam decoding or another phone model only if measured errors justify it and its assets, license, alphabet and Windows runtime are verified. Tone, clicks and wider language coverage remain untested.

See [model provenance and runtime limits](ipa-model-notes.md), [audio lifecycle](audio-lifecycle.md) and [implementation progress](implementation-progress.md). W23 cannot be marked complete until its long-audio, annotation-preservation and labeled-evaluation exit conditions are met.

## First-unit verification at the frozen revision

Revision `4342cb672ee8734096a6280b3ee92892e938df98` passes [Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/37163472487): 462 unit tests (431 server/shared/engine/evaluation and 31 client), seven tooling tests, lint, type checking, desktop build, 46 workbench checks and eight public checks per platform. Browser reports have no skipped, flaky or unexpected results. Downloaded 12/60/336 regression/induction/number records and 56 elicitation traces replay on both platforms; number summaries match W19. Three native unit checks remain gated.

[Independent installed Windows acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/37163470366) verifies 3,774 application files, native cancellation/recovery and eight project archive round trips. Its new acoustic check verifies the actual installed endpoint's audio/model identities, frame geometry, run links and probability accounting. The local native run retains 46 phone runs; installed acceptance retains 46. Both have 172 frames on the 55,121-sample fixture. These are execution results, not a labeled recognition score.

The [native response](verification/w23-ctc-native.json), [installed response](verification/w23-ctc-installed.json), [synthetic logits and output](verification/w23-ctc-example.json) and [verification metadata](verification/w23-ctc-verification.json) are retained. With locked dependencies installed:

```sh
npx tsx docs/verification/w23-ctc-replay.mts
```

This recomputes the synthetic decode and validates both native responses against the fixture hash, geometry and score accounting without loading a model. It does not reproduce native inference or its softmax from raw logits. In the synthetic example, frames zero and one collapse into `aa`: their probability vectors are approximately (0.5, 0.25, 0.125, 0.125) and (0.25, 0.25, 0.25, 0.25). The retained `aa` mean is 0.375 and the mean entropy is 1.875 bits. Later blank and special frames preserve separate phone runs instead of merging them.

Production audit reports 4 high entries; the full audit reports 13 high and 1 moderate entries. [Retained audit reports](verification/w23-ctc-verification.json) preserve these unresolved findings. No dependency remediation, main merge, installer release or Pages deployment occurred. W23 remains in progress.

## Bounded phone windows: second implementation unit

Phone jobs now process one overlapping native window at a time. Each output core owns at most 400 frames (about eight seconds), with up to 25 context frames on either side. The planner searches the final second of a full core for adjacent low-energy bins before falling back to the fixed limit. A bin is quiet when the mean squared amplitude in its 400-sample receptive field is at most 0.0001 (RMS 0.01). This is an energy-only boundary hint: it neither proves silence nor removes audio. The existing tested preparation/resampling worker remains unchanged.

Every window starts on the global 320-sample grid. Its retained core contributes each global logit row exactly once. CTC decoding runs once after assembly, so a phone run crossing a join collapses once, while repeated phones separated by a blank stay distinct. This guarantees deterministic frame ownership, not equality with whole-recording inference: model context and per-window normalization can change predictions. No recognition-quality advantage is claimed without the planned labeled evaluation.

For example, the replay's 810-frame non-quiet synthetic signal has the following ownership (ranges end exclusively):

| Window | Frames supplied to the model | Frames retained for decoding |
| --- | --- | --- |
| 0 | 0–425 | 0–400 |
| 1 | 375–810 | 400–800 |
| 2 | 775–810 | 800–810 |

Frame 400 appears in two native inputs but is retained only from window 1. A predicted blank at that frame preserves two separate `a` runs spanning frames 0–400 and 401–810. Without the blank, identical adjacent predictions collapse into one run. This checks stitching semantics, not whether a real acoustic boundary is recognized correctly.

The response's `processing` record retains every window's source sample range, global frame range, owned core and boundary reason. A 120-second input has at most 18 windows; each native input is at most 144,399 samples (under 9.025 seconds). The stitched logits remain bounded by the existing 6,000-frame / 256-class ceiling. Native inputs and outputs are disposed after use, and inference runs sequentially in one disposable process. Failure in any window returns an error rather than a partial transcription.

Completed-window progress crosses IPC into the existing Jobs panel. Cancellation kills the native process, and the acoustic queue keeps its slot until that process exits. Unit cases additionally verify cancellation between windows and cleanup after cancellation during a call. This does not add background persistence or a new recording-length tier. Generated analyses still share the old editing flow; separate generated/manual annotation layers remain required.

Twelve new tests cover short-input identity, exact frame coverage and context bounds through the 120-second cap, quiet/fallback boundaries, malformed samples, contradictory overlap rows, cross-join repetition, sequential execution, progress, tensor disposal, corrupt outputs, cancellation and later-window failures. `node scripts/verify-phone-chunks.mjs` exercises the actual model on eight repetitions of the existing fixture (27.5605 seconds). It retains full output, window plan, identities and observed progress timings. Repeated speech is an engineering fixture, not a labeled corpus or cold/warm performance study. The installed harness additionally cancels a 30-repetition request after at least one window completes, polls the authenticated jobs API while inference runs, then requires a new multi-window request to succeed.

## Second-unit verification at the frozen revision

Revision `57703a9c9ebce04fe5feef6fba8b7c030fd14200` passes [Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/37232466637): 474 unit tests (443 server/shared/engine/evaluation and 31 client), seven tooling tests, lint/type/build gates, 46 workbench checks and eight public checks per platform. Browser reports contain no skipped, flaky or unexpected results. Downloaded 12/60/336 regression/induction/number records and 56 elicitation traces replay on both platforms; number summaries match W19. The earlier CTC examples still replay. Three native unit checks remain gated.

[Independent installed Windows acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/37232466616) verifies 3,774 files and eight archive round trips alongside native processing and recovery. Its 103.35-second repeated-audio request is cancelled after 1 of 14 windows completes. The response returns `JOB_CANCELLED`; a fresh 27.5605-second request then succeeds with 4 windows and all 1,377 frames accounted for. Its largest native window contains 144,080 samples. These are real installed operations, not mocked model responses.

Observed installed cancellation took 41.7 ms from the cancellation request through receipt of the cancelled response. The 125 authenticated Jobs polls had a maximum observed round trip of 23.7 ms. The subsequent long request completed in 27.806 seconds; the separate local service invocation took 6.673 seconds. These single runs include model startup, and browser measurements include IPC/HTTP overhead. They are not a cold/warm benchmark, a memory measurement or a guarantee for other machines. Emitted phone counts are not accuracy scores.

The local response contains 373 phone runs and the installed response 378, despite matching input/model hashes and window plans. Native prediction equality across these executions is not established, and the cause of the difference has not been isolated. Both responses satisfy the frame-ownership and score-accounting contract; the retained responses expose the difference for the planned recognition and reproducibility evaluation.

An additional [local near-cap run](verification/w23-chunks-near-cap.json) processes 117.132125 seconds through 16 windows, accounting for 5,856 frames in 24.877 seconds. It uses the same compiled implementation; its source record transparently retains pending documentation edits with no runtime source changes. This is one engineering stress fixture, not a broader performance result.

The [local native response](verification/w23-chunks-native.json), [installed response and cancellation observations](verification/w23-chunks-installed.json) and [verification metadata](verification/w23-chunks-verification.json) retain full provenance. To reconstruct the exact repeated WAVs, rebuild all three window plans, validate frame/score identities and exercise a synthetic blank across a chunk boundary:

```sh
npx tsx docs/verification/w23-chunks-replay.mts
```

Replay does not rerun native inference, reconstruct unretained native logits or reproduce timing. Production audit retains 4 high entries; full audit reports 6 high and 1 moderate entries. [Dependency review](dependency-review.md) retains unresolved update work. No main merge, installer release or Pages deployment occurred. W23 remains in progress.

## Retained phone analyses: third implementation unit

Phone analysis now creates an independent record instead of replacing editable segments. Each recording can retain up to eight results and 4 MiB of compact JSON, with no silent pruning. Every record contains its ID, capture time, original-audio hash and the complete phone response: prepared-audio identity, model/runtime identity, generated text/timings, CTC scores and window plan. These are structurally validated client-submitted records, not signed inference receipts or proof of the original acoustic content. Scores remain uncalibrated and timings approximate.

Draft phone analysis stages the recording first and analyzes the retained prepared WAV. This also avoids associating a new device's regenerated derivative with an older retained hash after recovery. Draft history survives through the existing durable save queue, then joins the sample and clip in their atomic revision-checked save. Retention failures are visible and preserve earlier analyses. Desktop/browser storage quotas still apply; a 4 MiB recording history does not guarantee that a large project fits its separate draft or archive limits.

The Samples workbench displays generated history separately from manual segments, with expandable audio/model provenance. An explicit **Copy analysis N to manual segments** action creates independent editable segments and records their source analysis. Copying replaces the current manual segments and dictionary links; re-analysis never performs that copy automatically. Existing manual labels, boundaries and dictionary links survive later phone results. Saved recordings expose the same history, re-analysis and editing controls. Manual segment edits replace the current editable layer; this is not an append-only edit log or a calibrated score viewer.

Server validation binds each result to both clip asset hashes and the analyzed duration, checks frame/run/score/window consistency, and verifies stored audio bytes when appending a result. Previously retained analyses cannot be edited, omitted or reordered while the clip remains present. Re-analysis reads the latest queued clip before appending, preserving manual edits made while inference ran; stale server revisions remain conflicts. Removing an entire recording/project is still an explicit deletion, not a permanent audit archive.

Portable archives retain generated records byte-equivalently as JSON values, including clip-local analysis IDs and manual-source links, while remapping editable segment and dictionary identities. Old clips remain readable without inventing generated history. Legacy clips lacking verified original/prepared assets must be imported as a new recording before retaining analyses. Imports validate structure and asset identities; they do not authenticate who produced a submitted result.

Transcription no longer overwrites existing pending segments or replaces a note merely because it starts with `Transcript:`. It still appends transcript text to notes, and its generated output lacks the separate provenance/history contract above. Whisper integration, recordings beyond 120 seconds, labeled recognition/reproducibility evaluation and the full W23 exit conditions remain open.

## Third-unit verification

Runtime revision `eafd0ee` and extended acceptance revision `9192533f2051f8996a35cb20909215651511476c` pass [Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/37420477303): 485 unit tests (454 server/shared/engine/evaluation and 31 client), seven tooling tests, lint/type/build gates, 48 workbench checks and eight public checks per platform. Browser reports have no skipped, flaky or unexpected results; three native unit checks remain gated. Downloaded 12/60/336 regression/induction/number records and 56 elicitation traces replay per platform, with unchanged W19 number summaries.

Eleven new unit cases cover independent copying, append-only history, provenance/geometry validation, count/byte limits, tampered audio, write failure/revision conflicts, restart and archive identity mapping. The two new browser scenarios exercise corrections with dictionary links, re-analysis, failed-save retry, reload/restart, actual archive restoration, malformed model responses and navigation during a delayed response. Their generated results are synthetic fixtures, not inference measurements. Retained [Linux](verification/w23-layers-browser-linux.json) and [Windows](verification/w23-layers-browser-windows.json) records expose saved, re-analyzed and restored projects; a [Windows capture](verification/w23-layers-browser-windows.png) shows the separate layers.

[Clean installed Windows acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/37420477395) verifies 3,772 files and eight archive round trips. It executes two real bundled phone analyses, retains a manual correction between them, validates both against the prepared WAV, and compares the complete generated histories and manual source links after archive restore. The [native source/restored clips](verification/w23-layers-installed.json) and [verification metadata](verification/w23-layers-verification.json) retain the evidence. Native cancellation and multi-window recovery also pass.

The inventory drops from 3,774 to 3,772 files because the phone service and WAV encoder now share the main frontend bundle instead of separate lazy chunks. The compared manifests have the same lockfile hash, 50 runtime packages and three native asset groups; the file-count change is not removal of a native dependency.

```sh
npx tsx docs/verification/w23-layers-replay.mts
```

Replay validates saved schema/identity/accounting, archive remapping, immutable history and independent manual copying. It does not rerun inference or reconstruct native logits, timing or recognition accuracy. The compatibility `sample.ipa` field remains the text copied during draft editing; subsequent manual segment edits do not regenerate that legacy snapshot. Current manual segments and retained generated records are the separate layers described above.

The October 6 CI audit reports 1 critical, 7 high and 9 moderate entries overall; production reports 1 critical, 5 high and 3 moderate entries. These findings are unresolved; the lockfile is unchanged. W23 still requires Whisper provenance, extended recording workflows and labeled recognition/reproducibility evaluation. No main merge, public installer release or Pages deployment occurred.


## Whisper response provenance: fourth implementation unit

`POST /api/stt` now returns a validated transcription response with the exact submitted PCM WAV SHA-256, sample rate/count/duration and versioned native provenance. Before every execution the service streams and verifies all six Whisper manifest assets, including the model, executable and companion DLLs. The response records their pinned identities, manifest engine revision, Node/platform/architecture, requested language, two CPU threads and the pinned CLI's remaining decoding defaults. Paths and temporary filenames are not returned. This identifies the configured bytes observed before execution; it is not a signed attestation or protection against an external process changing files during execution. Custom Whisper binaries/models outside the pinned manifest are rejected.

Whisper and phone inference share the existing container/PCM geometry validator: mono PCM16 at 16 kHz, 25 ms–120 seconds. Invalid language syntax is rejected instead of silently selecting auto. Raw JSON is limited to 2 MiB, with at most 6,000 segments and 200,000 transcript characters. Missing/non-finite/reversed/overlapping or out-of-recording timing is rejected, not filled in or silently clamped; segments use model timestamps, not word/phonetic alignment. Empty output is retained as empty, without invented words. These conservative bounds can reject a native result whose timestamps exceed the recording.

`languageProb` is now nullable. `null` means detection was not reported or was bypassed by explicit language selection; a measured zero stays zero. Explicit language selection no longer manufactures a probability of one. The legacy `mode` field and 0.6 threshold remain compatibility heuristics, not validated speech detection or transcript confidence. Low-score UI output is labeled “uncertain transcript”; the detector badge labels a reported value as a language score and renders missing scores explicitly. A selected language says nothing about whether the transcript is correct.

The browser validates the full response, checks its input hash and requested language, and rejects mismatched results before changing annotations. Prepared recordings bypass a second audio conversion; other audio still follows the existing conversion path. Existing transcription notes/manual segments continue to follow their previous storage flow. **This unit does not yet retain the new response provenance in clip history or portable archives.** A bounded independent transcription-history layer, explicit copying into manual annotations and restart/archive retention are the next unit. Existing recordings gain no invented provenance. Longer recordings and labeled recognition/reproducibility evaluation remain open.

Local verification passes 499 unit tests (466 server/shared/engine/evaluation and 33 client), nine tooling tests, lint, type checking and desktop build. New cases cover score absence/zero, explicit selection, native output and identity validation, temporary-file cleanup, changed asset bytes, and rejection of mismatched browser responses. Three native unit cases remain gated. A separate actual bundled Whisper execution passes automatic and explicit-English identity checks; both are execution/provenance tests, not labeled recognition scores. Cross-platform source and independent installed acceptance remain pending at this implementation checkpoint. The installed harness now independently checks the new metadata against WAV bytes and installed file inventories in both language-selection modes.


## Fourth-unit verification at the frozen revision

At `e33c030411b1b4a95b8ac53c6047ef6de9c3a89f`, [Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/37834881248) passes 499 unit tests (466 server/shared/engine/evaluation and 33 client), nine tooling tests, lint/type/build gates, 49 workbench and eight public checks per platform. Browser reports contain no unexpected, skipped or flaky cases. Downloaded 12 regression, 60 induction, 336 number and 56 elicitation records replay on both platforms, with unchanged W19 number summaries. Three native unit cases remain gated.

[Independent installed acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/37834881340) verifies 3,772 application files, eight archive round trips, existing phone/manual retention and actual Whisper execution in both automatic and explicit-English modes. Both responses match the submitted audio and all six installed native assets. Explicit selection has no measured language probability. [Local native responses](verification/w23-stt-native.json), [installed responses](verification/w23-stt-installed.json), [browser boundary records](verification/w23-stt-browser-windows.json) and the [verification record](verification/w23-stt-verification.json) preserve the observations.

Run `npx tsx docs/verification/w23-stt-replay.mts` with locked dependencies to check all four retained responses against shared schemas, fixture bytes and native inventories. Replay checks metadata integrity; it does not rerun inference, score recognition, establish calibration or reproduce timing. Existing phone/window replays also pass after the shared WAV-validator extraction.

The October 8 CI audits report zero critical, four high and eight moderate affected-package entries overall; production retains four high and three moderate. [Full](verification/w23-stt-audit-all.json) and [production](verification/w23-stt-audit-production.json) audit reports are retained. Dependencies and model bytes are unchanged by this unit. Transcription-history persistence, longer audio and labeled recognition/reproducibility evaluation remain W23 work. No main merge, public installer release or deployment occurred.


## Retained transcriptions: fifth implementation unit

Clips may now contain `transcriptions`, an ordered history of up to eight version-1 records and 4 MiB of compact UTF-8 JSON. Each record carries a clip-local ID, capture timestamp, original-audio hash and the complete validated Whisper response. The response's prepared-audio hash and duration must match the clip. Server saves preserve the existing history prefix: changing, deleting, replacing or reordering a saved result is rejected. Appending a result rechecks stored original and prepared bytes. Profile revision checks, durable queued retries and atomic writes remain in force.

Draft transcription first stages and reads the retained prepared WAV, then stores the result in the profile-scoped durable draft. Successful transcription no longer appends generated text to notes or fills empty manual segments automatically. The generated-results panel displays text, language-selection metadata and provenance; an explicit copy replaces manual segments and dictionary links. Copying records `manual_source_transcription_id` and clears the phone-source link; copying a phone analysis clears the transcription-source link. A manual layer cannot reference both sources at once. Later manual corrections leave generated records intact. Current manual segments remain editable, rather than an append-only manual edit log.

Saved re-transcription appends against the current queued clip, preserving manual edits made during inference. Late responses after leaving the project are ignored. Capacity failures preserve existing results. Older recordings gain no invented history; recordings without verified prepared assets must be imported as new recordings for retained analysis. Deleting an entire recording is still an explicit supported operation. Per-history limits are independent of existing overall profile, draft and archive quotas.

Portable archive copies remap clip and manual-segment IDs while retaining clip-local transcription IDs, both audio hashes, native provenance and manual-source links. Submitted metadata is structurally validated and bound to retained audio bytes; it is not a signed native-execution attestation. Existing notes containing earlier transcripts remain ordinary user-editable notes.

Local lint/type/build checks pass with 510 unit tests (477 server/shared/engine/evaluation and 33 client), nine tooling tests and 11 focused browser checks. Eleven persistence tests cover immutable histories, duplicate requests, limits, asset corruption, failed writes, revision conflicts, source-link validation and real archive operations. Browser checks cover draft recovery, failed-save retry, delayed re-transcription during manual editing, restart/archive retention and project-switch isolation. Three native unit checks remain gated. Cross-platform source and expanded installed acceptance remain pending at this checkpoint. Longer-recording workflows and labeled recognition/reproducibility evaluation remain W23 work.

## Fifth-unit verification at the frozen revision

At `dd472e09e0ea72174ac8d269a994cab258e92922`, [Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/38017925198) passes 510 unit tests (477 server/shared/engine/evaluation and 33 client), nine tooling tests, lint/type/build gates, 51 workbench checks and eight public checks per platform. Browser reports contain no unexpected, skipped or flaky cases. All downloaded 12 regression, 60 induction, 336 number and 56 elicitation records replay per platform, with unchanged W19 number summaries. Three native unit cases remain gated.

The [Linux](verification/w23-transcripts-browser-linux.json) and [Windows](verification/w23-transcripts-browser-windows.json) browser records retain saved, re-analyzed and archive-restored projects. They show two draft results becoming three saved results while preserving a manual correction, its dictionary link and its source transcription. Responses are synthetic; storage, browser interaction, retries, restart and archive operations are real. A [Windows capture](verification/w23-transcripts-browser-windows.png) shows generated text separately from manual segments and the explicit copy action.

[Clean installed Windows acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/38017925135) verifies 3,772 application files and eight archive round trips. It recovers a real native transcription in a pending recording after closing and reopening the desktop application, adds a second native result, and retains a manual phone correction and its source link throughout. Both transcriptions identify the exact retained prepared WAV and all six pinned Whisper assets. Archive restore preserves the complete generated histories and manual correction while remapping clip identities. Existing phone cancellation/recovery and automatic/explicit-language transcription provenance checks also pass. The [installed source/restored clips](verification/w23-transcripts-installed.json) and [verification metadata](verification/w23-transcripts-verification.json) preserve these observations.

```sh
npx tsx docs/verification/w23-transcripts-replay.mts
```

Replay validates retained artifact hashes, profile schemas, original fixture bytes, recorded prepared-audio identity, native inventories, archive mappings, immutable history and independent manual copying. It does not rerun inference, reconstruct prepared WAV samples or score recognition accuracy. The original and prepared WAV hashes differ because preparation rewrites the audio container; the installed harness validates each response against the actual prepared bytes during execution. Metadata remains structurally validated rather than a signed execution attestation.

The October 10 UTC CI [full audit](verification/w23-transcripts-audit-all.json) reports zero critical, four high and eight moderate affected-package entries; [production](verification/w23-transcripts-audit-production.json) retains zero critical, four high and three moderate. Both platforms agree, with no dependency or model-byte changes in this unit. Longer recordings, labeled recognition/reproducibility evaluation and the remaining W23 exit conditions remain open. Manual annotations are editable rather than an append-only edit log. No main merge, public installer release or deployment occurred.


## Five-minute phone workflow: sixth implementation unit

Imports and retained prepared recordings now support 25 ms–300 seconds, within the unchanged 32 MiB original-file cap. Microphone capture still stops around 119 seconds, and Whisper still rejects input beyond 120 seconds before launching native work. The Samples panel labels longer recordings explicitly, disables transcription for them and offers **Queue long phone analysis**. Progress and cancellation use the existing Runtime & setup Jobs panel. Jobs are in-memory operations; closing the app or cancelling work does not create a partial retained result.

A long phone job shares the existing single acoustic execution lane and four-entry waiting limit. Its ten-minute total deadline includes time waiting in the queue; short phone and Whisper jobs retain the existing three-minute queue deadline. This is a bounded extension, not a guarantee of five-minute completion or support for arbitrarily long files. One native call at a time still receives at most 144,399 samples, retaining no more than 400 owned frames with 25 context frames per side. At five minutes the input is limited to 4,800,000 samples, the decoder to 15,000 frames and the plan to 43 windows. All global timestamps and generated/manual source links remain recording-relative. The stitched logit array is still retained until global decoding and is bounded at 15,000 × 256 Float32 values (15.36 MB); this is not a measurement of total process memory.

Storage and archive validation inspect WAV sample geometry without allocating a full Float32 decode on the server thread. Browser preparation still decodes the complete recording and mixes/resamples it in a worker; it is not streaming media decoding. Phone request encoding yields between bounded base64 chunks to avoid a synchronous per-byte string build. The original/prepared asset hashes, immutable history rules, and eight-result/4 MiB history cap remain unchanged. A long result may exhaust the history byte budget before eight records; failure is explicit and earlier records remain intact.

Local source checks pass 514 unit tests (480 server/shared/engine/evaluation and 34 client), nine tooling tests, lint/type/build gates. New checks cover exact duration boundaries, Whisper rejection of longer audio, labeled long jobs, full-duration phone frame ownership, byte-preserving storage/restart/archive round trips and yielding base64 encoding. Three native unit checks remain gated. Cross-platform source and extended independent installer acceptance remain pending at this checkpoint. Labeled recognition/reproducibility evaluation remains required before completing W23.


The first five-minute CI attempt at `ff85424` passed Linux but exposed two acceptance-harness limits on Windows. The transcription browser case attempted import before export cleanup released the archive lock (HTTP 429). The clean-installer harness passed a multi-megabyte Buffer through a JSON-only browser request helper, exhausting the automation process heap before a result was written. The helper now sends binary bodies as compact base64 transport values decoded to raw request bytes, supports PUT, and encodes responses in bounded chunks. Two tooling regressions verify exact 9.6 MB POST/PUT round trips plus unchanged JSON/GET behavior. The three audio-history browser cases await export staging cleanup before inspection. No application limit is loosened to hide these failures; rerun verification remains required.
