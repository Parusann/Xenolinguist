# From notebook to testable linguistic workbench

Author: Parusan Natheeswaran

The most defensible story in Xenolinguist is the separation of a plausible interpretation from a reproducible result. The implementation turns a six-panel exploration interface into a system where data survives interruptions, rules can execute, model suggestions can fail validation, and benchmarks preserve unsuccessful attempts.

## Situation

The initial review reproduced lost drafts, concurrent-write hazards, Unicode lookup failures and a packaged phone-runtime failure. The UI could present assertions and model output without a reliable computational route from observation to meaning. A polished interface alone could not establish that a proposed grammar worked.

## Task

Build a local Windows workbench with recoverable data, bounded native and model execution, source-linked symbolic derivations and reproducible evaluations. Keep the public installer distinct from newer implementation code, and distinguish manual beliefs from empirical accuracy.

## Action

The storage boundary now validates full nested schemas and identifiers, serializes revision-checked mutations, deduplicates retry IDs and preserves previous snapshots and original migration bytes. A per-profile durable queue retains failed edits and text/audio drafts. Portable `.xeno` archives validate hashes and references before restoration. Crash recovery retains local work before rotating the backend origin and credential.

The computational layer adds Unicode-aware lexical indexes, typed morphology, bounded span-chart parsing, semantic-role trees, reverse generation, grounded rule search, arithmetic grammar enumeration and finite-candidate query selection. These components are executable TypeScript modules with explicit bounds and adversarial/negative cases. A derivation names the input spans and rules responsible for its answer.

Local AI runs through model capability checks and cancellable jobs. The research loop retrieves bounded source spans, records tool calls, validates typed proposals and requires explicit review. The model cannot directly write profile files, author benchmark truth, or convert its own confidence into measured support. Phone and transcription results retain model/audio identities separately from manual corrections.

Evaluation uses frozen source, versioned corpora, disjoint lexical seeds, independent oracle renderers, declared information budgets and retained raw attempts. The comparisons include memorization, exact lookup, supplied grammar, no-rule, model-only, hybrid, random-question and fixed-curriculum controls where appropriate. Claims are limited to each experiment's supplied hypothesis family.

## Result

- **Reliability:** independent installed Windows acceptance verifies payload hashes, native execution, cancellation, drafts and archive restoration. A separate candidate gate exercises upgrade from the checksum-pinned v1.0.0 installer, migration failure and uninstall. See the final retained release evidence for actual gate outcomes.
- **Symbolic composition:** the frozen W15 constrained learner reaches 150/150 withheld meanings at 29 observations; model-only reaches 0/300 and the successful hybrid makes zero model calls at that budget. This supports a supplied-grammar composition result, not an AI quality win.
- **Grounded learning:** regular reserved affix cases reach 48/48; sparse evidence reaches 0/48 and hidden irregular plurals only 24/48. The failure conditions prevent the success from being read as general decipherment.
- **Model proposals:** the W21 pipeline has zero application-eligible reserved proposals. Valid citation offsets do not imply evidential support. Blocking those proposals is useful system behavior; linguistic-quality improvement remains unproved.
- **Acoustics:** the 24-recording English pilot retains 29.72% evaluation phone error rate and 33.33% word error rate, including three recurring transcription failures. Approximate frame bins remain unsuitable as exact phonetic boundaries.
- **Responsiveness:** the measured 10,000-record vocabulary view opens in 261 ms versus 5,998 ms before W24. Sample editing falls from 857–982 ms to 102–196 ms. Small-profile startup regresses, and the original 100 ms editing budget remains unmet at 10,000.

These are separate datasets and denominators, not a combined project accuracy score. [Benchmarks](benchmarks.md) supplies exact sources, scope and commands.

## What to inspect in an interview

For software engineering, start with a [sealed mutation and recovery test](../client/src/stores/save-queue.test.ts), [atomic file handling](../server/src/services/atomic-file.ts) and the [independent installed harness](../scripts/verify-release.mjs). Discuss why an acknowledgment, a durable draft and a committed mutation are different states.

For applied AI, inspect [proposal validation](../server/src/services/proposal-validator.ts), [the frozen comparison](proposal-results.md) and the job cancellation path. Discuss why correct JSON and accurate references still fail to establish a supported rule, and why the failed generations remain in the report.

For research engineering, inspect [typed parsing](../engine/src/grammar/parser.ts), [description-length search](../engine/src/induction/mdl.ts), [query selection](../engine/src/elicitation/select.ts) and the independent scoring corpus. Discuss supplied priors, seed versus structural independence, abstention, hidden irregularity and selection-validation leakage.

The next research step is jointly evaluating candidate generation and question selection on newly reserved structural families, then testing evidence-quality checks beyond citation geometry. The next performance step is moving large draft validation off the UI thread without weakening close/restart durability. Those are future improvements, not completed release features.
