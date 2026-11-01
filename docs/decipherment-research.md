# Decipherment research

The first two local model studies and their complete replay archives are available in the [baseline report](decipherment-baselines.md).

This research track tests bounded structure recovery and uncertainty handling. It is separate from the released workbench's frozen translation benchmark. It does not yet contain a trained specialist or demonstrate historical decipherment.

## Protocol and corpus

[Protocol v1](../evaluation/protocols/decipherment-v1.md) defines four tasks: segmentation, lexical anchoring, positional symbol correspondence and affix prediction. Each task supplies a finite hypothesis class equally to all learners. Answers can be identified, ambiguous or insufficient under that class.

The deterministic corpus has 144 training episodes from 24 lineages, 48 development episodes from eight other lineages, and 48 reserved episodes from eight further lineages. Related episodes stay together. Final-position replacement and combined prefix/suffix transformations are reserved mechanisms. Structural audits check lineage isolation, duplicate visible problems and mechanism leakage. They do not score a learner on the final split.

Four separately authored controls include Chinese characters, unanchored vocabulary, positional ambiguity and ambiguous inflection. Their expected answers are written directly, then checked against the exhaustive reference implementation. These are software controls, not independent linguistic expert validation.

Learner inputs contain only evidence, queries and declared budgets. Truth, split, lineage, seeds and source paths remain evaluator-owned. Local archive files are not a security sandbox against their owner. The reference solver must never be offered as a learner tool.

## Reproduce on the research HDD

After the [workspace setup](research-workspace.md):

~~~powershell
pwsh -NoProfile -File scripts/research.ps1 -Action check
pwsh -NoProfile -File scripts/research.ps1 -Action corpus
~~~

The second command audits all split definitions, then exports only train and development beneath the configured HDD results directory. Each contains separate learner and scorer directories, independent controls, byte hashes and a manifest. Controls remain evaluation-only, including the controls directory bundled with a training export. Never include controls, development, scorer files or reserved data in model training or retrieval.

For an existing export:

~~~powershell
. ./scripts/research-env.ps1
& $ResearchWorkspace.Node node_modules/tsx/dist/cli.mjs evaluation/src/decipherment/cli.ts verify <archive-directory>
~~~

Verification checks every scheduled file, hashes, strict contracts, learner projection and exact deterministic regeneration. Missing, changed or duplicate entries fail. New exports refuse overwrite. Hashes detect changes; they are not digital signatures. The manifest records the source commit and tracked changes; reproducible evidence runs should use a clean committed checkout.

Reserved material is not exported through the ordinary CLI. Public generator source can reconstruct it, so this is an operational holdout, not a secret benchmark resistant to deliberate contamination. Numerical model gates must be frozen before any reserved learner evaluation.

## Current limits

The corpus is a small, inspectable pilot using narrow rule classes. A solver specialized to these supplied classes may perform perfectly without understanding natural language. More lineages alone do not create more linguistic diversity. Natural-language data need separate source permissions and family-aware evaluation; raw resemblance cannot establish ancestry. Model comparisons and local training feasibility remain subsequent milestones.

## Licensed reference pilot

The [WOLD pilot](../evaluation/fixtures/reference/wold-pilot/NOTICE.md) retains 70 forms across six languages and eleven concepts from Lexibank WOLD v4.2, under CC BY 4.0. Each row retains its source ID, vocabulary citation, concept mapping, borrowing annotations and original source fields. All synonyms in the selected cells are preserved. This is an ingestion/reference fixture, excluded from synthetic scoring, training and reserved evaluation. Six different source family labels do not establish representative coverage of linguistic structures.

The source lock pins eight upstream files to commit 1df62b9bdc7292b35982aea49b4d5bd1951f6f3e and SHA-256 hashes. Download those named files from that revision to an HDD directory, then regenerate without network access:

~~~powershell
. ./scripts/research-env.ps1
& $ResearchWorkspace.Node node_modules/tsx/dist/cli.mjs evaluation/src/decipherment/wold.ts <source-directory> <new-output-directory>
~~~

The importer fails on changed upstream bytes or missing selected cells. It writes an explicit selection/transformation manifest and preserves upstream licenses. The retained fixture's files are hash-checked in the research suite on both supported CI platforms.

The separate importEvidence API accepts CSV columns or JSON fields id, form, optional meaning and annotations. Plain text creates one sample per nonblank line. Imports are bounded to 2 MiB and 10,000 records; duplicate IDs, unknown fields and malformed CSV fail. NFC normalization retains originalForm. Ingestion itself grants no sharing or training permission and does not create scored linguistic truth.

## Baseline study

~~~powershell
pwsh -NoProfile -File scripts/research.ps1 -Action decipherment-controls
# Requires the separately started local research runtime and installed model:
pwsh -NoProfile -File scripts/research.ps1 -Action decipherment-model
~~~

The model command uses the local service on port 11435 and qwen3:4b-instruct-2507-q4_K_M. It does not start a server or download a model. The service must use the HDD model directory and OLLAMA_NO_CLOUD=1. Every inference checks local model metadata and the pinned digest before and after the request. The initial comparison uses the unmodified 4-bit quantized distribution; it is not an unquantized foundation-model measurement.

All 48 development episodes and four independent controls are scheduled. Exact lookup, simple surface heuristics, model-only and the same model with hypothesis checks receive the same visible evidence and rule priors. Model tracks share a total budget of 2,048 generated tokens, 90 seconds per episode, 8,192 context tokens, temperature zero and seed zero. Up to eight tool checks consume that total budget. A check tests one proposed hypothesis against visible evidence and cannot enumerate evaluator truth. No shell, filesystem or network tools are exposed to the model.

Method order rotates by episode, calls are serial, and cold-load time is retained. Output records preserve invalid responses, tool errors, timeouts and runtime errors. The runner writes its entire schedule before inference, refuses overwrite, retains source snapshots and raw model calls, then independently replays scores and model action traces to verify the report. Interrupted archives remain incomplete and cannot be presented as completed studies.

~~~powershell
. ./scripts/research-env.ps1
& $ResearchWorkspace.Node node_modules/tsx/dist/cli.mjs evaluation/src/decipherment/study.ts verify <study-directory>
~~~

Reports separate development from controls, with task, mechanism, truth-state and lineage breakdowns in summary.json. Latency and token use are measured; Node RSS is a post-episode sample, not peak GPU memory. The model-allocation snapshot is likewise not a peak-memory measurement. The existing translation engine is measured by the original baseline command under its own supplied-grammar contract, rather than assigned fabricated predictions for unsupported new tasks.
