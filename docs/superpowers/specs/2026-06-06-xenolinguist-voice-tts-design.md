# Xenolinguist Voice — Increment 1: Local Text-to-Speech ("Hear the language")

- **Date:** 2026-06-06
- **Status:** Approved design, ready for implementation plan
- **Branch:** `voice/tts` (off `desktop/electron`)
- **Cost constraint:** everything free + fully local (no paid APIs, no cloud). Engines: browser `speechSynthesis` (built-in) + **espeak-ng** (open source, bundled binary).

## 0. Where this fits — the voice roadmap

The full voice subsystem is split into three independently-shippable increments, all free/local:

1. **Increment 1 — "Hear the language" (TTS)** ← *this spec*. Browser `speechSynthesis` + a bundled espeak-ng sidecar. Establishes the Electron **sidecar-binary bundling pattern** the next increments reuse.
2. **Increment 2 — Real STT (Whisper).** Bundled `whisper.cpp`; replaces the flaky Web-Speech detector, transcribes recorded samples, auto-segments. *(Future spec.)*
3. **Increment 3 — Phonetic / IPA (the signature).** Allosaurus (or ONNX) for language-independent IPA transcription, fed to the AI partner. *(Future spec.)*

## 1. Goal

Let the user **hear** an unknown/constructed language: play any decoded word, sentence, or sandbox conlang line as audio. Two paths: an instant zero-dependency browser voice, and a **bundled, deterministic** espeak-ng voice (same robotic, alien-appropriate sound on every machine), with automatic fallback so playback always works.

## 2. Current state (relevant)

- **Desktop app (Electron):** the main process forks the Express server (`electron/dist/server.cjs`) and sets env (`DATA_DIR`, `CLIENT_DIST`, `PORT`); it already bundles a resource (`client/dist`) via `extraResources` and has a clean seam for managing bundled binaries.
- **Server:** `createApp()` mounts `/api/*` routers; `config.ts` exposes env-driven getters; routes return typed errors handled by `middleware/error-handler.ts`.
- **Client:** React 19 + Vite; calls relative `/api`; audio components live in `client/src/components/audio/`. The Sandbox conlang object includes a `phoneme_set` and per-word/sentence text.
- **No TTS exists today.**

## 3. Architecture

```
decoded word / sentence / conlang text
  ├─ quick    → client window.speechSynthesis (A1)      [instant, offline, OS voices]
  └─ faithful → POST /api/tts {text|phonemes, voice?}
                  → Express (inside Electron's forked server)
                  → spawn bundled espeak-ng → WAV bytes (A2)
                  → client plays the returned audio
                (espeak-ng missing / dev / error → HTTP 503 → client auto-falls back to A1)
```

Single origin (the localhost server serves both the SPA and `/api`), so the client uses a relative `/api/tts` with no CORS concern.

## 4. Components

Each is a small, single-purpose unit.

### 4.1 Client — `client/src/services/tts.ts`
- `speak(text: string, opts?: { phonemes?: string; rate?: number }): Promise<void>` — tries **faithful** first (`POST /api/tts`, play the returned WAV via an `Audio` element/`URL.createObjectURL`); on non-OK (e.g. 503) or network error, falls back to `speakBrowser`.
- `speakBrowser(text, opts?)` — wraps `window.speechSynthesis` (cancel any current utterance, speak).
- `cancel()` — stop both browser utterance and any playing WAV.
- No module-level state beyond a single "currently playing" handle.

### 4.2 Client — `client/src/components/audio/SpeakButton.tsx`
- Reusable speaker-icon button. Props: `text: string`, `phonemes?: string`, `title?: string`, `className?: string`.
- States: idle → playing (spinner/active icon) → idle; calls `tts.speak`/`tts.cancel`.
- Dropped into:
  - **Vocabulary** (dictionary entries) — hear the alien word.
  - **Translation** engine — hear an alien token and/or the full sentence.
  - **Sandbox** — hear conlang words and sample sentences (passes `phonemes` from `phoneme_set` when available).

### 4.3 Server — `server/src/routes/tts.ts`
- `POST /api/tts`, body `{ text?: string; phonemes?: string; voice?: string }`.
- Validates: at least one of `text`/`phonemes` present (else 400).
- Calls the espeak service; responds `200 audio/wav` with the bytes, or **`503 { error: 'tts-unavailable' }`** when espeak isn't available (surfaced via the typed error below).

### 4.4 Server — `server/src/services/tts-espeak.ts`
- `synthesize({ text?, phonemes?, voice? }): Promise<Buffer>` — resolves the espeak-ng binary path from config; spawns it to render WAV to stdout (or a temp file) and returns the bytes.
  - Text input: `espeak-ng -v <voice> --stdout "<text>"`.
  - Phoneme input (stretch): espeak-ng Kirshenbaum `[[...]]` notation; an IPA→Kirshenbaum mapping converts `phonemes` first. If conversion isn't implemented, fall back to treating input as text.
  - If the binary path is null or the spawn fails (ENOENT/non-zero exit) → throw a typed `TtsUnavailableError`.
