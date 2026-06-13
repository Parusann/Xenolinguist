# Xenolinguist — Feature Reference

> A fully-local, AI-powered **language-decoding workbench**: capture samples of an unknown, alien, or constructed language and progressively decode its numbers, vocabulary, grammar, and meaning with the help of a local LLM, audio playback, speech-to-text, and phonetic transcription. Everything runs offline on your machine — no cloud APIs.

This document describes every feature in the app, how it works, and where it lives in the code. File references use `path:line` against the repository root.

---

## 1. Overview

Xenolinguist is an **Electron desktop application** structured as an npm-workspace monorepo:

| Workspace | Role | Stack |
|-----------|------|-------|
| `client` | The UI — React SPA | React 19, Vite, React Router, Tailwind-style CSS |
| `server` | Local HTTP API | Express, forked by Electron onto a free loopback port |
| `shared` | Cross-cutting code | TypeScript types, constants, AI prompts |
| `electron` | Desktop shell | Electron main/preload, esbuild bundler, electron-builder |

The user works through a **profile** (one decoded language) across six sequential *phases* plus a *Sandbox* practice mode, assisted by a local **Ollama** model and a **voice subsystem** (text-to-speech, speech-to-text, and phonetic/IPA recognition).

### Design principles
- **Local-first / offline.** All persistence is local files under a per-user data directory; all AI is local Ollama; all voice processing uses bundled binaries/models. No data leaves the machine.
- **Honest AI.** Speech transcription is gated and clearly labelled "transcription" vs "phonetic guess" so hallucinated text on alien audio is never presented as fact. LLM analysis is advisory and labelled as such.
- **Graceful degradation.** Platform-specific voice binaries (espeak-ng, whisper.cpp, the IPA model) are Windows-only today; on other platforms or in dev those endpoints return HTTP 503 and the UI silently falls back (e.g. browser speech synthesis) — this is intentional, not a failure.

---

## 2. Architecture & Data Flow

```
 ┌────────────────────────────── Electron main process (electron/main.ts) ──────────────────────────────┐
 │  • Hardened BrowserWindow (contextIsolation on, nodeIntegration off, minimal preload bridge)          │
 │  • Production: forks the bundled Express server as a utilityProcess on PORT=0 (OS-assigned loopback)  │
 │     – injects DATA_DIR, CLIENT_DIST, NODE_ENV, and Windows-only ESPEAK_PATH/WHISPER_*/IPA_MODEL_DIR    │
 │     – server posts its bound port back over the IPC channel; main loads http://127.0.0.1:<port>       │
 │  • Probes local Ollama; auto-pulls the default model with streamed progress; single-instance lock     │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────┘
        │ HTTP (same loopback origin in prod; Vite proxy in dev)
        ▼
 Express API (server/src/app.ts)  →  /api/{health,ollama,profiles,ai,audio,tts,stt,ipa}
        │
        ├─ ai-service → local Ollama (chat / streaming)
        ├─ profile-store → <DATA_DIR>/profiles/<id>.json  + profiles.json index
        ├─ audio route → <DATA_DIR>/audio/<id>.{webm,wav}
        ├─ tts → bundled espeak-ng (spawn) → WAV bytes
        ├─ stt → bundled whisper.cpp (spawn) → JSON transcript + segments
        └─ ipa → in-process Transformers.js wav2vec2 CTC → phones + per-phone timing
```

In **dev**, the client (Vite, :5173) and server (tsx watcher, :3001) run separately and Vite proxies `/api`. In the **packaged app** the server is forked and serves both the API and the built SPA from one origin, so the client uses a relative `/api` base in both modes (`client/src/services/api.ts:1`).

---

## 3. Data Model (`shared/types.ts`)

The central entity is **`LanguageProfile`** (`shared/types.ts:55`), which aggregates everything known about one language. Defaults come from `createDefaultProfile()` (`shared/constants.ts`).

