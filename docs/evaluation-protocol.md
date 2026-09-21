# Baseline evaluation protocol

W15 adds an offline research harness. It does not change the workbench translator or claim that a general language learner has shipped. The frozen W14 corpus supplies executable ground truth; adapters receive only observations and query surfaces. [Deterministic compiler](deterministic-compiler.md) describes the corpus and its limits.

## Reproduce an experiment

Use the locked Node installation (`npm ci`), Python 3.13 with `python -m pip install -r evaluation/requirements.txt`, and a running local Ollama service with the configured model already installed. The runner never downloads models. `EVALUATION_PYTHON` can select another Python executable. The configured loopback-only Ollama endpoint follows the existing `OLLAMA_BASE_URL` setting; remote-backed and embedding-only models are rejected.

```sh
npm run evaluate:ci
npm run evaluate -- evaluation/configs/development.json
npm run evaluate:full
npm run evaluate -- evaluation/configs/structural.json
npm run evaluate:verify -- test-results/evaluation-baseline-TIMESTAMP
```

`evaluate:full` runs all four methods on 30 evaluation languages, at observation budgets 8, 16 and 29, with two model sampling seeds. It writes 540 batch records, a report, summary statistics and SVG/PNG figures in a new directory. The separate structural command evaluates the deterministic methods on 30 VSO languages (180 records); it is not a second LLM comparison. CI runs two development languages without Python or Ollama. Development probes are smoke tests, not comparative evidence. A second positional argument selects a new output directory; existing directories are never overwritten.

For a new model, copy and name a configuration before running it. Fix all settings and adapter code using development data. Do not change prompts, adapters, corpus generation or the evaluation configuration after inspecting evaluation scores. Any necessary correction must be versioned and the earlier experiment retained. Never select a best repetition or remove invalid answers. A model change is a new experiment, not a replacement of poor results.

## Information and computation budgets

Every method receives the same ordered prefix of paired utterances, controlled English and semantic scenes, plus five challenge surfaces and nine lexical query tokens. Query tokens are sorted by their alien spelling, not by English meaning. No challenge answers, seed, full lexicon, language parameters or corpus hashes enter an adapter. Each method starts from a fresh input copy at each budget/repetition; no across-language memory or adaptive query selection is used.

The runner/scorer owns private datasets. Learner modules have no imports from the generator, scorer or filesystem. This is an auditable software boundary, not a sandbox against malicious code or an operator with repository access. The synthetic grammar and generation source are public; these languages are not a contamination-proof external benchmark.

All methods have the same **supplied grammar prior**: a one-to-one token lexicon, the semantic noun/action/attribute domain, entity bracketing, plural/tense/negation/conjunction markers, alphabetical attribute order, prefix numeral arithmetic, three candidate clause orders, two adjective placements, and four possible bases. These assumptions were designed with knowledge of the generator. Learned parameters are the selected clause order, adjective placement, base, and observation-supported token bindings. No manual language-specific rules or true dictionary entries are supplied. No oracle-rule result is reported as a learner.

The symbolic method searches 24 structural hypotheses. The LLM sees the same prior in its system message; it is not given a solver or hidden tools. LLM-only and hybrid have at most one local generation request per language/budget/repetition, the same context/output/time limits, temperature and sampling seed. Hybrid can consume less compute when symbolic consensus already answers all probes. This matches information and maximum inference budgets, not FLOPs or implementation sophistication. The hybrid's additional computation derives entirely from permitted observations and is its explicit treatment difference.

