# Xenolinguist Voice — Increment 3: Phonetic / IPA ("Decode the sounds")

- **Date:** 2026-06-07
- **Status:** Approved design, ready for implementation plan
- **Branch:** `phonetic/ipa` (off `main`, after the prerequisite below)
- **Cost constraint:** everything free + fully local (no paid APIs, no cloud, no paid signing). Engine: **Transformers.js** (`@huggingface/transformers`, MIT) running a bundled **wav2vec2 eSpeak-phoneme ONNX model** in-process — no Python.

## 0. Where this fits — the voice roadmap

The voice subsystem ships as three independent increments, all free/local:

1. **Increment 1 — TTS ("Hear the language").** ✅ Shipped. Browser `speechSynthesis` + bundled espeak-ng at `POST /api/tts`.
2. **Increment 2 — Real STT (Whisper).** ✅ Shipped. Bundled whisper.cpp at `POST /api/stt`: real-language transcription + language detection + auto-segmentation, with honest "transcription vs phonetic-guess" labeling.
3. **Increment 3 — Phonetic / IPA (the signature)** ← *this spec*. A bundled wav2vec2 phoneme recognizer at `POST /api/ipa`: turns *any* recorded audio into a language-independent IPA/phone string and feeds it to the AI partner. This is the honest answer for genuinely alien/constructed speech, where whisper can only hallucinate real words.

### 0.1 Prerequisite (branch topology)