| Type | Key fields | Notes |
|------|-----------|-------|
| `LanguageProfile` | `id, name, description, phonetic_notes, is_sandbox, sandbox_difficulty?, dictionary[], grammar_rules[], number_system, samples[], audio_clips[], created_at, updated_at` | One JSON file per profile |
| `DictionaryEntry` | `alien_word, english_meaning, part_of_speech, confidence (0–100), context, examples[], notes` | Confidence buckets: ≥76 confirmed, ≥41 probable, else unknown |
| `GrammarRule` | `rule, evidence[], confidence` | |
| `NumberSystem` | `base \| null, mappings: Record<number,string>, operators: Record<string,string>` | JSON keys persist as strings — coerce on read |
| `Sample` | `alien_text, english_translation \| null, source, phonetic_notes, decoded, audio_id \| null, ipa?` | `ipa` carries the joined phone string |
| `AudioClip` | `filename, duration, waveform: number[], segments: AudioSegment[]` | Visualization peaks pre-extracted |
| `AudioSegment` | `start, end (seconds), label, dictionary_entry_id \| null` | Links audio time-spans to words |
| `SttResult` | `language, languageProb, text, segments[], mode` | `mode` ∈ `transcription \| phonetic-guess` |
| `IpaResult` | `ipa, segments[]` | Per-phone `{phone, start, end}` |

`PartOfSpeech`, `LogEntryType`, `SandboxDifficulty`, and `AITask` are the supporting enums.

---

## 4. Application Shell & Navigation

| Feature | What it does | Where |
|---------|--------------|-------|
| **Routing & provider shell** | `/` → marketing `HeroPage`; `/app` → `Workbench`; `*` → redirect `/`. `Workbench` nests `SessionLog → Ollama → Profile` providers and swaps between `LandingScreen` and `AppShell` based on whether a profile is loaded. | `client/src/main.tsx:9`, `App.tsx:12` |
| **Workbench shell & phase nav** | Header breadcrumb + status pills, hover-expanding sidebar, phase content area, and overlays. Sandbox profiles prepend a Sandbox phase to the six standard phases. Active phase is in-memory state. | `components/layout/AppShell.tsx:37` |
| **Sidebar** | Hover-expanding left rail with phase glyphs, number-key hints, a back-to-profiles brand mark (keyboard-activatable), and a command-palette launcher. | `components/layout/Sidebar.tsx` |
| **Status bar** | Bottom bar: Ollama connection dot, decode %, confidence counts, a "Saving" pulse (debounced PUT in flight), and toggles for the session log / shortcuts. Purely presentational. | `components/layout/StatusBar.tsx` |
| **Command palette** | `Ctrl/Cmd+K` launcher: navigate phases, run tools (AI chat, tour, shortcuts), and jump to dictionary words / samples / grammar rules / number mappings. | `components/layout/CommandPalette.tsx` |
| **Session log** | Bottom slide-up panel of timestamped events (info/ai/success/error/warning), newest-first, with clear/close. Populated app-wide via `useSessionLog().addEntry`. | `components/layout/SessionLog.tsx` |
| **Keyboard shortcuts + help** | Registered shortcuts (`useKeyboardShortcuts`) and a grouped modal listing them (`Shift+?`), dismissible by Escape / outside-click. | `hooks/useKeyboardShortcuts.ts`, `components/layout/ShortcutsHelp.tsx` |
| **Onboarding tour** | First-run guided tour with SVG-mask cutouts highlighting each sidebar phase; completion stored in `localStorage`; restartable via the command palette. | `components/layout/OnboardingTour.tsx` |
| **Toasts** | Bottom-right transient notifications with a draining progress bar and manual dismiss. | `components/layout/ToastContainer.tsx` |
| **Context menu** | Reusable edge-aware right-click menu (danger/disabled styling, icons, shortcut labels), consumed by phase components. | `components/layout/ContextMenu.tsx` |

---

## 5. Landing, Profiles & the Demo Language

