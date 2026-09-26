# Current limitations and evidence boundaries

Applies to the `implementation/reliability` preview through W19. The public v1.0.0 installer predates W01–W19. Source version, application package version and a released artifact are different identities; no new public installer is implied by this documentation.

## Interpretation and AI

- Exact dictionary lookup remains separate from symbolic translation. Typed rules now support bounded noun plural/verb tense affixes, negation, adjective placement and SVO/SOV/VSO clauses. Notebook prose does not execute. Competing analyses, unsupported syntax and search limits remain explicit; general morphology and script-specific segmentation remain unfinished. Grounded rule learning requires supplied lexical anchors, distinct fit/validation observations and explicit acceptance; its declared family and abstentions are documented in [grounded induction](grounded-induction.md). See [typed grammar](typed-grammar.md). See the [lexicon contract](unicode-lexicon.md).
- Number grammars cover declared additive/multiplicative families with supplied primitive mappings; missing atoms, conflicts and bounded search can prevent predictions. Unknown irregular target forms can be overgeneralized incorrectly. Fit/validation ranking and candidate consensus are not calibrated probabilities; see [number grammar](number-grammar.md). User belief is optional, manually supplied and not a probability. Content counts are not evaluated language coverage.
- Local-model output is advisory and can be inconsistent. Creative practice is graded against a model-generated key, not independently verified truth. The Eridian corpus is fictional teaching material, not a benchmark.
- One synthetic model smoke comparison is not a quality ranking. There is no measured universal decipherment capability or click-consonant recognition claim. The deterministic compiler and frozen symbolic/model/hybrid experiments are implemented under an explicit bounded grammar prior; see [measured results](evaluation-results.md).
- Model metadata is rechecked at execution, but an inaccurately reporting daemon or external tag replacement lies outside that guarantee. The research harness retains prompts, source snapshots and pinned model digests; ordinary workbench proposals do not yet have that full immutable provenance.

## Recordings and portability

Phone analysis uses an English-trained wav2vec2 CTC model and emits approximate TIMIT ARPABET, despite legacy `ipa` API names. Tested input is mono PCM16 RIFF/WAVE at 16 kHz, 25 ms–120 seconds. Browser-prepared WAV/WebM flows pass; other codec combinations depend on browser support. Timings and transcription can be wrong, especially for unfamiliar or constructed speech.

Original recording bytes are separate assets. JSON includes references and metadata, not the files. Dashboard JSON import replaces selected language fields but does not restore all exported state (including AI history, sandbox sessions and metric snapshots). CSV is dictionary interchange. W13 `.xeno` archives restore saved state and recording bytes, with sandbox state explicitly selected at export. Archives are capped at 256 MiB and exclude unsaved drafts, running jobs and model binaries. Legacy recordings retain their existing format without inventing analysis data. See [archive boundaries](project-archives.md).

Audio assets are retained for undo/recovery; exhaustive garbage collection is unfinished. Delete AI history removes live records, not copies in snapshots or prior exports. Retained partial answers can lose the newest unflushed fragment in an abrupt crash.

## Runtime, release and offline use

Windows x64 is the only manifested native platform. W12 adds independent installation and application acceptance on a fresh Windows runner; see the [CI guide and evidence](ci-release-gates.md). This does not certify signing, upgrades/uninstallation, every Windows version, physical microphones or macOS/Linux native support. Source regression tests also run on Linux. The old v1.0.0 download is unsigned and has not been upgraded by development commits.

Offline use needs the application assets plus any selected model already installed. Downloads, external links and desktop update checks use the network. OS/browser speech fallback depends on the chosen voice. The static website is served by GitHub Pages; typing in its dictionary widget triggers no application/API requests.

Availability probes report files/service metadata, not guaranteed inference. Queue deadlines and limits bound work, but no latency guarantee exists across hardware. Phone cancellation uses a disposable process, with model reload cost per job. Jobs are in-memory and are not resumed after restart. Large model inventories may take longer to probe than the UI refresh timeout. Local data is not encrypted at rest, and hostile software running as the same user is outside the local API boundary.

## What has been checked

[Testing](testing.md) links unit, browser, real-model and Windows evidence. The first W21 backend unit raises the verified baseline to 371 passing unit tests and seven tooling tests, with three gated native unit skips, all 37 workbench checks passing and eight public-site checks on Windows and Linux. Required installed native assertions run separately from the gated unit tests. Real generation and native phone cancellation are followed by successful subsequent requests. Save queues, audio drafts, sandbox sessions and W10 free-text AI history recover in the tested restart scenarios. These are engineering acceptance checks; they are not broad scientific accuracy results or exhaustive power-loss testing. Four reviewed native-chain audit package entries remain; see [dependency dispositions](dependency-review.md).

The [research notebook](research-evidence.md) now retains linked evidence and replayed symbolic derivations. User decisions and supplied-target checks are not calibrated probabilities or held-out accuracy. Root deduplication is conservative text comparison; translation invalidation uses whole inventories and may recompute more than strictly necessary. Research histories are bounded and append-only; concurrent research edits require conflict resolution. W20 verification is recorded in implementation progress. Next packages add validated model research proposals. See [implementation progress](implementation-progress.md).

W21's first [proposal backend](research-proposals.md) returns validated previews and experiment provenance without applying or persisting a decision. The workbench still uses its existing free-text AI workflow. Durable proposal review/application and the comparative held-out evaluation remain pending. Valid citation offsets and compatibility with selected user targets do not establish semantic evidence support or general accuracy.