`phonetic/ipa` branches off a clean `main`. Before implementation: merge `whisper/stt` (PR #4) → `main`, then branch `phonetic/ipa` off the updated `main`. (PR #4 also carries the default-model fix and the demo-language seed.) This is step 0 of the implementation plan, not feature code.

## 1. Goal

Give Xenolinguist a **language-independent phonetic transcription** of recorded audio:

- A wav2vec2 phoneme model emits IPA-like phones for **any** speech regardless of language — so for genuinely alien/constructed audio it produces an *honest* phonetic rendering instead of whisper's plausible-but-wrong words.
- The IPA is **stored on the sample, shown in the UI, and fed to the AI partner**, which today receives only `alien_text` + `english_translation` (no phonetics). Feeding IPA unlocks sound-pattern reasoning — the signature "decode the sounds" workflow.
- It runs **automatically on every recording, in parallel with whisper STT**: whisper answers "what words (if a real language)?", the phone recognizer answers "what sounds?".

## 2. Current state (relevant)

- **AI partner:** local Ollama via `POST /api/ai/chat` (`server/src/services/ai-service.ts`, default model `gemma4:e4b`). Prompts live in `shared/prompts.ts`; `formatSamplesForPrompt` currently feeds the AI only `alien_text` + `english_translation` — **no phonetic data**. `AITask`/`SYSTEM_PROMPTS` enumerate the analysis tasks.
- **Sample model:** `shared/types.ts` `Sample` has `phonetic_notes` (free text, e.g. STT's "Detected: …") but no structured phonetic field from audio.
- **STT pipeline (Increment 2):** client `wav-encode.ts` already decodes recordings to **16 kHz mono WAV** (`blobToWav16k`); `services/stt.ts` POSTs to `/api/stt`; `AudioRecorder`/`SampleInput` run STT automatically on record and store results on the sample.
- **Sidecar pattern:** `config.ts` env getters → service (typed `*UnavailableError`) → route (503 on unavailable) → `app.ts` mount; Electron `main.ts` injects a `process.resourcesPath` path (win32, `existsSync`-guarded); `builder.config.cjs` `extraResources`; `.gitattributes` marks binaries.
- **No audio→IPA exists today.**

## 3. Architecture

Unlike espeak/whisper (spawned external binaries), the phone recognizer runs **in-process** in the Node server via Transformers.js + a bundled local ONNX model (loaded once, reused):

```
recorded blob → client: blobToWav16k (reuse) → 16 kHz mono WAV
  → POST /api/ipa  { audio (base64 wav) }
      → Node server: Transformers.js ASR pipeline (lazy singleton),
        bundled local wav2vec2 eSpeak-phoneme ONNX model, OFFLINE
        (raw-audio normalization + CTC decode + phoneme vocab handled by the pipeline)
      → { ipa: "<space-separated phones / IPA string>" }
  → client: store ipa on the Sample · show IPA badge · include ipa in AI prompts
  (model dir unset / load or inference error → HTTP 503 → IPA degrades gracefully)
```

Run automatically alongside whisper on each recording (two independent calls; neither blocks the other).

## 4. Components

Each is a small, single-purpose unit.

### 4.1 Config — `server/src/config.ts`
- `ipaModelDir(): string | null` — `process.env.IPA_MODEL_DIR` or null (STT-style getter).

### 4.2 Server — `server/src/services/ipa-phones.ts`
- Lazy-loads a Transformers.js `automatic-speech-recognition` pipeline from the local model dir, configured **offline** (`env.allowRemoteModels = false`, `env.localModelPath = <dir>`), cached as a module singleton.
- `transcribePhones({ wav: Buffer }): Promise<{ ipa: string }>` — decode the WAV to the Float32 PCM the pipeline expects, run inference, return the phone/IPA string (trimmed).
- Throws typed `IpaUnavailableError` when the model dir is null, the model fails to load, or inference fails. (Exported; the route maps it to 503.)

### 4.3 Server — `server/src/routes/ipa.ts`
- `POST /api/ipa`, body `{ audio: string (base64 wav) }`. Validate audio present/decodable (else **400**); call the service; **200** `{ ipa }`, **503** `{ error: 'ipa-unavailable' }`, **500** otherwise. Mount in `app.ts`.

### 4.4 Shared — `shared/types.ts`
- Add `ipa: string | null` to `Sample` (the decoded unit). Defaulted `null` for existing/other samples.

### 4.5 Client — `client/src/services/ipa.ts`
- `transcribePhones(blob: Blob): Promise<string | null>` — convert via `blobToWav16k`, base64, `POST /api/ipa`; return `ipa` or **null** on 503/error.

### 4.6 Client — capture wiring (`AudioRecorder.tsx` + `SampleInput.tsx`)
- On record completion, call `ipa.transcribePhones` **in parallel** with the existing whisper STT call (`Promise.all`/independent awaits), forward the `ipa` alongside the existing args, and store it on the pending sample (and persist on save). Mirrors how STT segments/mode are threaded today.

### 4.7 Client — IPA badge (`LanguageDetector.tsx` or a small sibling)
- Render the IPA string near the transcription/phonetic-guess badge (a calm "IPA" chip showing the phones). Always shown when IPA is present (it's valid for any audio).

### 4.8 AI feeding — `shared/prompts.ts` + a new task
- Extend `formatSamplesForPrompt` to include `ipa` when present (e.g. append `[ipa: …]` to each sample line).
- Add a dedicated `phoneticAnalysis` `AITask` + `SYSTEM_PROMPTS.phoneticAnalysis`: instruct the AI to reason about the **phoneme inventory**, recurring phone clusters, and sound→meaning hypotheses from the samples' IPA. Wire it like the existing analysis tasks (a button/flow in the samples view that runs it).

### 4.9 Client — `SampleDecodeView.tsx`
- Display the sample's IPA when present, so it's visible wherever a sample is examined/decoded.

### 4.10 Electron — `electron/main.ts`
- Set `IPA_MODEL_DIR` → `path.join(process.resourcesPath, 'ipa-model')` (win32, `existsSync`-guarded), injected into the forked server env (mirrors `WHISPER_MODEL`).

### 4.11 Packaging — `electron/builder.config.cjs` + `vendor/` + `.gitattributes`
- Vendor the ONNX model + its config/tokenizer/preprocessor files under `vendor/ipa-model/` (exact file set locked by the spike). Add to `extraResources` → `resources/ipa-model/`. Mark `*.onnx` (and any `*.bin` weights) `binary` in `.gitattributes`. **Windows verified now**; mac/linux deferred (graceful 503 meanwhile).

## 5. Engine & backend nuance — feasibility spike (plan Task 1)

The engine direction (ONNX in Node via Transformers.js, no Python) is decided, but two unknowns must be validated **before** the full build, in a timeboxed spike:

1. **Model:** lock an exact wav2vec2 eSpeak/IPA-phoneme ONNX model (e.g. a `Xenova/wav2vec2-lv-60-espeak-cv-ft`-style conversion). Confirm it loads offline in Transformers.js (Node), emits sensible IPA on `server/src/__tests__/fixtures/hello-16k.wav` (and on a gibberish clip), and check the bundled size (target: ship the smallest quantized variant that gives usable phones).
2. **ONNX backend:** decide **native `onnxruntime-node`** (faster, but ships `.node` native binaries → must be esbuild-`external` + `asarUnpack`ed from the forked-server bundle) **vs `onnxruntime-web`/WASM** (slightly slower, pure JS+wasm → far easier to bundle in the esbuild CJS server). **Lean WASM for shipping reliability;** the spike confirms which actually loads inside the packaged Electron-forked server. (This is the same class of bundling risk that made whisper's native spawn awkward under vitest — see §7.)

The spike's output (model files + backend choice) feeds the vendoring (§4.11) and the service config (§4.2).

## 6. Error handling / graceful degradation

| Situation | Behavior |
|---|---|
| Packaged app (win), model present | Real phone recognition → IPA shown + fed to AI. |
| Dev / non-win / `IPA_MODEL_DIR` unset | `/api/ipa` → 503 → IPA hidden / "phonetics available in desktop app"; no crash. |
| Model load or inference failure | `IpaUnavailableError` → 503 → graceful. |
| Audio undecodable / empty | 400; brief UI error, no crash. |

IPA never hard-fails capture; recording + whisper STT continue regardless.

## 7. Testing

- **Server (vitest + supertest):** `config.ipaModelDir()` returns env/null; `POST /api/ipa` → **503** when unset, **400** when no/undecodable audio; a real-inference test **gated behind an explicit opt-in env** (e.g. `IPA_E2E`), because — exactly as with whisper-cli under vitest on Windows — the ONNX runtime (native bindings or wasm load) may not host cleanly in vitest's forked worker. The canonical real check is a standalone **`scripts/verify-ipa.mjs`** (loads the bundled model in plain Node, runs it on the fixture, prints the IPA), documented in `docs/desktop-release.md`.
- **Client (vitest + jsdom):** `ipa.transcribePhones` returns `null` on 503 (mock fetch + mock `blobToWav16k`).
- **Prompt:** `formatSamplesForPrompt` includes the IPA segment when a sample has `ipa`.
- **Manual:** record alien/gibberish → an IPA string appears (honest phones) even though whisper labels it a phonetic guess; run the phonetic-analysis task and confirm the AI reasons over the IPA.

## 8. Scope

**In:** the feasibility spike (§5), `ipaModelDir` config, `ipa-phones` service + `IpaUnavailableError`, `POST /api/ipa` + `app.ts` wiring, `Sample.ipa` type, client `ipa` service, parallel auto-capture wiring, IPA badge, AI feeding (`formatSamplesForPrompt` + `phoneticAnalysis` task), `SampleDecodeView` IPA display, Windows model vendoring + Electron env + `extraResources` + `.gitattributes`, `scripts/verify-ipa.mjs`, the tests above, and the prerequisite merge (§0.1).

**Out (later):** per-phone segmentation (deriving phone timings from CTC to auto-seed the segmenter — deferred stretch); IPA surfacing in the Sandbox (generated conlangs aren't recorded audio); IPA→dictionary linking; macOS/Linux model vendoring (graceful 503 meanwhile).

## 9. Decisions (locked)

- **Engine:** ONNX **in-process in Node** via **Transformers.js** + a bundled wav2vec2 eSpeak-phoneme model (decided over Allosaurus, which would drag in Python/PyTorch and break the clean single-artifact bundling, and over hand-rolled `onnxruntime-node` + manual CTC). Free/local; no Python; signing remains deferred.
- **Capture:** runs **automatically on every recording, in parallel with whisper** (decided over on-demand-only and auto+re-run).
- **Output:** an IPA/phone **string** stored on `Sample.ipa`; audio sent as base64 WAV over `POST /api/ipa`; results JSON.
- **Extras:** dedicated `phoneticAnalysis` AI task **in**; IPA shown in `SampleDecodeView` **in**; per-phone segmentation **deferred**.
- **Fallback:** graceful 503 → IPA features degrade (no crash).
- **Backend (native vs WASM):** decided by the spike (§5); default lean WASM.
- **Branch:** `phonetic/ipa` off `main` after PR #4 merges.

## 10. Risks

- **ONNX runtime in the bundled forked server:** native `onnxruntime-node` ships `.node` binaries that don't survive esbuild bundling (must be `external` + `asarUnpack`); WASM avoids this but must still load its `.wasm` offline. Validated in the spike; this is the increment's primary bundling risk.
- **Model size:** wav2vec2 models are larger than whisper's (~hundreds of MB even quantized) — the installer grows; pick the smallest usable quantized variant.
- **IPA quality / mapping:** eSpeak phoneme output ≈ IPA but isn't a perfect 1:1; it's surfaced honestly as an approximation for the AI to reason about, not ground truth.
- **vitest hosting:** the real-inference path may not run under vitest on Windows (native/wasm load); mitigated by the `IPA_E2E` opt-in gate + the standalone `verify-ipa.mjs` (same approach Increment 2 used for whisper).
- **Latency:** wav2vec2 inference on CPU adds a couple seconds per clip on top of whisper; both run in parallel and show spinners. Not a correctness risk.
