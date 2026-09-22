# Xenolinguist feature reference

This document describes the `implementation/reliability` development preview through W11. The published v1.0.0 installer from June 14, 2026 predates the reliability work. Package version alone does not identify the tested source: use [implementation progress](implementation-progress.md) and the hashes in [verification records](verification/). The public website deploys from `main` separately.

## Architecture

| Layer | Responsibility |
| --- | --- |
| React 19 / Vite / TypeScript | Workbench, profile queue, audio preparation worker and static marketing page |
| Electron 42 | Sandboxed window, native lifecycle, trusted IPC and a per-launch local API credential |
| Express backend | Runtime-validated profiles, serialized storage, audio transactions, inference and job control |
| Shared TypeScript / Zod | Versioned data contracts, typed mutations, metrics, prompts and the Eridian seed |
| Native Windows assets | eSpeak NG synthesis, whisper.cpp transcription and ONNX wav2vec2 CTC phones |
| Ollama | Separately installed local completion models; not required for manual work |

The packaged backend is an Electron utility process on a random loopback port. Only the trusted main window receives authenticated API access. Direct development use pairs with a local code and a browser session cookie. The marketing route mounts no inference providers. Public-site `/app` navigation returns to the download section instead of exposing a nonfunctional workbench.

## Profiles and recovery

A profile is a version-2 JSON document containing dictionary entries, number mappings, grammar notes, samples and audio metadata, with optional sandbox sessions, metric snapshots and bounded AI history. Its revision is server-owned. Runtime validation checks structure, supported schema versions and internal relationships. Legacy conversion preserves a backup; unknown future schemas are rejected.

Writes use typed operations and expected revisions, a per-profile serialized transaction, atomic file replacement and recovery snapshots. Stale writes return HTTP 409. The client preserves pending operations, retries through idempotency receipts and exposes unresolved conflicts. Text/audio drafts and the active phase recover across reload; native queue persistence survives the random origin changing at restart. This is tested recovery behavior, not exhaustive power-loss certification.

The dashboard exports the current profile as JSON and dictionary rows as CSV. Import validates and replaces dictionary, grammar, samples, number mappings and clip metadata in the active profile. It does **not** restore all exported fields or copy recording bytes. Chat, sandbox state, metric history and profile identity are not restored by this import. A complete portable archive remains W13.

## Navigation and phases

The workbench provides profile selection/creation, a shared demo, six phases, a command palette and keyboard shortcuts. Keys 1–6 switch phases outside text entry. A new Eridian profile uses `eridian-demo-2`, a hand-authored fictional corpus with example user beliefs. Existing saved demos retain their original contents.

| Phase | Implemented behavior | Limits |
| --- | --- | --- |
| Samples | Add/edit source text, translation notes and phonetic notes; attach recordings; retain failed saves and drafts | A transcription or decoded flag is not verification of a meaning |
| Numbers | Record integer mappings, manually set a base, compare candidate fits and request AI advice | Scores describe heuristic support and ties, not statistical confidence |
| Vocabulary | Edit words, explicit senses, accepted aliases, examples, parts of speech and optional 0–100 user belief | Repeated assertions do not become independent evidence |
| Grammar | Record rule text and evidence strings; request advisory model analysis | Rule text is not compiled or automatically validated |
| Translation | Dictionary lookup in source order with candidates and unresolved tokens; optional model analysis | Typed morphology and one-clause composition are bounded; notebook prose never executes. General syntax and script-specific segmentation are unsupported |
| Dashboard | Separate observation/assertion counts, user-belief counts, saved metric history and guidance | No defensible “language decoded” percentage or evaluated coverage |

[Workspace evidence](workspace-evidence.md) defines the metrics and their boundaries.

## Audio lifecycle

Original bytes are staged as immutable assets and identified by SHA256. A browser worker prepares a separate mono 16 kHz PCM16 analysis copy. Sample/clip references are saved atomically with the profile mutation. Draft recording/preparation state survives interruption; analysis is explicit and can be retried without losing the original. Saved assets support playback, original download, segment/word linking and delete/undo. Physical file garbage collection and a complete audio archive are unfinished.

Tested paths include a PCM16 WAV fixture and browser-prepared WebM recording. Browser decoding depends on codec support; arbitrary audio formats are not guaranteed. The phone API strictly validates RIFF/WAVE mono PCM16 at 16 kHz, 25 ms–120 seconds. Whisper has its own WAV/transcription path. Phone output is approximate **TIMIT ARPABET**, not strict IPA, from an English-trained model with roughly 20 ms timing resolution. No universal phoneme or click-consonant accuracy claim is supported.

Phone work runs in a disposable child process. Whisper runs as a CLI child. Both share one acoustic execution lane and support cancellation with process exit before the lane is released. TTS uses a separate deterministic eSpeak route; browser/OS fallback can depend on the selected voice. Whisper labels distinguish transcription and phonetic guesses, but neither label guarantees correctness. See [audio lifecycle](audio-lifecycle.md), [phone model notes](ipa-model-notes.md) and [native provenance](../vendor/THIRD_PARTY.md).

## AI setup, jobs and history

Runtime & setup reports storage, TTS, STT, phones and chat separately. File availability does not prove inference success. It lists model metadata and local resource diagnostics without sending telemetry.

Generation accepts an eligible local completion model: loopback HTTP endpoint, local model metadata, nonzero size, digest and completion capability. Remote-backed tags/metadata, embedding-only models and unverifiable models are rejected. Eligibility is checked again when queued execution starts. These checks depend on truthful daemon metadata and do not defeat a malicious daemon or external tag replacement.

