# Number grammar results

The W19 implementation at `53ce34bd0612bec84f9734f84931fbdcb79ce195` predicts all 252 regular withheld forms in its reserved synthetic evaluation partition. It also makes 84 wrong predictions when those target forms are replaced by unknown irregular forms. Both results matter: the engine composes within its declared family, but cannot know an unseen exception from regular evidence alone.

| Evaluation condition | Target forms | Correct | Wrong answers | Abstentions | Memorization correct |
| --- | ---: | ---: | ---: | ---: | ---: |
| Regular composition | 252 | 252 | 0 | 0 | 0 |
| One productive fit comparison | 252 | 0 | 0 | 252 | 0 |
| One withheld irregular target per system | 252 | 168 | 84 | 0 | 0 |
| Duplicate integer labels | 252 | 0 | 0 | 252 | 0 |

Each condition uses the same 84 parameter combinations: seven bases (2, 3, 4, 5, 10, 20, 36), two arithmetic families, two ordering variants and three joins. Each system has three final target integers. Conditions are paired; they are not 336 independent languages. Development and evaluation have disjoint lexical seeds but share the declared family and experimental design. No confidence interval, natural-language extrapolation or universal base-identification claim is made.

## What the learner receives

The [configuration](../evaluation/configs/numbers.json) declares development seed 301 and evaluation seed 401. Each expands deterministically into 84 distinct lexical seeds. Primitive fit mappings include values 0 through the candidate system's true base; several further composed mappings supply evidence. The independent renderer withholds `3B` and `3B+1` for selection validation and `4B+1`, `5B+1`, `6B+1` as final prediction targets. Fit values are deduplicated and filtered to prevent overlap, including in base 2. Sparse conditions keep only the primitive forms and one productive fit comparison.

The learner receives only fit/validation integer-form pairs and case policy. It does not receive the generating base, arithmetic family, ordering, join, seed or final target forms. Those remain on the evaluator side of the retained records. Validation ranks candidates and therefore is not counted as final test accuracy. The exact memorization comparison may use both fit and validation observations; final target integers are new, so lookup cannot answer them. No language model is called.

Grounding already supplies integer meanings and primitive number words. The experiment measures productive composition under a known family prior, not discovery of number meanings from raw audio or unconstrained decipherment. The renderer is separate from the engine's arithmetic-tree generator. The old W15 experiments and W18 grammar-induction results remain unchanged.

## Failures and ambiguity

The sparse case demonstrates the one-comparison safeguard: stored atoms and repeated observations cannot turn a single compound into sufficient productive support. Duplicate labels map one normalized form to different integers, and the engine conservatively rejects that ambiguous input.

The irregular condition changes one final target per system to a previously unseen suppletive form. All leading candidates agree on a regular form, so the engine emits it. That prediction is **wrong**. Candidate consensus is not calibrated confidence, and passing validation cannot rule out future exceptions. These 84 errors remain in the denominator and raw records. Known irregular observations remain stored mappings; discrepancies against productive rules appear as contradictions rather than being silently absorbed as new productive atoms.

Separate regression tests retain bases with identical observed forms, untested multiplication alternatives and missing-atom failures. Ranking can prefer a base because it explains more observations productively; larger bases may store those same forms as atoms. Lower-ranked candidates remain inspectable. A disagreement question can distinguish leading grammars, but a bounded search that finds no such question does not prove equivalence. See the [number grammar contract](number-grammar.md) for the exact ranking and limits.

## Retained data and reproduction

- [Development archive](verification/w19-development-results.zip): 336 language/condition records and 1,008 target outcomes.
- [Evaluation archive](verification/w19-evaluation-results.zip): 336 language/condition records and 1,008 target outcomes.

Both archives contain the run manifest, source/config/lock snapshots, complete raw records and condition summaries. Records retain the independent generating specification on the evaluator side, actual learner inputs, candidate grammars, fit and validation rows, complexity counts, leading alternatives, target truths, predicted forms, arithmetic trees and failures. Each ZIP was extracted separately and passed deterministic replay.

At the recorded Git revision, install the locked dependencies and run:

```sh
npm run evaluate:numbers -- evaluation
npm run evaluate:numbers -- verify PATH_TO_EXTRACTED_RESULTS
```

The verifier checks artifact/source hashes, the complete planned set of cells, dataset regeneration, exact candidate/prediction replay and summary counts. Later algorithms may differ; historical reproduction requires the frozen revision. Source snapshots identify the algorithm, while the Git revision provides the complete workspace/build environment.

[Implementation progress](implementation-progress.md) records independent Windows/Linux source and installed-app acceptance. The [verification record](verification/w19-number-grammar.json) retains exact revisions, hashes, downloaded experiment replays, test counts and application identity. Source-level unit skips and existing native dependency audit findings remain explicit.
