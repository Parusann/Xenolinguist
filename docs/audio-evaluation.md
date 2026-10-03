# Acoustic analysis and evaluation

W23 is in progress. Its first unit adds bounded greedy CTC summaries to the existing phone endpoint. Inference remains in a disposable process in the acoustic queue; cancellation waits for that process to exit. WAV header validation on the server now checks container and sample geometry without allocating a decoded Float32 copy. The inference process performs sample conversion and native processing.

## Current output contract

The compatibility route `/api/ipa` still returns `ipa`, `segments` and model `identity`. It now also returns `audio` and `ctc`. `audio.sha256` identifies the exact submitted PCM WAV bytes, including their container; it is not the hash of the original browser recording if preparation converted that recording. Sample rate, sample count and duration identify the analyzed signal. Model identity retains the verified ONNX digest, alphabet and runtime versions.

`ctc` records greedy decoding, frame/vocabulary counts, blank ID, stride, blank/special frame counts and one score summary per emitted phone run. Each run links to its segment index and gives a start frame and exclusive end frame. Adjacent repetitions of the same class collapse; blanks and special-token runs break repetitions. Bracketed special tokens and empty labels are suppressed from displayed phones, but their frame counts remain explicit. An acoustic label such as TIMIT `h#` is retained; it is not the CTC blank token.

For each frame, the decoder computes stable softmax over the full vocabulary after subtracting the maximum logit. For each emitted run it averages those probabilities across its frames, retains the three largest means with token IDs and labels, and records the remaining probability mass. Ties choose lower token IDs. It also reports the mean frame entropy in bits. These are **uncalibrated acoustic model outputs**, not probabilities that a word, meaning or phone sequence is correct. Averaging probabilities is not softmax of averaged logits; the retained candidates are not a beam search or alternate transcription.

Timings preserve the existing frame-bin convention: frame index multiplied by 20 ms. They are approximate model bins, not measured phonetic boundaries. The pinned model's seven convolution layers imply a 320-sample stride and 400-sample receptive field. The service checks that the output frame count is `floor((samples - 400) / 320) + 1` and that the batch size is one. Receptive-field centers, phonetic boundary adjustment and forced alignment are not implemented.

The decoder rejects non-finite logits, invalid tensor sizes/blank IDs/strides, more than 6,000 frames or more than 256 output classes. Candidate retention is capped at three per run. It never returns a plausible partial transcript from corrupt logits. Input remains mono PCM16 WAV at 16 kHz, 25 ms–120 seconds (400–1,920,000 samples). This is a resource ceiling, not a promise of responsive 120-second inference. Native attention and model allocation are not bounded by the compact decoder output; long-recording chunking remains required.

## Verification and limits

`engine/src/__tests__/ctc.test.ts` checks CTC repeat/blank behavior, independent softmax and entropy arithmetic, frame-probability averaging, tie/offset invariance, extreme finite logits, special/blank-only output, invalid inputs and maximum-sized output accounting. Server cases check sample geometry and duration limits, exact input hashes, shared initialization, corrupt native output and existing input/runtime boundaries.

Run the actual native service with `node scripts/verify-ipa.mjs`. It validates input identity, frame geometry, complete frame accounting, run/segment links, score mass and model identity through an independent acceptance helper. The clean installed-app harness applies the same checks to the actual authenticated endpoint after verifying native cancellation. This tests execution and metadata integrity, not phone recognition accuracy. Raw native logits are not retained, so a saved response alone cannot reproduce the softmax calculation; deterministic numerical correctness is tested using explicit synthetic tensors.

The current UI continues consuming the original phone string and timings. The new summaries are API output, not yet a saved annotation layer or a score viewer. No new persistence claim or preservation of manual corrections across re-analysis is made by this first unit.

## Remaining W23 work

1. Add an explicit queued long-recording workflow with tested resampling, voice activity segmentation and bounded overlapping chunks. Preserve absolute timestamps and reconcile overlaps without deleting legitimate repeated phones. Measure responsiveness and cancellation on long fixtures.
2. Store generated analyses separately from manual corrections, linked to exact original/prepared audio and model hashes. Exercise re-analysis, edits, restart and portable archives through the workbench.
3. Curate a licensed labeled corpus within the current model's English ARPABET domain. Before evaluating it, freeze inventory normalization, silence handling, word/phone edit-distance denominators, alignment tolerance, failure accounting and cold/warm timing procedure. No labeled-corpus accuracy, latency target or calibrated uncertainty is established yet.
4. Consider beam decoding or another phone model only if measured errors justify it and its assets, license, alphabet and Windows runtime are verified. Tone, clicks and wider language coverage remain untested.

See [model provenance and runtime limits](ipa-model-notes.md), [audio lifecycle](audio-lifecycle.md) and [implementation progress](implementation-progress.md). W23 cannot be marked complete until its long-audio, annotation-preservation and labeled-evaluation exit conditions are met.