| Feature | What it does | API / Where |
|---------|--------------|-------------|
| **Profile selector (Landing)** | Lists saved profiles sorted by recency, each with live word count and decode %, plus New Language / Sandbox CTAs and a "Load demo language (Eridian)" button. Animated Vanta + particle backdrop. | `GET /api/profiles`, `GET /api/profiles/:id` — `components/landing/LandingScreen.tsx:158` |
| **Profile setup form** | Create a new language or sandbox challenge (name, description, phonetic notes). On success the workbench swaps in `AppShell`. | `POST /api/profiles` — `components/landing/ProfileSetup.tsx` |
| **Profile CRUD** | Full document persistence: list, read, create, update (full-document PUT), delete. Each profile is a pretty-printed JSON file; a lightweight `profiles.json` index holds `{id,name,created_at,updated_at}` for the list. | `GET/POST/PUT/DELETE /api/profiles[/:id]` — `routes/profiles.ts`, `services/profile-store.ts` |
| **Demo language "Eridian"** | One-click pre-seeded, internally-consistent partially-decoded language (base-8 numbers, SOV grammar, 20 dictionary entries, 5 rules, 8 samples) so users can explore the workflow without starting from zero. | `POST /api/profiles/demo` — `shared/demo-language.ts`, `routes/profiles.ts:14` |

Persistence lives under `DATA_DIR` (`<repo>/server/data` in dev; an Electron-supplied user-data path in production). The active profile is held in memory by `ProfileProvider`; every mutation triggers a **500 ms-debounced full-profile PUT** (`stores/profile-context.tsx:51`). The store writes **atomically** (temp file + rename), **serializes** all `profiles.json` index mutations through an in-process lock, validates/normalizes incoming bodies (`pickProfileData`), and **cascades audio-blob cleanup** when a profile is deleted.

---

## 6. The Decoding Workflow (Phases 01–06)

Each phase is a React component backed by the `useProfile` store and the `useAI` hook (which always streams from Ollama via `POST /api/ai/stream`).

### Phase 01 — Samples (`components/phase1-samples/`)
The capture surface. `SampleInput.tsx` is a large two-pane component (a known refactor candidate) that owns:
- **Sample capture form** — raw alien text, optional English translation ("Parallel mode"), source tag, phonetic notes. Audio-only samples fall back to `[audio sample]` text.
- **Audio recording** — `MediaRecorder` capture with a live waveform and (Chromium-only) live interim transcript; on stop it runs Whisper STT + IPA in parallel.
- **Audio file upload** — attach an existing file; peaks are extracted for visualization (not auto-transcribed until the Re-transcribe action).
- **Pending-audio preview, segmentation & dictionary linking** — a compact player plus an interactive word-boundary `AudioSegmenter` seeded from STT segments; in transcription mode, per-segment "Link to dictionary" buttons.
- **AI auto-decode + quick-suggest** — `patternAnalysis` over the whole dictionary+samples on demand, and a debounced `quickSuggest` after each text sample is added.
- **Sample list** — search, all/decoded/audio filters, mini-waveforms, re-transcribe action, and delete-with-undo.
- **Per-sample re-transcribe** — re-runs Whisper on a stored clip and writes the transcript/phonetic-guess into `phonetic_notes`.

`SampleDecodeView.tsx` is the right-pane Decode View: it tokenizes `alien_text` on whitespace (stripping attached punctuation for the dictionary lookup), colors each token by dictionary confidence (emerald/amber/red), shows a decode-% bar, and offers a per-token popover (dismissible by Escape or outside-click) to view a known word or define an unknown one inline.

### Phase 02 — Numbers (`components/phase2-numbers/NumberDecoder.tsx`)
- **Number & operator mapping editor** — an editable 1–N grid (range 10/20/50/100) mapping integers→alien words, plus operators (+ − × ÷ =).
- **Base inference (heuristic, client-side)** — `scoreBase()` scores candidate bases {5,6,7,8,10,12,16,20} by token-overlap between `word(n)` and `word(base)`/`word(n−base)`, picks the best, and visualizes confidence across bases.
- **AI number analysis** — a `numberAnalysis` pass that produces an explanatory write-up only (does not mutate the base/mappings).