- `TtsUnavailableError` — exported; the route maps it to 503.

### 4.5 Config — `server/src/config.ts`
- Add `espeakPath(): string | null` — returns `process.env.ESPEAK_PATH` if set; in dev, optionally probe PATH for `espeak-ng`; else `null`.

### 4.6 Electron — `electron/main.ts`
- When forking the server, add `ESPEAK_PATH` to its env, pointing at the bundled binary under `process.resourcesPath` (e.g. `resources/espeak-ng/espeak-ng.exe`), and set espeak's data dir if required.

### 4.7 Packaging — `electron/builder.config.cjs` + `vendor/`
- Vendor espeak-ng (the **binary plus its `espeak-ng-data/` directory**) under `vendor/espeak-ng/<platform>/`.
- Add it to `extraResources` so it lands in `resources/espeak-ng/` in the packaged app.
- **Windows is vendored + verified now** (the app currently builds on Windows). macOS/Linux espeak vendoring is a documented follow-up, added when those platform builds happen; browser-TTS fallback covers them meanwhile.

### 4.8 Wiring
- `server/src/app.ts` mounts the `/api/tts` router.

## 5. Error handling / graceful degradation

| Situation | Behavior |
|---|---|
| Packaged app, espeak present | Faithful espeak-ng voice. |
| Dev (no Electron), `ESPEAK_PATH` unset | `/api/tts` → 503 → client uses browser TTS. |
| espeak binary missing/broken | `TtsUnavailableError` → 503 → browser TTS fallback. |
| Browser has no `speechSynthesis` voice | Button shows a brief "no voice available" state; no crash. |

Playback never hard-fails; the user always gets *some* audio where a voice exists.

## 6. The "faithful" nuance (scoped honestly)

espeak-ng's value here is being **bundled, deterministic, and tunable** — identical robotic/alien voice on every machine, unlike OS `speechSynthesis` voices that vary. Baseline faithful mode voices the alien **text** with a fixed espeak voice. **Phoneme-exact IPA voicing** of the `phoneme_set` (via IPA→Kirshenbaum) is a **stretch** within this increment; if not completed it degrades to text voicing. Browser TTS (A1) remains the universal fallback.

## 7. Testing

- **Server (vitest):**
  - `config.espeakPath()` returns the `ESPEAK_PATH` value, else null.
  - `POST /api/tts` returns **503** when `espeakPath()` is null (supertest).
  - `POST /api/tts` returns **400** when neither `text` nor `phonemes` is provided.
  - Real-synthesis test (returns `audio/wav`, non-empty body) **gated on espeak availability** (skipped when the binary isn't present, so CI without espeak stays green).
- **Client (vitest + jsdom):**
  - `tts.speak` falls back to `speakBrowser` when `fetch('/api/tts')` resolves 503 (mock `fetch` + mock `window.speechSynthesis`).
  - `speakBrowser` calls `speechSynthesis.speak` with the given text.
- **Manual:** click a `SpeakButton` on a dictionary word → hear audio (faithful if espeak bundled, else browser).

## 8. Scope

**In:** browser TTS service, espeak-ng sidecar + `/api/tts`, `SpeakButton`, integration in Vocabulary + Translation + Sandbox, graceful fallback, Windows espeak-ng vendoring, tests above.

**Out (later):** macOS/Linux espeak vendoring (added at those builds), phoneme-exact IPA input refinement, a voice/rate settings UI, Increment 2 (Whisper STT), Increment 3 (phonetic IPA).

## 9. Decisions (locked)

- Engines: browser `speechSynthesis` (baseline) + **espeak-ng** (bundled, faithful). Both free/local. No paid services; signing remains deferred.
- espeak-ng runs as a **server-spawned process** inside the Electron-forked server (reusing the desktop architecture), exposed at `POST /api/tts`.
- Audio returned as **WAV bytes** over `/api/tts`; client plays via an `Audio`/object URL.
- Graceful fallback to browser TTS whenever espeak is unavailable.

## 10. Risks

- **Cross-platform espeak binaries:** vendoring/verifying mac/linux builds is deferred; only Windows is covered now (fallback covers the rest).
- **espeak data files:** espeak-ng needs its `espeak-ng-data/` alongside the binary — vendor the whole dir, not just the exe, or synthesis fails.
- **IPA→Kirshenbaum** mapping for phoneme-exact voicing is fiddly; kept as a stretch so the increment ships on text voicing regardless.
