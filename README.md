<p align="center"><img src="client/public/logo.svg" alt="Xenolinguist" width="76" /></p>
<h1 align="center">Xenolinguist</h1>
<p align="center"><strong>From observations to executable explanations.</strong><br />A local linguistic research workbench with symbolic inference, controlled AI assistance, and reproducible experiments.</p>
<p align="center">
  <a href="https://parusann.github.io/Xenolinguist/">Website</a> ·
  <a href="https://github.com/Parusann/Xenolinguist/blob/main/docs/demo-script.md">Three-minute demonstration</a> ·
  <a href="https://github.com/Parusann/Xenolinguist/blob/main/docs/architecture.md">Architecture</a> ·
  <a href="https://github.com/Parusann/Xenolinguist/blob/main/docs/benchmarks.md">Benchmarks</a> ·
  <a href="https://github.com/Parusann/Xenolinguist/blob/main/docs/technical-case-study.md">Case study</a>
</p>
<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-engine_%2B_workbench-3178C6" alt="TypeScript engine and workbench" />
  <img src="https://img.shields.io/badge/Windows_x64-verified_candidate-00a86b" alt="Windows x64 verified candidate" />
  <img src="https://img.shields.io/badge/License-Proprietary-64748b" alt="Proprietary license" />
</p>

