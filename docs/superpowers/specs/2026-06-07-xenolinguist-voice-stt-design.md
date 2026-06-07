# Xenolinguist Voice — Increment 2: Local Speech-to-Text (Whisper)

- **Date:** 2026-06-07
- **Status:** Approved design, ready for implementation plan
- **Branch:** `whisper/stt` (off `main`, after the prerequisite merges below)
- **Cost constraint:** everything free + fully local (no paid APIs, no cloud, no paid signing). Engine: **whisper.cpp** (open source, bundled binary) + a bundled quantized multilingual model. Browser Web-Speech is retained only as an optional soft fallback for the live transcript.

## 0. Where this fits — the voice roadmap

The voice subsystem ships as three independent increments, all free/local:

1. **Increment 1 — TTS ("Hear the language").** ✅ Shipped. Browser `speechSynthesis` + a bundled espeak-ng sidecar at `POST /api/tts`. Established the **Electron sidecar-binary bundling pattern** this increment reuses.
2. **Increment 2 — Real STT (Whisper)** ← *this spec*. A bundled `whisper.cpp` sidecar at `POST /api/stt`: replaces the flaky Web-Speech language detector, transcribes recorded/uploaded samples, detects language, auto-segments via timestamps, and links transcripts to the dictionary. Honest about its limits on non-human audio.
3. **Increment 3 — Phonetic / IPA (the signature).** Allosaurus (or ONNX) for language-independent IPA transcription, fed to the AI partner. The true answer for genuinely alien/constructed audio. *(Future spec.)*

### 0.1 Prerequisite (branch topology)

Increment 2 branches off a clean `main`. Before implementation:

