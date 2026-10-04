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

1. Extend the queued phone windowing below into a separate workflow for recordings beyond the existing 120-second cap, including storage/preparation limits and measured responsiveness. Whisper still uses its existing transcription path. The energy heuristic is not a validated voice-activity model.
2. Store generated analyses separately from manual corrections, linked to exact original/prepared audio and model hashes. Exercise re-analysis, edits, restart and portable archives through the workbench.
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