Baseline configuration: `gemma4:e4b` (the application's default), temperature 0.2, context 8,192 tokens, output cap 2,048 tokens, 90-second request deadline, model seeds 41 and 42, thinking disabled, JSON mode. No retry or corrective prompt is used. The exact installed digest is checked before and after inference and pinned against experiment preflight. Model weight size, capabilities, Ollama version, prompt/output token counts, load/inference durations and raw text are retained when returned by the daemon. Sampling seeds are not language seeds. Hardware and software can still change generated text despite matching seeds.

## Adapters and ablations

| Method | Computation | Limits |
| --- | --- | --- |
| `exact-lookup` | Freeze the forward token cleaning, case matching and gloss assembly from workbench revision `621eebc`; grant only unanimous token bindings inferred by the symbolic method. | A controlled composition ablation, not a simulation of a human-built dictionary. Word glosses have no semantic tree, so semantic predictions abstain. The existing Unicode bug is intentionally preserved for W16. The ASCII synthetic corpus cannot measure its repair. |
| `symbolic` | Align public semantic templates with observation tokens; eliminate inconsistent hypotheses using bijective lexical unification. Decode with surviving hypotheses and answer only on complete unanimous agreement. | Generator-informed hypothesis class; does not discover arbitrary grammar or resolve noisy/ambiguous languages. Unknown tokens or disagreeing hypotheses produce abstention. No scorer/compiler parser is called. |
| `llm-only` | One stateless local generation from the public prior and observations, returning lexical bindings and semantic trees. | Prompted inference without solver hints, fine-tuning, tools, repair or extra demonstrations. Format errors are measured separately. |
| `hybrid` | Use symbolic consensus first; when probes remain unresolved, give the model the same observations plus inferred hypotheses. Preserve symbolic answers and fill unresolved probes from the model. | Model fallback is not a logical proof and can hallucinate. No model call occurs when consensus covers every probe. Report actual call counts so symbolic-only success is not credited to AI. |

Exact lookup versus symbolic isolates composition while holding the inferred dictionary mechanism constant. Symbolic versus hybrid measures the effect of model fallback. LLM-only versus hybrid measures the addition of the constraint solver. These are software ablations under strong common priors, not a universal model ranking. VSO is held out from the evaluation/development **split assignments**, but is in the supplied hypothesis class and exercised in development-seed unit tests; the structural check is not discovery of an unseen grammatical formalism.

## Scoring

- **Lexical accuracy:** exact English atom for each of nine noun/action/attribute tokens. All nine count at every budget, including atoms absent from a shorter observation prefix. Structural markers/digits are not silently included in this metric.
- **Semantic accuracy:** exact canonical semantic tree for each of five withheld compositions. Object property order and attribute order do not matter; entity roles, counts, action, tense, polarity and ordered clauses do. No partial credit or general paraphrase judgment.
- **Withheld forms:** the semantic subset containing at least one entity count absent from the full 29-observation training corpus. This tests numeral extrapolation within the supplied arithmetic prior. It is not an independent item set and does not measure arbitrary morphological generalization.
- **Coverage:** schema-valid answered items divided by all items. Selective accuracy (correct/answered) is supplementary. Abstentions, invalid output, errors and timeouts stay in the main denominator and are counted separately. Missing/duplicate target IDs and invalid semantic trees are invalid, never silently dropped.
- **Observations consumed:** the full supplied prefix, recorded by IDs and count. A method may ignore examples internally; the runner does not claim to measure attention or reading.
- **Performance:** wall time per language batch, including induction, metadata probes and local generation. All probes in a batch share this measured duration; no invented per-item latency. Method order rotates by language index/repetition. Warm caches and cold model loads are retained, not normalized away; latency comparisons remain machine-specific.
- **Uncertainty:** average repetitions within each language, pair methods by language, and bootstrap language-level accuracy differences using 2,000 deterministic resamples and percentile 95% intervals. Do not treat repeated model outputs or five related challenges as independent languages. Degenerate intervals can occur for identical outcomes and do not prove zero population uncertainty. Development subsets do not support inferential claims.
- **Calibration:** none of these baselines declares probabilities. Calibration figures are unavailable; rule support, hypothesis counts and user confidence are not treated as probabilities. The calibration utility rejects missing/out-of-range declared probabilities and computes Brier score/bin summaries only for an explicit probability-of-correctness contract.

## Result provenance and failure handling

`manifest.json` records the configuration/hash, frozen split hashes, engine version, source commit, tracked dirty state, exact source snapshot hashes, environment, preflight model identity, completion state and artifact hashes. New source files are included in the snapshot even before they are tracked. `source/` retains runner, adapter, compiler, configuration and relevant dependency sources plus the lockfile. A dirty-source result is identified by its snapshot, not represented as a clean commit result.

`runs.jsonl` is appended after every completed batch and contains the exact allowed input, its hash, observation IDs, split/seed/dataset hash (runner metadata only), repetition, predictions/statuses, model transcript/provenance, timing, scorer-only answers and per-item outcomes. Treat the combined result file as an evaluation archive, never as learner training input. A failed request produces scored error/timeout entries. An interrupted process retains completed rows; only a finished experiment has manifest status `complete`. This status means the planned experiment finished, not that its model predictions succeeded. A process killed without cleanup may leave status `running`; that is not a completed run either.

`summary.json`, `report.md` and figures derive from raw rows. Figures show semantic accuracy against observation count/coverage, batch-latency distributions and method ablations. Paired intervals and failure counts remain in the numerical summary. Python/Matplotlib versions are recorded. `evaluate:verify` checks artifact/source hashes, corpus identity, exact planned cells, allowed input projections, observation IDs, model seeds, per-item scoring and summary replay without calling a model. Hashes detect changed retained artifacts; they are not signatures from an independent auditor.

A report can be regenerated with `npm run evaluate -- --report RESULT_DIRECTORY`; use the matching source snapshot. Changed report bytes need a newly recorded experiment or evidence manifest rather than silently replacing published hashes. Preserve raw failures and old configurations alongside any corrected run.

## What this package does not establish

No natural-language benchmark, calibrated confidence, noise robustness, neural training result, broad model selection, production solver integration or improved Unicode support is claimed. W16 onward can reuse these frozen inputs and budgets. Broader structural priors, mixed-script fixtures, ambiguous/noisy observations, stronger model prompting and a separately governed unseen corpus require distinct versioned experiments.
