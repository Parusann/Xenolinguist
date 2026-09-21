# Current limitations and evidence boundaries

Applies to the `implementation/reliability` preview through W16. The public v1.0.0 installer predates W01–W16. Source version, application package version and a released artifact are different identities; no new public installer is implied by this documentation.

## Interpretation and AI

- Exact dictionary lookup is not compositional translation. Grammar notes are not applied automatically. Unicode normalization, explicit senses and source spans are implemented. Competing lexical analyses remain unresolved; morphology, executable grammar and general script-specific word segmentation are unfinished. See the [lexicon contract](unicode-lexicon.md).
- Number-system candidates show heuristic support and ties. User belief is optional, manually supplied and not a probability. Content counts are not evaluated language coverage.
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

[Testing](testing.md) links unit, browser, real-model and Windows evidence. The W16 local baseline has 271 passing unit tests and seven tooling tests, three gated native unit skips, all 31 workbench checks passing and eight public-site checks. Required installed native assertions run separately from the gated unit tests. Real generation and native phone cancellation are followed by successful subsequent requests. Save queues, audio drafts, sandbox sessions and AI proposals recover in the tested restart scenarios. These are engineering acceptance checks; they are not broad scientific accuracy results or exhaustive power-loss testing. Four reviewed native-chain audit package entries remain; see [dependency dispositions](dependency-review.md).

Next packages add executable typed grammar and broader inference. See [implementation progress](implementation-progress.md).