1. Merge `desktop/electron` → `main`.
2. Merge `voice/tts` (PR #2) → `main`.
3. Branch `whisper/stt` off the updated `main`.

This is step 0 of the implementation plan, not part of the feature code.

## 1. Goal

Give Xenolinguist a **robust, offline, deterministic** speech-to-text capability:

- **Replace** the unreliable Web-Speech `useLanguageDetection` (which loops over 6 locales and frequently returns nothing) with a single bundled whisper.cpp pass that returns a transcript, a detected language, per-segment timestamps, and confidence signals.
- **Be honest about scope.** Whisper transcribes *real human languages*. On genuinely alien/constructed audio it hallucinates plausible-sounding text. So results are surfaced in one of two **modes**: a confident **transcription** (real language detected) or a clearly-labeled, low-confidence **phonetic guess** (still handed to the AI partner as an approximation, never presented as fact). Language-independent IPA is Increment 3.
- **Do useful work with the output:** auto-seed word/segment boundaries into the segmenter, and offer to link recognized tokens to the dictionary.

## 2. Current state (relevant)

- **Desktop app (Electron):** `electron/main.ts` forks the Express server (`server.cjs`) and injects env (`DATA_DIR`, `CLIENT_DIST`, `PORT`, and — for TTS — `ESPEAK_PATH` pointing at a `process.resourcesPath` binary guarded by `existsSync`, win32-only). `builder.config.cjs` vendors binaries via `extraResources`. `.gitattributes` marks vendored binaries `binary` to avoid CRLF corruption.
- **Sidecar pattern (from Increment 1):** `config.ts` exposes env-driven getters (e.g. `espeakPath()`); `services/tts-espeak.ts` spawns the binary, manages I/O, and throws a typed `TtsUnavailableError`; `routes/tts.ts` maps that error to **503**; `app.ts` mounts the router. Note: this espeak build needs `--path <dir-of-binary>` to find its data dir — whisper.cpp similarly needs its DLLs and model alongside the binary.
- **Audio capture:** `client/src/components/audio/AudioRecorder.tsx` records `audio/webm;codecs=opus` via `MediaRecorder`, extracts waveform peaks via `AudioContext`, runs the flaky `useLanguageDetection`, and shows a live Web-Speech transcript. On completion it returns `(blob, peaks, duration, detectedLanguage?)`.
- **Capture surface:** `client/src/components/phase1-samples/SampleInput.tsx` hosts the recorder, stores the blob (base64) via `POST /api/audio/upload`, and creates a `Sample` with an `audio_id`. It pre-fills phonetic notes with `Detected: <language>`.
- **`client/src/components/audio/AudioSegmenter.tsx`** (manual word-boundary marker with per-segment timestamps + labels) exists but is **not currently wired into any page** — surfacing it is part of "auto-segment."
- **`LanguageDetector.tsx`** also has an AI fallback that posts to `/api/ai/chat`.
- **No STT (server-side) exists today.**

## 3. Architecture

```
recorded / uploaded blob (audio/webm;codecs=opus)
  → client: AudioContext.decodeAudioData → downsample to 16 kHz mono → encode WAV (PCM s16le)
  → POST /api/stt  { audio: <base64 wav>, language? }
        → Express (inside Electron's forked server)
        → write temp .wav → spawn whisper.cpp (-m <base-q5 model> -oj -of <tmp>) → read JSON
        → parse → { language, languageProb, text, segments:[{start,end,text,avgLogprob,noSpeechProb}], mode }
  → client:
        · LanguageBadge (language + confidence + mode tag)
        · auto-seed AudioSegmenter boundaries/labels from segments
        · dictionary-link affordances on recognized tokens
  (binary/model missing | dev | spawn error → HTTP 503 → STT features degrade gracefully)
```

Single origin (the localhost server serves both the SPA and `/api`), so the client uses a relative `/api/stt` with no CORS concern.

**Why client-side WAV conversion:** whisper.cpp expects 16 kHz mono PCM WAV. The recorder produces webm/opus. Converting in the browser (the client already decodes audio for peaks) avoids vendoring **ffmpeg** as a second binary and keeps the sidecar deterministic.

## 4. Components

Each is a small, single-purpose unit.

### 4.1 Config — `server/src/config.ts`
- `whisperBinPath(): string | null` — `process.env.WHISPER_BIN` or null.
- `whisperModelPath(): string | null` — `process.env.WHISPER_MODEL` or null.
- (Same shape/intent as `espeakPath()`. In dev both are typically null → `/api/stt` returns 503.)

### 4.2 Server — `server/src/services/stt-whisper.ts`
- `transcribe({ wav: Buffer, language?: string }): Promise<SttResult>` — resolves the whisper binary + model from config; if either is null → reject with `SttUnavailableError`.
- Writes the WAV to a temp file (under the OS temp dir), spawns whisper.cpp with JSON output (`-m <model> -f <tmp.wav> -oj -of <tmp>` plus `-l auto` for language auto-detect, `-l <language>` when provided), waits for exit, reads the produced `<tmp>.json`, and cleans up temp files in a `finally`.
- Parses whisper JSON into `SttResult`:
  - `language: string`, `languageProb: number`
  - `text: string`
  - `segments: { start: number; end: number; text: string; avgLogprob: number; noSpeechProb: number }[]`
  - `mode: 'transcription' | 'phonetic-guess'` (computed — see §6).
- Spawn `error` (ENOENT) / non-zero exit / missing JSON → `SttUnavailableError`.
- `SttUnavailableError` — exported; the route maps it to 503.

### 4.3 Server — `server/src/routes/stt.ts`
- `POST /api/stt`, body `{ audio?: string (base64 wav); language?: string }`.
- Validates audio present and decodable (else **400**).
- Calls the service; responds **200** `application/json` with `SttResult`, **503** `{ error: 'stt-unavailable' }` when whisper isn't available, **500** `{ error: 'stt-failed' }` otherwise.

### 4.4 Wiring — `server/src/app.ts`
- Mount the `/api/stt` router alongside the existing routers.

### 4.5 Client — `client/src/components/audio/wav-encode.ts`
- `blobToWav16k(blob: Blob): Promise<Blob>` — decode via `AudioContext`, downsample/mix to **16 kHz mono**, encode a PCM s16le WAV. Pure, unit-testable (also accepts an `AudioBuffer` for tests).

### 4.6 Client — `client/src/services/stt.ts`
- `transcribe(blob: Blob, opts?: { language?: string }): Promise<SttResult | null>` — convert via `blobToWav16k`, base64-encode, `POST /api/stt`; return the parsed `SttResult`, or **null** on 503/network error (caller treats null as "STT unavailable").
- Shared `SttResult` type (place in `shared/types` so client + server agree).

### 4.7 Client — `LanguageDetector.tsx` (swap internals, keep hook API)
- `useLanguageDetection` keeps its public shape (`{ detect, detecting, result, reset }`) so `AudioRecorder` needs minimal change, but `detect(blob)` now calls `services/stt.transcribe` instead of the 6-locale Web-Speech loop.
- `DetectionResult` gains `mode` and optional `segments`. `LanguageBadge` renders the detected language, a confidence %, and a **mode tag**: a calm "transcription" chip for confident real-language results, or a clearly-styled "phonetic guess · low confidence" chip otherwise.
- The old AI-`/api/ai/chat` language-ID fallback is removed (whisper detects language directly). The Web-Speech live transcript in `AudioRecorder` is kept only as an optional soft fallback for live feedback during recording.

### 4.8 Client — auto-segment (`SampleInput.tsx` + `AudioSegmenter.tsx`)
- After `transcribe` returns, pass `segments` into `AudioSegmenter` (now surfaced in the capture/sample flow) so word/segment boundaries and labels are **pre-seeded** from whisper timestamps; the user can still edit/mark manually. Segments persist on the audio clip (the clip model already carries `segments`).

### 4.9 Client — dictionary linking
- In the segment list (and/or `SampleDecodeView`), each recognized token offers: match against the existing dictionary (highlight known words) and a one-click **"add to dictionary"** affordance (reusing `addDictionaryEntry`). Only offered in **transcription** mode (suppressed for phonetic guesses to avoid polluting the dictionary with hallucinations).

### 4.10 Client — re-transcribe saved samples
- A button on stored audio samples (in `SampleInput`'s list, or the decode view) fetches the stored clip and re-runs `transcribe` on demand — not just at record time.

### 4.11 Electron — `electron/main.ts`
- When forking the server, add `WHISPER_BIN` and `WHISPER_MODEL` to its env, pointing at the bundled binary + model under `process.resourcesPath` (e.g. `resources/whisper/whisper-cli.exe` and `resources/whisper/ggml-base-q5_1.bin`), win32-only, each guarded by `existsSync` (mirrors the `ESPEAK_PATH` pattern).

### 4.12 Packaging — `electron/builder.config.cjs` + `vendor/` + `.gitattributes`
- Vendor whisper.cpp under `vendor/whisper/win/`: the **binary, its required DLLs**, and the **`.bin` model** (a quantized multilingual `ggml-base-q5_1`, ~57 MB).
- Add to `extraResources` so it lands in `resources/whisper/` in the packaged app.
- Add `*.dll` and `*.bin` to `.gitattributes` as `binary` (alongside the existing exe rules).
- **Windows vendored + verified now.** macOS/Linux whisper vendoring is a documented follow-up; STT features degrade gracefully (503) on those platforms meanwhile.

## 5. Error handling / graceful degradation

| Situation | Behavior |
|---|---|
| Packaged app (win), whisper + model present | Real whisper STT (transcription or phonetic-guess by confidence). |
| Dev (no Electron), `WHISPER_*` unset | `/api/stt` → 503 → client shows "transcription available in desktop app"; optional Web-Speech live transcript; no crash. |
| Non-Windows packaged build | `WHISPER_*` unset (not yet vendored) → 503 → graceful, same as dev. |
| whisper binary/model missing or broken | `SttUnavailableError` → 503 → graceful degradation. |
| Low-confidence / alien audio | Result returned in **phonetic-guess** mode, clearly labeled; dictionary-linking suppressed. |
| Audio undecodable / empty | 400; UI shows a brief error, no crash. |

STT never hard-fails the capture flow; recording/upload still works without it.

## 6. The honesty nuance (transcription vs phonetic guess)

Whisper's value here is being **bundled, offline, deterministic, and multilingual** — far more reliable than the Web-Speech detector for real-language audio. But it cannot transcribe constructed/alien speech; it will *hallucinate*. We surface this honestly via a computed `mode`:

- **transcription** — emitted when whisper's **language-detection probability** is high AND the average segment `avgLogprob` is above a threshold AND `noSpeechProb` is low. Detected language is shown; dictionary-linking is offered.
- **phonetic-guess** — otherwise. Clearly labeled "phonetic guess · low confidence," visually de-emphasized, and passed to the AI partner explicitly as an *approximation to reason about*, never as ground truth. Dictionary-linking is suppressed.

Thresholds (language prob, avgLogprob, noSpeechProb) are defined as named constants with documented defaults and are **tunable** — the increment ships with sensible defaults rather than perfect calibration. This mirrors Increment 1's "faithful nuance": ship the honest baseline, refine later.

## 7. Testing

- **Server (vitest + supertest):**
  - `config.whisperBinPath()` / `whisperModelPath()` return the env value, else null.
  - `POST /api/stt` returns **503** when either getter is null.
  - `POST /api/stt` returns **400** when no/undecodable audio is provided.
  - Real-transcription test (returns JSON with `text` + `language`, non-empty) **gated on whisper availability** (skipped when binary/model absent, so CI without whisper stays green) — same gating approach as the espeak real-synth test.
  - `mode` computation unit-tested with fixture logprob/probability inputs (high → transcription, low → phonetic-guess).
- **Client (vitest + jsdom):**
  - `wav-encode.blobToWav16k` (via an `AudioBuffer` fixture) produces a 16 kHz mono PCM WAV with a valid RIFF header and expected sample count.
  - `stt.transcribe` returns `null` when `fetch('/api/stt')` resolves 503.
  - `LanguageBadge` renders the language, confidence, and the correct mode tag for both modes.
- **Manual:** record clear English → confident transcription + language + dictionary-link affordances; record gibberish/alien → "phonetic guess" label, linking suppressed; confirm `AudioSegmenter` is seeded from whisper segments; re-transcribe a saved sample.

## 8. Scope

**In:** client WAV conversion (`wav-encode`), client `stt` service, `whisperBinPath`/`whisperModelPath` config, `stt-whisper` service + `SttUnavailableError`, `POST /api/stt` route + `app.ts` wiring, replacing the flaky `useLanguageDetection` internals (hook API preserved), confidence→mode labeling, auto-segment wiring (surfacing `AudioSegmenter`, seeding from timestamps), dictionary linking (transcription mode only), re-transcribe saved samples, Windows whisper.cpp vendoring (binary + DLLs + `ggml-base-q5_1` model), Electron env wiring + `extraResources` + `.gitattributes`, the tests above, and the prerequisite branch merges (§0.1).

**Out (later):** macOS/Linux whisper vendoring (added at those builds; graceful 503 meanwhile); streaming/live whisper transcription; word-level (vs segment-level) timestamp refinement; threshold re-calibration UI; Increment 3 (Allosaurus phonetic/IPA — the real alien-audio answer).

## 9. Decisions (locked)

- **Engine:** bundled **whisper.cpp** + a vendored quantized multilingual **`ggml-base-q5_1`** model (~57 MB). Free/local; no paid services; signing remains deferred.
- **Purpose:** real-language transcription + language detection + auto-segmentation, **plus** a clearly-labeled low-confidence **phonetic-guess** path for non-human audio (decided over "real-language only" and "minimal detector swap").
- **Delivery:** model **bundled in the installer** (decided over download-on-first-run) — works fully offline on first launch, consistent with Increment 1.
- **Architecture:** per-request whisper.cpp **spawn** inside the Electron-forked server (decided over a long-lived whisper server and over a WASM-in-renderer build) — maximal reuse of the espeak sidecar pattern.
- **Audio:** client converts to **16 kHz mono WAV** (no ffmpeg vendored); audio sent as base64 over `POST /api/stt`; results returned as JSON.
- **Extras:** auto-segment, dictionary linking, and re-transcribe-saved-samples are all **in**.
- **Fallback:** graceful 503 → STT features degrade (no crash); Web-Speech retained only as an optional live-transcript soft fallback.
- **Branch:** `whisper/stt` off `main` after merging `desktop/electron` then `voice/tts` to `main`.

## 10. Risks

- **whisper.cpp Windows runtime deps:** the prebuilt binary needs its DLLs (and the model) vendored alongside it — vendor the whole directory, not just the exe, or transcription fails (directly analogous to espeak needing its `espeak-ng-data/`).
- **Model in git (~57 MB):** mark `*.bin` as `binary` in `.gitattributes`; accept the repo-size cost (consistent with bundling espeak data). Revisit Git LFS only if it becomes painful.
- **Hallucination on alien audio:** mitigated by the phonetic-guess mode + tunable thresholds, but thresholds ship as documented defaults, not perfectly calibrated.
- **webm → 16 kHz mono WAV conversion:** sample-rate/channel handling is fiddly; unit-tested against a known buffer.
- **CPU latency:** base model on CPU takes a few seconds for short clips; show a spinner and keep clips short. Not a correctness risk.
- **Cross-platform:** only Windows is vendored/verified now; mac/linux fall back to 503 until their builds happen.