[![Xenolinguist website with its cinematic translation replay](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/screenshots/presentation-hero.png)](https://parusann.github.io/Xenolinguist/)

Xenolinguist connects a research notebook to an executable language engine. Collect text and recordings, compare grammar hypotheses, ask a question that separates them, and inspect how a reviewed rule produces a translation. Observations, model proposals, user decisions, and evaluated results retain their own identities.

The engineering spans **bounded morphology and parsing, grounded rule search, arithmetic grammars, active elicitation, native speech processing, durable storage, and an authenticated desktop runtime**. A frozen evaluation harness makes the successes and failure cases reproducible.

Current development also includes a **private language Atlas and a completed specialist-model research cycle**. Atlas adds PostgreSQL ownership enforcement, immutable uploads, source-pinned comparisons, recoverable jobs, reviewed desktop transfers and verified encrypted recovery on a dedicated HDD. The adapter study retained a null lexical result, and the product uses its validated deterministic comparison method. [Atlas guide](docs/atlas-guide.md) · [Research model card](docs/decipherment-model-card.md).

> **Available now:** [Download v1.1.0-rc.1 for Windows](https://github.com/Parusann/Xenolinguist/releases/tag/v1.1.0-rc.1), an **unsigned prerelease** published October 14, 2026. The installer is the exact verified artifact from `00a25d5`. The published website follows `main`; the Atlas and specialist research described here are source-only on `research/decipherment` in [PR #8](https://github.com/Parusann/Xenolinguist/pull/8). [Version and installation guide](docs/desktop-release.md).

## See the research loop

[![A real symbolic derivation in Xenolinguist](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w26-demo/derivation-steps.png)](https://github.com/Parusann/Xenolinguist/blob/main/docs/demo-script.md)

**One observation. A reviewed rule. An unseen form explained.** The [182-second recorded run](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w26-demo/demo.mp4) uses reserved synthetic seed `104729`: three supplied word meanings, two competing plural rules, and one revealed answer.

1. Compare prefix and suffix hypotheses; select a question whose predicted answers disagree.
2. Record the observed form for **“the stars”**. Two alternatives become one.
3. Explicitly disable the contradicted rule; preserve the question, answer and notebook history.
4. Translate the withheld form for **“the rocks”**. Inspect the lexical stem, plural rule, source spans and meaning tree.
5. Reload the project and reproduce the result from retained state.

The demonstration uses the real workbench and isolated backend, with **zero model calls**. It tests a reserved lexical seed within a supplied regular grammar family. [Executable demonstration](https://github.com/Parusann/Xenolinguist/blob/main/tests/e2e/recruiter-demo.spec.ts) · [Result manifest and information budget](https://github.com/Parusann/Xenolinguist/blob/main/docs/verification/w26-demo/demo-manifest.json).

## Inside the workbench

Real application captures from retained feature-verification runs. Click a picture to inspect it at full resolution. The small datasets and fixture-model labels in these captures describe test scenarios; the measured research results are reported separately below.

| **Language samples & audio history** | **Number-system inference** |
| --- | --- |
| [![Language samples & audio history](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w23-transcripts-browser-windows.png)](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w23-transcripts-browser-windows.png) | [![Number-system inference](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w19-number-composition.png)](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w19-number-composition.png) |
| Original recordings, generated transcripts and manual segments retain their own histories. | Inspect a base-five candidate and the arithmetic composition tree behind an unseen value. |

| **Grounded grammar learning** | **Competing lexical meanings** |
| --- | --- |
| [![Grounded grammar learning](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w18-grounded-proposal.png)](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w18-grounded-proposal.png) | [![Competing lexical meanings](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w16-competing-senses.png)](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w16-competing-senses.png) |
| Review an affix proposal against separate fit and validation observations before accepting it. | Keep ambiguity visible and inspect the source span behind each candidate sense. |

| **Active grammar questions** | **Evidence corrections** |
| --- | --- |
| [![Active grammar questions](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w26-demo/elicitation.png)](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w26-demo/elicitation.png) | [![Evidence corrections](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w20-research-correction.png)](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w20-research-correction.png) |
| One recorded answer separates prefix and suffix alternatives; acceptance remains explicit. | A newer interpretation invalidates dependent evidence without erasing the earlier decision. |

## What makes it technically interesting

| System | Implementation | Inspect |
| --- | --- | --- |
| **Explainable language engine** | Unicode-aware lexical indexes; bounded affix analysis and span-chart parsing; typed semantic trees, explicit ambiguity, source spans and reverse generation | [Typed grammar](https://github.com/Parusann/Xenolinguist/blob/main/docs/typed-grammar.md) · [Parser source](https://github.com/Parusann/Xenolinguist/blob/main/engine/src/grammar/parser.ts) |
| **Grounded grammar learning** | Search over affix and word-order candidates using a description-length objective, separate fit/validation observations, ablations and explicit acceptance | [Grounded induction](https://github.com/Parusann/Xenolinguist/blob/main/docs/grounded-induction.md) · [Search objective](https://github.com/Parusann/Xenolinguist/blob/main/engine/src/induction/mdl.ts) |
| **Number-system inference** | Bounded additive/multiplicative grammar enumeration, composition trees, independent validation and competing predictions | [Number grammars](https://github.com/Parusann/Xenolinguist/blob/main/docs/number-grammar.md) |
| **Active elicitation** | Rank grounded questions by finite-candidate disagreement and declared cost; retain predicted answers, observations, declines and surviving alternatives | [Query selection](https://github.com/Parusann/Xenolinguist/blob/main/engine/src/elicitation/select.ts) · [Learning curves](https://github.com/Parusann/Xenolinguist/blob/main/docs/elicitation-results.md) |
| **Controlled local AI** | Eligible Ollama models, bounded context/tools, typed proposals, citation and execution checks, revision-aware review and cancellable jobs | [Proposal boundary](https://github.com/Parusann/Xenolinguist/blob/main/docs/research-proposals.md) · [Validator](https://github.com/Parusann/Xenolinguist/blob/main/server/src/services/proposal-validator.ts) |
| **Traceable acoustic processing** | Original/analysis audio identities, windowed native CTC inference, transcription provenance, generated/manual histories and process-level cancellation | [Audio contract](https://github.com/Parusann/Xenolinguist/blob/main/docs/audio-evaluation.md) · [CTC implementation](https://github.com/Parusann/Xenolinguist/blob/main/engine/src/audio/ctc.ts) |

The evidence notebook links immutable captures, annotation revisions, hypotheses and saved derivations. Changed dependencies mark earlier analyses stale; server-side replay checks saved symbolic results. [Evidence model](https://github.com/Parusann/Xenolinguist/blob/main/docs/research-evidence.md).

## A private Atlas, built around evidence

[![The Xenolinguist Atlas private language collection](docs/screenshots/atlas-collection.png)](docs/atlas-guide.md)

[Watch the 91-second captioned Atlas demonstration](docs/verification/l9-atlas-demo/atlas-demo.mp4) · [Read the transcript](docs/verification/l9-atlas-demo/transcript.md) · [Verification and review](docs/atlas-beta-review.md)

Upload a known or unknown language wordlist, retain the original bytes and compare meaning-labelled evidence with a small licensed reference collection. Inspect aligned forms, repeated symbol correspondences, observed grammar, counterexamples, shuffled-label controls and the next useful observations. Missing-form suggestions remain conditional proposals. **Similarity is never presented as an ancestry probability.** Plain-text samples without meaning anchors remain explicitly insufficient for lexical comparison.

| Engineering boundary | Actual implementation |
| --- | --- |
| **Private accounts** | Isolated authentication role, transaction-scoped ownership and forced PostgreSQL RLS. Device credentials use browser-approved one-time codes, hashed server storage and OS-protected desktop storage. |
| **Immutable evidence** | CSV/JSON/text validation, original UTF-8 bytes, SHA-256 identities, source-rights declarations, versioned imports and idempotent retries. |
| **Bounded computation** | Unicode grapheme and declared-segment alignment, tied-path detection, distinct-concept rule support, held-out prediction audits, 10-million-cell bound and an external worker deadline. |
| **Recoverable work** | One leased queue worker, heartbeat renewal, fencing tokens, three-attempt recovery, cancellation and ownership/integrity checks before result publication. |
| **Consistent recovery** | An exported database snapshot coordinated with object publication, encrypted restic snapshots, fresh-database restoration, every-table fingerprints, file checksums, RLS checks and saved-report replay. |

The controlled substitution study retains **128 synthetic cases** and **550 correct emitted missing-form proposals**, with sparse abstentions and zero proposals from unrelated borrowing controls. It validates a narrow position-independent substitution model, rather than historical-language reconstruction. The reference pilot contains **70 WOLD forms across six languages** and **12 WALS feature values**, with original source notices and explicit missing/ambiguous mappings. [Method, assumptions and raw cases](docs/atlas-comparison.md).

The actual Windows Electron entry was tested through connection, reviewed transfer, digest-matched report retrieval, proposal staging, restart and offline editing with Atlas stopped. Recovery restored **two accounts, two objects and nineteen tables**, preserved private access and replayed the saved report. On one HDD host, warm metadata p95 was **1.97 ms over 100 reads** and the declared 5,000-row comparison p95 was **1.23 seconds over ten jobs**. These are bounded local measurements, with stated cache and sampling limits. [Desktop verification](docs/atlas-desktop.md) · [Recovery and performance](docs/atlas-recovery.md).

Atlas is a **source-development personal beta**, available while the host computer runs. It uses the existing HDD and requires no paid API, GPU or hosting subscription. Current snapshots share the primary drive; independent recovery storage must be established before irreplaceable submissions. The published v1.1.0-rc.1 installer remains the separate release described above.

## A specialist experiment with an honest result

The research cycle generated disjoint synthetic language lineages, retained licensed references outside training, established model and symbolic baselines, verified exact checkpoint recovery and trained a bounded Qwen3-4B adapter. The base and candidate were converted through a pinned toolchain and evaluated with the same base revision, precision, templates, options, prompts and information budgets; the candidate changes exactly the two trained projections.

On the reserved lexical task, **both identified 0/8 recoverable mappings** and handled **16/24 uncertain cases correctly**. The candidate failed the frozen improvement gates. Raw outputs, complete replayable archives, parameter hashes, resource measurements, per-lineage results and the failure analysis remain available. A superior specialist model has not been demonstrated or released. [Model card](docs/decipherment-model-card.md) · [Product interface and ambiguous case](docs/decipherment-product-interface.md) · [Baseline studies](docs/decipherment-baselines.md).

## Architecture

```mermaid
flowchart LR
    UI[React workbench] --> Q[Durable mutation queue]
    Q --> API[Authenticated local API]
    API --> S[Revisioned snapshots and audio]
    UI --> E[Pure TypeScript engine]
    E --> D[Source-linked derivation]
    API --> J[Bounded cancellable jobs]
    J --> N[Whisper / ONNX / eSpeak]
    J --> M[Local Ollama model]
    M --> V[Typed proposal and validation]
    V --> R[Explicit review]
    R --> Q
```

The pure engine is separate from the UI and model service. An independent corpus/scorer supplies benchmark truth. A model cannot directly write project files or approve its own suggestions. Schema and citation validity alone do not establish that a proposed linguistic rule is supported.

**Storage is designed around interrupted work:** expected revisions and idempotency receipts; serialized mutations and atomic replacement; durable text/audio drafts; exact migration backups; staged, checksummed `.xeno` archives; and backend recovery that rotates credentials while retaining post-crash edits. [Architecture and trust boundaries](https://github.com/Parusann/Xenolinguist/blob/main/docs/architecture.md) · [Design decisions](https://github.com/Parusann/Xenolinguist/tree/main/docs/decisions).

## Measured results

[![Measured learning curves across symbolic, model-only and hybrid baselines](https://raw.githubusercontent.com/Parusann/Xenolinguist/refs/heads/main/docs/verification/w15-baseline-figures.png)](https://github.com/Parusann/Xenolinguist/blob/main/docs/evaluation-results.md)

Each row is a separate experiment, with its own inputs and denominator. These are bounded synthetic results and a small acoustic pilot, not a general language-decipherment score.

| Experiment | Observed result | Conditions and limits |
| --- | --- | --- |
| **Symbolic composition** | **150/150** withheld meanings at 29 observations | 30 reserved languages; supplied grammar prior. Model-only: **0/300**. [Protocol and raw results](https://github.com/Parusann/Xenolinguist/blob/main/docs/evaluation-results.md) |
| **Grounded affix learning** | **48/48** regular reserved compositions | Seven lexical anchors, 14 fit and six validation observations. Sparse: **0/48**; hidden irregulars: **24/48**. [Ablations](https://github.com/Parusann/Xenolinguist/blob/main/docs/induction-results.md) |
| **Active questions** | **72/72** regular grammar predictions after two active answers | Supplied finite alternatives; seeded-random and fixed-curriculum controls. Irregularity and unavailable predictions retain errors/abstentions. [Learning curves](https://github.com/Parusann/Xenolinguist/blob/main/docs/elicitation-results.md) |
| **Large-profile UI** | Vocabulary view: **5,998 → 261 ms** | 10,000 words and samples on one Windows host. Editing: 857–982 → 102–196 ms; small-profile startup regressed. [Measurements](https://github.com/Parusann/Xenolinguist/blob/main/docs/performance.md) |

The AI comparison retains **zero application-eligible reserved proposals**; a linguistic-quality advantage has not been demonstrated. The English acoustic pilot retains **29.72% evaluation phone error rate** and **33.33% word error rate**, including three recurring transcription failures. Keeping these results is part of the evaluation design. [AI comparison](https://github.com/Parusann/Xenolinguist/blob/main/docs/proposal-results.md) · [Acoustic pilot](https://github.com/Parusann/Xenolinguist/blob/main/docs/acoustic-results.md) · [Complete benchmark guide](https://github.com/Parusann/Xenolinguist/blob/main/docs/benchmarks.md).

## Verification beyond unit tests

At frozen revision [`00a25d5`](https://github.com/Parusann/Xenolinguist/commit/00a25d525dcc0c713b25ed244e391ad84e1454e8), **Windows and Linux each passed**:

| Unit tests | Tooling checks | Workbench browser checks | Public-page checks |
| :---: | :---: | :---: | :---: |
| **529** | **11** | **56** | **10** |

A separate Windows runner installs the built artifact without a source checkout or Ollama. Acceptance verifies **3,779 packaged files**, real native inference and cancellation, **nine archive round trips**, draft recovery, migrated backups, and strict-offline speech. Another runner upgrades the published v1 installer in an accented path, forces a backend crash, checks 200% keyboard zoom and uninstalls. Downloaded evaluation records replay: **464 per platform**.

Three native unit cases remain environment-gated; installed native execution is required and passed. Known dependency advisories and an intermediate native installer crash remain documented. [Source CI](https://github.com/Parusann/Xenolinguist/actions/runs/38364842606) · [Installer/upgrade CI](https://github.com/Parusann/Xenolinguist/actions/runs/38364842792) · [Permanent evidence and exclusions](https://github.com/Parusann/Xenolinguist/blob/main/docs/verification/w25-release/README.md).

## Explore the code

| Directory | Responsibility |
| --- | --- |
| [`engine/`](https://github.com/Parusann/Xenolinguist/tree/main/engine) | Pure lexical, grammar, induction, number, elicitation and acoustic algorithms |
| [`evaluation/`](https://github.com/Parusann/Xenolinguist/tree/main/evaluation) | Deterministic corpora, independent scorers, baselines, ablations and replay |
| [`shared/`](https://github.com/Parusann/Xenolinguist/tree/main/shared) | Versioned types, schemas and data contracts |
| [`server/`](https://github.com/Parusann/Xenolinguist/tree/main/server) | Authenticated API, revisioned persistence, jobs, proposal validation and archives |
| [`client/`](https://github.com/Parusann/Xenolinguist/tree/main/client) | React workbench, durable save queues, evidence inspectors and audio preparation |
| [`electron/`](https://github.com/Parusann/Xenolinguist/tree/main/electron) | Process lifecycle, restricted IPC, credentials, draft storage and recovery |
| [`cloud/`](cloud/) | Private Atlas API and browser interface, PostgreSQL ownership, versioned uploads, leased comparisons and encrypted recovery |
| [`tests/`](https://github.com/Parusann/Xenolinguist/tree/main/tests) | Browser workflows, packaging integrity and tooling regressions |

Built with **TypeScript, React, Electron, Node/Express, Zod, Vitest and Playwright**, with Ollama, whisper.cpp, eSpeak NG and ONNX/Transformers.js for local inference. [Role-specific source tour](https://github.com/Parusann/Xenolinguist/blob/main/docs/technical-case-study.md).

## Run and reproduce

Use **Node 24**. The commands below run the workbench on `main`. For the source-only Atlas and completed specialist experiment, use `--branch research/decipherment` and follow the [HDD workspace](docs/research-workspace.md) and [Atlas setup](docs/atlas-guide.md) instructions. Manual research and symbolic translation work without Ollama; AI assistance requires a separately installed eligible local model.

```sh
git clone --branch main https://github.com/Parusann/Xenolinguist.git
cd Xenolinguist
npm ci
npm run build:desktop
npm run dev
```

Open the Vite URL and enter the backend's one-time local pairing code. For native audio or Windows packaging, run `npm run provision:models -- --download` to retrieve and verify the pinned assets. `npm run electron:dev` starts the desktop development flow. [Native setup and build guide](https://github.com/Parusann/Xenolinguist/blob/main/docs/desktop-release.md).

```sh
npm run check:source
npx playwright install chromium
npm run test:e2e:run
npm run test:public
npm run evaluate:ci
npm run evaluate:induction -- evaluation
npm run evaluate:numbers -- evaluation
npm run evaluate:elicitation -- ci
```

[Full experiment and replay commands](https://github.com/Parusann/Xenolinguist/blob/main/docs/benchmarks.md) · [Testing guide](https://github.com/Parusann/Xenolinguist/blob/main/docs/testing.md) · [Configuration](https://github.com/Parusann/Xenolinguist/blob/main/.env.example).

## Release, data and scope

**Published candidate:** [1.1.0-rc.1](https://github.com/Parusann/Xenolinguist/releases/tag/v1.1.0-rc.1), Windows x64, unsigned prerelease, published October 14, 2026 from frozen revision `00a25d5`. **Public legacy release:** [v1.0.0](https://github.com/Parusann/Xenolinguist/releases/tag/v1.0.0), June 14, 2026, unsigned. It predates the implementation described here and may automatically attempt a model download. [Compare builds before installing](https://github.com/Parusann/Xenolinguist/blob/main/docs/desktop-release.md).

Projects and recordings are local. After assets and optional models are installed, `--strict-offline` disables downloads, update checks, non-loopback Chromium requests and OS voice fallback. It is an application policy, not a host firewall. The website's dictionary widget runs in the browser without model/API requests. Use **`.xeno` archives** for project backups with recordings; standalone JSON and CSV do not contain the complete project.

The engine supports declared grammar families; the phone model emits approximate English-trained **TIMIT ARPABET**, not universal IPA. Broad linguistic generalization, arbitrary codecs, physical audio-device coverage, human screen-reader certification, exhaustive power-loss recovery and non-Windows native packages are outside the verified scope. [Known limitations](https://github.com/Parusann/Xenolinguist/blob/main/docs/limitations.md) · [Release checklist](https://github.com/Parusann/Xenolinguist/blob/main/docs/release-checklist.md).

## Author and license

**Parusan Natheeswaran** · Copyright © 2026. All Rights Reserved.

This repository is publicly viewable under a **proprietary license**. The [LICENSE](LICENSE) grants no general reuse rights. Third-party software, native assets and the separately licensed acoustic corpus retain their own [licenses and provenance](https://github.com/Parusann/Xenolinguist/blob/main/vendor/THIRD_PARTY.md).
