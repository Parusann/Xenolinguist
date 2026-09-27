# W21 proposal comparison protocol

Status: design for the remaining W21 experiment. No comparison has run and no superiority claim follows from this document. Freeze the corpus, adapters, prompts, parsers and scoring tests in a source commit before generating reserved evaluation outputs. The existing one-case model integration checks are not this experiment.

## Question and conditions

Measure whether bounded retrieval, typed proposals and deterministic tool feedback improve usable, evidence-linked hypotheses over the previous workbench prompts. Keep observation identities, supplied lexical anchors, supported engine family and model digest fixed across paired conditions.

Use three conditions so schema compliance is not confused with linguistic improvement:

1. **Legacy workbench prompting.** Freeze the pre-W21 `patternAnalysis` and `grammarInference` prompts and their dictionary/sample/rule formatters from revision `d99cf684319b4d16b3d54c2e4b8bb66546302147`. Retain their original prose output instructions. This is the product baseline; it has no executable-output contract or exact observation-ID formatter.
2. **Contract-only control.** Give the same observations and anchors with IDs, one typed final-proposal schema, and no retrieval/tool iterations. This separates the contribution of a machine-readable contract from the larger pipeline. Name it as an adapted baseline, never as the unchanged legacy UI.
3. **W21 pipeline.** Use the actual bounded retrieval, structured action loop, one repair, server citation checks and supplied-target tests. Do not substitute a benchmark-only reasoning implementation for the shipping runner.

Legacy prose is not automatically invalid because it lacks JSON. Report compliance with its own requested sections separately from executable proposal availability. A common, frozen conservative extractor may map an unambiguous explicit claim into the supported representation; retain the exact text span and extraction rule. Ambiguous/unmapped claims abstain. No second model, hand correction after seeing a target, or favorable selection among alternatives may convert prose into a prediction. Report extraction coverage alongside scores. Contract-only and W21 outputs share the strict proposal parser and deterministic validator.

## Corpus and separation

Create small synthetic languages covering lexical senses and typed affix/order hypotheses that the current engine can execute. Include regular contrasted evidence, sparse or conflicting evidence, and withheld irregular counterexamples. Ground-truth source annotations must say which observation actually supports or contradicts each candidate; an exact but irrelevant quotation is not positive semantic evidence.

Separate development and evaluation seeds before prompt/parser tuning. Each case has:

- A visible profile containing supplied lexical anchors, captures, annotation IDs and fit examples.
- Visible selected validation examples with supplied targets, accessible to every condition. These are feedback data, never held-out results.
- A reserved challenge set with target meanings held only by the scorer. Do not put those targets into profile samples, retrieval, tool results, query text, source notes or prompt histories.
- A candidate-independent relevance map and family metadata used only for scoring.

Audit leakage using adversarial sentinel targets and hash the exact model-visible payload for every call. Freeze fixture construction and expected engine derivations before reserved model runs. Keep previously published W15/W18/W19 datasets and results unchanged; this is a separate proposal experiment with its own declared grammar prior.

## Metrics and denominators

Report all scheduled tasks, including timeouts, transport errors, malformed responses, refusals, requested observations and abstentions. Never discard failures from the denominator.

| Measure | Definition |
| --- | --- |
| Format compliance | Output obeys the condition's original contract; report prose-section compliance separately from typed-schema compliance. |
| Executable proposal coverage | Fraction of all tasks producing one unambiguous executable candidate through the frozen parser/extractor. Observation requests are separately counted. |
| Reference integrity | Valid current observation IDs, annotation IDs, exact spans and quotes divided by all emitted citations. Report absent citations separately; undefined precision is not 100%. |
| Evidence precision | Citations marked relevant to the candidate by the frozen ground-truth map divided by scored citations. Separate supporting, contradictory and irrelevant references. |
| Visible compatibility | Independent replay against the visible selected targets, including regressions and unresolved cases. This is not held-out accuracy. |
| Held-out performance | Correct controlled-English meanings on reserved challenges divided by all scheduled challenges. Separately report wrong predictions, unresolved results and abstentions, plus accuracy conditional on predicting. |
| Invalid-output rate | Malformed typed outputs for typed conditions; unparsable/ambiguous executable claims for legacy prose are a distinct metric. Also report invalid citations and invalid rules separately. |
| Cost | Wall time, calls, repairs, tool actions, provider token counts when available, declared ceilings and cancellation/deadline outcomes. Missing token counts remain unknown. |

Evaluate candidate changes on a private copy of the visible profile, never through acceptance into a user's workspace. Score the final retained candidate or observation request, not the best intermediate attempt. A final request may be a sensible abstention but earns no correct executable prediction. Keep semantic score definitions separate from confidence; no probability calibration is claimed.

## Runtime and replay

Pin the local model digest and runtime version. Record CPU/GPU/memory, cold/warm protocol, seed, temperature, context/output budgets and exact prompts. Predeclare paired condition order and repetitions; use the same order rule across every case. Report per-condition resource limits, because W21's tool loop uses more calls than a one-shot prompt. Include a one-shot contract-only comparator rather than suggesting that unequal budgets isolate tool effects perfectly.

Retain source snapshots, configuration/corpus hashes, requests, responses, typed actions/results, output extraction traces, timings and every failure. Do not retain private chain-of-thought. A deterministic replay command must re-run extraction, citation/relevance scoring, candidate validation, held-out derivation and summary aggregation without another model call, detect tampered records and refuse to overwrite an existing run.

Before reserved runs, test fabricated IDs, exact-but-irrelevant quotes, contradictory citations, leaked target sentinels, unavailable evidence, unsupported rules, output truncation, cancellation, repeated tool loops and interrupted/resumed experiment bookkeeping. A completed case may be reused only when its input/configuration/model identities match exactly; a retry is an additional retained attempt, not a replacement for a failure.

## Completion record

Publish paired case-level outcomes and denominators, examples of both improvement and failure, raw downloadable archives and replay instructions. State the finite grammar prior, supplied anchors, synthetic domain, parser coverage, sample size and any runtime imbalance. Explain whether improvements came from syntax enforcement, evidence selection or successful held-out semantics. W21 remains in progress until this experiment is implemented, frozen, run and independently replayed.