The preview performs no startup model pull. Explicit download buttons offer the default `gemma4:e4b` (~9.61 GB) and optional `llama3.2:3b` (~2.02 GB), with progress, cancellation and retry. All tasks use the selected eligible model; automatic heavy/light routing was removed. Installed models must fit available hardware; these sizes are download estimates, not RAM promises.

Generation, acoustic work and downloads have separate bounded lanes. Deadlines include queue wait; running cancellation retains capacity until cleanup settles. Up to 100 recent metadata-only jobs are held in memory. Restart does not resume jobs. NDJSON parsing has bounded records, idle deadlines and required completion markers. The server applies task-specific context, output and input limits. See [runtime jobs](runtime-jobs.md) for exact budgets.

Chat and analysis proposals retain content, model name, task, timestamp and completion/error state in the originating profile. Partial output is checkpointed approximately once per second. Limits are 40 records, 120,000 total content characters and 60,000 per record. Abrupt shutdown may lose the latest fragment. Delete AI history clears live data; recovery snapshots/exports may retain prior content. Full prompt/digest provenance and evaluation artifacts are later work.

## Creative practice

A model-generated practice language is structurally validated, then saved as a versioned session. Exact accepted forms and integer checks replace permissive substring matching. Idempotent answer events, persisted progression, assistance counters and explicit legacy recovery make sessions repeatable at the application level. A generated key may still be inconsistent or ambiguous. It is not a deterministic compiler, an independently held-out benchmark or evidence of learned linguistic competence. See [sandbox sessions](sandbox-sessions.md).

## Static website and version presentation

The public widget derives dictionary entries from `shared/demo-language.ts` through `shared/demo-presentation.ts`. It performs local exact lookup without a backend/model call. The hero cycles saved glosses and labels them illustrative; glosses retain source word order while the saved sentence interpretation is shown separately. Controls support keyboard interaction and respect reduced-motion preferences.

Public buttons labelled “Download for Windows” scroll to a section that identifies the pinned published installer and its limitations. “Try dictionary demo” reaches the actual widget. In the local app the primary action opens the workbench. Source identity is built from Git independently of the installer version. Updating the release link requires updating its associated version/date/limitations together; the Pages workflow no longer injects an unrelated latest URL into fixed v1.0.0 text.

The project license is proprietary. Public source visibility is not an open-source license. Dependency licenses remain intact.

## HTTP API map

All `/api` routes require the applicable local session, including health, audio and jobs. Binary bodies are authenticated before parsing. The development pairing flow is documented in [local security](local-security.md). Errors generally include a safe message/code and request ID where provided; route-specific streaming and legacy contracts differ. This table is an overview, not a replacement for the schemas.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Authenticated backend health |
| `GET /api/ollama/status`, `/models`, `/capabilities` | Cached inventory, refreshed inventory and independent runtime availability |
| `POST /api/ollama/pull` | Explicit confirmed allowlisted model download; HTTP 202 job |
| `GET /api/jobs`, `DELETE /api/jobs/:id` | Recent job metadata and cancellation |
| `POST /api/ai/chat`, `/stream` | One-shot output or SSE tokens, job ID, completion/error frames |
| `GET /api/profiles`, `GET /api/profiles/:id` | Index and validated document |
| `POST /api/profiles`, `/api/profiles/demo` | Create profile or current Eridian seed |
| `PUT /api/profiles/:id` | Revision-checked document update |
| `POST /api/profiles/:id/mutations` | Typed idempotent operations at an expected revision |
| `DELETE /api/profiles/:id` | Remove profile |
| `POST /api/audio/stages`, `PUT /api/audio/stages/:id/analysis` | Stage binary original and prepared copy |
| `GET /api/audio/:id`, `/:id/analysis`, `/:id/metadata` | Original audio, analysis WAV and asset metadata |
| `POST /api/audio/upload`, `DELETE /api/audio/:id` | Compatibility upload and guarded removal |
| `POST /api/tts`, `/api/stt`, `/api/ipa` | Synthesis, transcription and approximate ARPABET phones |

Validation/conflicts, queue limits, missing runtime assets and upstream failures return distinct non-success responses. Client disconnects cancel generation/acoustic work; explicit downloads remain associated with their job until completion/cancellation.

## Configuration and build

`DATA_DIR` selects the local storage root (development default `server/data`); Electron chooses its per-user directory. `PORT` defaults to 3001 and supports 0 for an assigned port. `CLIENT_DIST` selects the production SPA. `OLLAMA_MODEL` defaults to `gemma4:e4b`; `OLLAMA_BASE_URL` defaults to `http://localhost:11434` and must pass the loopback policy. `WHISPER_TIMEOUT_MS` and `TTS_TIMEOUT_MS` bound the respective native calls. The old `OLLAMA_TIMEOUT_MS` is no longer consumed by the generation service.

`ESPEAK_PATH`, `WHISPER_BIN`, `WHISPER_MODEL`, `IPA_MODEL_DIR` and packaged `XENO_RUNTIME_ROOT` resolve native components. Packaging verifies asset hashes and staged production dependencies against manifests/lockfile. Windows x64 is the only allowed native target even though older cross-platform builder fields remain. Offline use begins after provisioning and optional model setup; update checks, downloads and external links use the network.

See [desktop release](desktop-release.md), [testing](testing.md) and [limitations](limitations.md). Historical reviews and screenshots describe their recorded source, not necessarily current behavior.

See [Unicode lexicon](unicode-lexicon.md) for normalization, source offsets, profile settings and ambiguity limits.

[Executable typed grammar](typed-grammar.md) describes rule editing, bounded parsing, meaning trees, generation and manual-demo provenance.