### Phase 03 — Vocabulary (`components/phase3-vocabulary/VocabularyBuilder.tsx`)
- **Dictionary CRUD** — add/edit/delete entries (word, meaning, POS, confidence, context, examples, notes), bucketed confirmed/probable/unknown, with card and table views and an inspector with promote/demote (jumps confidence between bucket anchors). Delete is undo-able as a **true restore** (preserves the entry's id/created_at, so audio-segment links survive).
- **AI suggest** — a `patternAnalysis` pass proposing meanings for unmapped words (advisory text, not auto-applied).
- **Per-word audio + TTS** — a Speak button on each word, and an inline waveform `AudioPlayer` clamped to the linked clip segment's `[start,end]` window.

### Phase 04 — Grammar (`components/phase4-grammar/GrammarAnalyzer.tsx`)
- **Rule management** — add structural rules (description, multi-line evidence, confidence), filter by bucket, inspect evidence.
- **AI grammar inference** — a `grammarInference` pass over dictionary+rules+samples (advisory text).

### Phase 05 — Translation (`components/phase5-translation/TranslationEngine.tsx`)
- **Live word-by-word translation** (Alien→English) — exact-match dictionary lookup per token, colored by confidence, with an average-confidence readout and copy.
- **Token inspector** — click a word to see/correct the dictionary candidate or "lock-in" confidence to ≥76.
- **Whole-text AI translation** — a `translation` pass over dictionary+grammar+samples+text producing prose (advisory).
- **Reverse translation** (English→Alien) — token-indexed reverse lookup (matches any whitespace/slash-separated word of a gloss, so multi-word meanings like "to run" resolve), `[word]` for misses.

### Phase 06 — Dashboard / "Field Log" (`components/phase6-dashboard/Dashboard.tsx`)
Read-only overview of the active profile:
- **Decoding-progress hero ring** — weighted completeness (dictionary 30 / grammar 25 / numbers 15 / samples 15 / avg-confidence 15), via `lib/profileStats.ts:getDecodingProgress`.
- **Confidence distribution** — confirmed/probable/unknown breakdown with bars.
- **Growth-trend sparklines** — real cumulative series built from `created_at` timestamps (decode % is a vocabulary-weighted proxy).
- **Stat tiles, milestones, discovery timeline, AI field notes** — counts, next-milestone trackers, a session-log-derived timeline, and conditional prose notes.
- **Import / Export JSON / Export CSV** — import merges present sections; export downloads the full profile JSON or a dictionary CSV.

---

## 7. Sandbox Mode (`components/sandbox/`)

A self-contained "practice conlang" generator and tutorial:
- **Conlang generation** — `SandboxSetup` builds a difficulty-specific prompt (word order, number base, morphology) requesting strict JSON and runs the `conlangGeneration` task on the heavy model tier; the response is JSON-extracted and **validated/normalized into a `ConlangData` shape** before use.
- **Difficulty selection** — Easy (SVO/base-10/simple), Medium (SOV-or-VSO/base-8/agglutinative), Hard (OSV-or-free/base-12/infixes+tone).
- **Guided 4-step decode tutorial** — `SandboxController`: (1) Number Discovery, (2) Word Mapping, (3) Sentence Decoding (full or word-by-word with known/unknown highlighting), (4) Grammar Revelation, with overall + per-step progress. Correct/revealed items are written into the live profile's dictionary, **number system**, samples, and grammar (part-of-speech tags normalized to the `PartOfSpeech` enum); the chosen difficulty is persisted to `profile.sandbox_difficulty`. Completion requires at least one grammar rule, "Play Again" resets in-app (no full page reload), and a phoneme-inventory is displayed.

---

## 8. AI Integration — local Ollama (`server/src/services/ai-service.ts`, `routes/ai.ts`, `routes/ollama.ts`, `shared/prompts.ts`)

| Feature | What it does | API |
|---------|--------------|-----|
| **Streaming completion (SSE)** | The path every UI AI action uses: streams Ollama tokens to the browser as `data: {"token":…}` frames, ending with `[DONE]`. The client reader (`api.ts:streamAI`) checks `res.ok`, buffers by newline, surfaces server `{error}` frames, and accumulates full text. Accepts an `AbortSignal` (the AI chat aborts the in-flight stream on close); the server applies a per-token watchdog timeout (`OLLAMA_TIMEOUT_MS`, default 120 s). The request body is validated (`messages` must be a non-empty `{role,content}[]`). | `POST /api/ai/stream` |
| **Non-streaming chat** | Single-shot completion returning the full text. (No client consumer — all UI streams.) | `POST /api/ai/chat` |
| **Task system prompts + serializers** | Six `AITask` system prompts (`patternAnalysis, grammarInference, translation, conlangGeneration, quickSuggest, numberAnalysis`) plus `phoneticAnalysis`, and helpers that flatten dictionary/grammar/samples into prompt text (samples include `[ipa: …]` when present). | `shared/prompts.ts` |
| **Connection status** | Reports whether the Ollama daemon is reachable and lists installed model names; polled every 30 s to gate AI features. Returns `connected:false` (HTTP 200) when down. In the packaged app, the Electron main process also pushes `ollama:offline` / `ollama:pull-progress` events to the renderer via the preload bridge, which `OllamaProvider` reflects immediately. | `GET /api/ollama/status` |
| **Raw model list** | Pass-through of Ollama's `/api/tags`; 503 when unavailable. | `GET /api/ollama/models` |
| **Model selection & heavy/light routing** | Default model `gemma4:e4b` (env `OLLAMA_MODEL`); per-request override; the client routes the light `quickSuggest` task to a smaller model when one is configured. | `ollama-context.tsx:pickDefaultModel`, `config.ts:defaultModel` |
| **Per-task dispatch hook** | `useAI.runTask(task, message)` — guards on connection, picks the model, streams tokens, logs to the session log, returns full text. | `hooks/useAI.ts` |
| **AI slide-over chat** | Right-side panel that streams responses primed with the current profile's dictionary/grammar/samples as system context. | `components/layout/AIChat.tsx` |

---

## 9. Voice Subsystem

### 9.1 Text-to-Speech ("Hear the language")
Two engines behind one client entry point:
- **Faithful server voice** — `POST /api/tts` spawns the bundled **espeak-ng** to render `{text|phonemes, voice}` to WAV bytes. `voice` is charset-validated and option parsing is terminated with `--` (so request text starting with `-` can't be reinterpreted as espeak flags), the spawn has a timeout, and stderr is surfaced on failure. Returns `audio/wav` (200), `400` on no/oversized/non-string input, `503` when espeak is absent. (`routes/tts.ts`, `services/tts-espeak.ts`)
- **Browser fallback** — `window.speechSynthesis`. The client `speak()` tries the server first and silently falls back on any non-OK/error (notably the intentional 503 on non-Windows/dev). (`client/src/services/tts.ts`)
- **`SpeakButton`** — reusable speaker-icon button placed next to alien words and sentences. (`components/audio/SpeakButton.tsx`)

### 9.2 Speech-to-Text (Whisper) — `POST /api/stt`
A fully-local, offline transcriber that spawns the bundled **whisper.cpp** per request:
- Client encodes the recorded/uploaded blob to **16 kHz mono PCM WAV** in the browser (`wav-encode.ts`), base64-encodes it, and POSTs it.
- Server writes a temp WAV, runs `whisper-cli` with JSON output, parses language/text/segments and the language-detection probability from stderr.
- **Honesty gating** (`computeMode`) — classifies the result as a confident **`transcription`** when `languageProb ≥ MIN_LANGUAGE_PROB` (0.6, tunable) with non-empty text, else a clearly-labelled **`phonetic-guess`**, so hallucinated text on alien audio is never presented as real. An explicitly-requested language is treated as a transcription. Drives the `LanguageBadge` and gates dictionary-linking.
- The route rejects non-WAV payloads with **400**; a missing binary is **503**, while a whisper crash/timeout is **500**. The spawn has a timeout and the temp dir is always cleaned up.

### 9.3 Phonetic / IPA recognition — `POST /api/ipa`
A fully-local phone recognizer (`services/ipa-phones.ts`):
- A **Transformers.js wav2vec2 CTC** model (TIMIT ARPABET, int8-quantized, vendored at `vendor/ipa-model/wav2vec2-phoneme/`) is lazily loaded **in-process** with `allowRemoteModels=false`.
- The WAV is parsed to mono Float32; the model's per-frame logits are **greedy-CTC-decoded** into time-aligned phones (20 ms/frame stride) by the pure, unit-tested `decodeCtcPhones`, returning `{ipa, segments}`.
- The per-phone segments seed the `AudioSegmenter` (taking precedence over Whisper word boundaries); the joined phone string is stored on `Sample.ipa`, surfaced in the Decode View ("IPA · phones"), and fed to the LLM as the `phoneticAnalysis` task input.
- The WAV's `fmt ` chunk is validated (16 kHz mono); malformed/unsupported audio is a **400** (`IpaBadInputError`), while a missing model dir/runtime is **503**. `decodeCtcPhones` skips special tokens (`[UNK]`/`<unk>`) so they never leak into the phone string.
- `scripts/verify-ipa.mjs` mirrors the production decode path (including the special-token filter) to verify the vendored model offline.

> **Note:** the model emits TIMIT **ARPABET** phones (English-leaning), surfaced honestly as "phones" rather than strict IPA — this is intentional.

---

## 10. Audio Components (`components/audio/`)

| Component | Role |
|-----------|------|
| **Audio blob storage API** | `POST /api/audio/upload` (base64→disk), `GET /api/audio/:id` (probe webm→wav, stream), `DELETE /api/audio/:id`. Stored under `<DATA_DIR>/audio/`. Ids are validated against a safe charset; upload validates the decoded bytes' magic header (RIFF/WAVE or WebM EBML) and derives the extension from content, not the client-supplied mimeType. |
| **`AudioRecorder`** | `getUserMedia` + `MediaRecorder` capture, live `AnalyserNode` waveform, optional live SpeechRecognition transcript (browser-locale hint only — not the detected language), and post-stop Whisper STT + IPA. The `AudioContext` is always released (on stop, decode failure, or unmount). |
| **`AudioPlayer`** | `HTMLAudioElement` playback with a seekable canvas waveform, time display, compact inline layout, and an optional `[start,end]` playback window (seek-on-play + stop-at-end). |
| **`WaveformCanvas`** | DPR-aware canvas renderer (segment overlays, progress fill, glowing playhead, click-to-seek) + an `extractPeaks` `AudioBuffer` helper. |
| **`AudioSegmenter`** | Manual word-boundary marking (two clicks define a span), inline labels, dictionary linking, seeded from STT/IPA segments. |
| **`wav-encode`** | Browser-side decode → mono mixdown → nearest-neighbor 16 kHz downsample → 16-bit PCM WAV encoding for STT/IPA. |
| **`LanguageDetector` / `useLanguageDetection`** | Runs STT on a blob and renders a TRANSCRIPTION / PHONETIC-GUESS badge with language, confidence, and transcript. |

---

## 11. State Management (`stores/`, `hooks/`)

| Provider / hook | Responsibility |
|-----------------|----------------|
| **`ProfileProvider`** (`stores/profile-context.tsx`) | Holds the active profile; exposes typed CRUD for dictionary/samples/grammar/audio; `updateAndSave` applies a functional state update and a 500 ms-debounced full-profile PUT (which checks `res.ok`). Client-side ids via `genId(prefix)=prefix-Date.now()-counter`. `addDictionaryEntry` returns the new id; `addDictionaryEntryRaw` re-inserts an entry verbatim (for true-restore undo). Removing a sample/audio clip unlinks and deletes the server file. |
| **`OllamaProvider`** (`stores/ollama-context.tsx`) | Polls `/api/ollama/status` every 30 s; tracks `connected` + `models`; `pickDefaultModel` chooses heavy/light defaults; `getModelForTask` routes light tasks. Also subscribes (via the preload bridge) to main-process `ollama:offline`/`pull-progress` events. |
| **`SessionLogProvider`** | In-memory timestamped event log feeding the session-log panel and dashboard timeline. |
| **`ToastProvider`** | Transient toast queue. |
| **`UndoProvider` + `useUndoRedo`** | A 20-deep undo stack (`pushAction({description, undo})`). Dictionary-delete undo is now a **true restore** (preserves id/created_at); sample-delete undo restores the text (its audio was deleted with it). There is no redo. |
| **`useAI` / `useAutoSuggest`** | AI dispatch and debounced quick-suggest. |
| **`useKeyboardShortcuts`** | Global shortcut registration. |
| **`lib/profileStats.ts`** | Pure stats: decoding progress, confidence counts, cumulative trends. |

---

## 12. Marketing / Landing Page (`components/marketing/`)

The `/` route renders a fully-static, no-network cinematic landing page: a Vanta topology backdrop, an animated "Decode the unknown" headline, a live word-by-word decoding animation (`DecodeMoment`), an interactive mini-decoder, and below-fold method/proof/privacy/CTA sections (`sections.tsx`). All copy and the demo dictionary are hardcoded.

---

## 13. Desktop Packaging (`electron/`, `scripts/`)

| Feature | What it does |
|---------|--------------|
| **Production server fork + port handoff** | `startServerProcess()` forks `electron/dist/server.cjs` on `PORT=0`; the server reports its bound loopback port over IPC; main loads `http://127.0.0.1:<port>`. Includes a 30 s startup timeout (any pre-ready exit counts as failure) and an error screen if the server fails to start. macOS re-activate reuses the running server instead of forking a second one. Both the main process and the forked server install `unhandledRejection`/`uncaughtException` loggers. |
| **Environment wiring** | Injects `DATA_DIR`, `CLIENT_DIST`, `NODE_ENV`, and the Windows-only `ESPEAK_PATH` / `WHISPER_BIN` / `WHISPER_MODEL` / `IPA_MODEL_DIR` / `NODE_PATH` (for Transformers.js), each `existsSync`-guarded. |
| **Hardened window + preload** | `contextIsolation:true`, `nodeIntegration:false`, no `ipcRenderer.invoke`/`send` surface; preload exposes read-only `window.xeno` metadata plus **receive-only** subscriptions to the `ollama:offline` / `ollama:pull-progress` channels. |
| **Ollama liveness + auto-pull** | Probes Ollama on launch; pulls the default model with streamed progress if missing; emits `ollama:offline` otherwise. Both events are now received by the renderer (see `OllamaProvider`). |
| **esbuild bundling** | `scripts/bundle.mjs` produces self-contained CJS for the forked server and the Electron main/preload. |
| **electron-builder packaging** | Packages for Win/macOS/Linux; ships the SPA and vendored voice binaries via `extraResources`; GitHub-based publish/auto-update. |
| **Single-instance lock** | One instance; a second launch focuses the existing window. |
| **Dev orchestration** | `scripts/wait-and-launch.mjs` waits for Vite, bundles, then launches Electron at the dev URL. |
| **Verification scripts** | `scripts/verify-stt.mjs` and `scripts/verify-ipa.mjs` exercise the vendored Whisper/IPA assets offline (used in place of vitest tests the native runtimes can't host on Windows). |

---

## 14. HTTP API Reference

| Method & path | Purpose | Success | Errors |
|---------------|---------|---------|--------|
| `GET /api/health` | Liveness probe | `200 {status,timestamp}` | — |
| `GET /api/ollama/status` | Ollama reachable + model names | `200 {connected,models}` | `200 {connected:false}` |
| `GET /api/ollama/models` | Raw `/api/tags` pass-through | `200 <ollama json>` | `503` |
| `POST /api/ai/chat` | One-shot completion | `200 {…}` | `500` |
| `POST /api/ai/stream` | SSE token stream | `data:` frames + `[DONE]` | SSE `{error}` |
| `GET /api/profiles` | Profile index | `200 ProfileIndex[]` | — |
| `GET /api/profiles/:id` | Full profile | `200 LanguageProfile` | `404` |
| `POST /api/profiles` | Create | `201 LanguageProfile` | — |
| `POST /api/profiles/demo` | Seed "Eridian" | `201 LanguageProfile` | — |
| `PUT /api/profiles/:id` | Full-document update | `200 LanguageProfile` | `404` |
| `DELETE /api/profiles/:id` | Delete | `204` | — |
| `POST /api/audio/upload` | Store base64 clip | `200 {filename,size}` | `400` |
| `GET /api/audio/:id` | Stream clip | `200 audio/*` | `400`, `404` |
| `DELETE /api/audio/:id` | Delete clip | `200 {deleted}` | `400`, `404` |
| `POST /api/tts` | espeak → WAV | `200 audio/wav` | `400`, `503`, `500` |
| `POST /api/stt` | Whisper transcribe | `200 SttResult` | `400`, `503` |
| `POST /api/ipa` | wav2vec2 phones | `200 IpaResult` | `400`, `503` |

Unknown `/api/*` paths return `404 {error:'Not found'}`; unknown non-API GETs fall back to the SPA `index.html` (production only).

---

## 15. Configuration (environment variables, `server/src/config.ts`)

| Var | Default | Meaning |
|-----|---------|---------|
| `DATA_DIR` | `<repo>/server/data` (dev) | Root for profiles + audio (set by Electron in prod) |
| `OLLAMA_MODEL` | `gemma4:e4b` | Default model for new chats |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint (`config.ollamaBaseUrl()`) |
| `OLLAMA_TIMEOUT_MS` | `120000` | Per-request / per-token Ollama watchdog timeout |
| `WHISPER_TIMEOUT_MS` | `120000` | Max wall-clock for one whisper run |
| `TTS_TIMEOUT_MS` | `30000` | Max wall-clock for one espeak run |
| `CLIENT_DIST` | _(unset → Vite serves)_ | Built SPA dir to serve in production |
| `PORT` | `3001` (`0` = OS-assigned) | Bind port (prod uses `0`) |
| `ESPEAK_PATH` | _(unset → browser TTS)_ | Bundled espeak-ng binary (Windows) |
| `WHISPER_BIN` / `WHISPER_MODEL` | _(unset → STT 503)_ | Bundled whisper.cpp binary + ggml model (Windows) |
| `IPA_MODEL_DIR` | _(unset → IPA 503)_ | Vendored wav2vec2 model dir |
| `NODE_ENV` | — | `production` hardens error messages and is set by Electron |

---

## 16. Intentional Behaviors & Known Limitations

These are **by design**, not bugs:
- **Windows-only voice today.** espeak-ng, whisper.cpp, and the IPA model are vendored for Windows; on macOS/Linux or in dev those endpoints 503 and the UI degrades (TTS to browser speech; STT/IPA absent). Cross-platform vendoring is deferred.
- **ARPABET, not strict IPA.** The phone model emits TIMIT ARPABET phones, surfaced honestly as "phones".
- **AI output is advisory.** The four phase AI passes (vocabulary/number/grammar/translation) produce prose for the user to read and act on; they do not auto-write structured fields back into the profile (Sandbox is the exception — it writes confirmed items).
- **Whitespace tokenization.** Decode View, translation, and sandbox checks split on whitespace; attached punctuation is now stripped for lookups, but there is no stemming/morphology, so inflected/affixed forms can still miss.
- **In-memory phase nav.** The active phase isn't in the URL; a refresh drops the in-memory profile and returns to the landing screen (the profile data itself is persisted server-side).
- **Native-runtime tests are gated.** Real espeak/whisper/IPA inference can't run under vitest on Windows; the `verify-*.mjs` scripts cover those paths instead (the skipped tests are env-gated).

---

*Generated from a full multi-agent code review of the `origin/main` tree (13 feature-area reviewers + 4 cross-cutting reviewers, every finding adversarially verified), and updated to reflect the fixes applied on `review/full-audit`. See `docs/REVIEW-2026-06-13.md` for the accompanying findings report.*
