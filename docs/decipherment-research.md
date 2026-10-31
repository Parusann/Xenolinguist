# Decipherment research

This research track tests bounded structure recovery and uncertainty handling. It is separate from the released workbench's frozen translation benchmark. It does not yet contain a trained specialist or demonstrate historical decipherment.

## Protocol and corpus

[Protocol v1](../evaluation/protocols/decipherment-v1.md) defines four tasks: segmentation, lexical anchoring, positional symbol correspondence and affix prediction. Each task supplies a finite hypothesis class equally to all learners. Answers can be identified, ambiguous or insufficient under that class.

The deterministic corpus has 144 training episodes from 24 lineages, 48 development episodes from eight other lineages, and 48 reserved episodes from eight further lineages. Related episodes stay together. Final-position replacement and combined prefix/suffix transformations are reserved mechanisms. Structural audits check lineage isolation, duplicate visible problems and mechanism leakage. They do not score a learner on the final split.

Four separately authored controls include Chinese characters, unanchored vocabulary, positional ambiguity and ambiguous inflection. Their expected answers are written directly, then checked against the exhaustive reference implementation. These are software controls, not independent linguistic expert validation. Real-language reference imports are a separate M2 deliverable.

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
