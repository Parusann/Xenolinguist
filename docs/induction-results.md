# Grounded induction results

The frozen W18 learner at `1cf6e9055a446557edb86f1adf81d1df328b6d03` predicts all 48 regular withheld meanings across 12 evaluation languages. This establishes productive grammar inference within a small supplied-lexicon family. It does not establish autonomous decipherment or natural-language performance.

| Evaluation condition | Memorization | Repaired lookup | Learned rules | Oracle rules |
| --- | ---: | ---: | ---: | ---: |
| Regular concatenative forms | 0/48 | 0/48 | 48/48 | 48/48 |
| Sparse fit evidence | 0/48 | 0/48 | 0/48 | 48/48 |
| Withheld irregular plurals | 0/48 | 0/48 | 24/48 | 24/48 |
| Merged noun forms | 0/48 | 0/48 | 0/48 | 12/48 |
| Whole-form/segmentation ambiguity | 0/48 | 0/48 | 0/48 | 24/48 |

Cells count exactly correct complete semantic trees, with all four withheld items from each language in the denominator. In these runs, non-correct outputs are abstentions rather than answered errors. The 12 languages are the paired experimental units; the conditions reuse those languages, and these 48 items are not 48 independent languages. No calibrated confidence interval or natural-language extrapolation is claimed.

## Inputs and separation

The predeclared [configuration](../evaluation/configs/ablation.json) uses development seeds 100–111 and reserved evaluation seeds 200–211. Dictionary forms are disjoint across the two partitions. In the regular condition, each learner receives seven known lexical anchors, 14 grounded fit observations and six independent validation observations. Four further surfaces combine affixes, adjective placement, negation, tense and reversed semantic roles; their meanings are withheld from the prediction adapter. The learner does not receive the seed, condition name, oracle rules, hidden targets or the generator implementation as data.

Grounding already identifies meanings, lexical references, number, tense and argument roles. Dictionary stems used in withheld forms are known. The task is therefore supervised grammar induction and compositional prediction, not recovery of an unknown lexicon. SVO/SOV/VSO, before/after modifiers, prefix/suffix morphology and adjacent negation are declared candidate families. The synthetic renderer is separate from the workbench's parser and reverse generator.

Candidate extraction and ranking use fit data only. Validation gates the single fit-selected set and requires an improvement from every proposed rule. Validation is available for acceptance, so it is not counted as final test accuracy. The memorization baseline is allowed both fit and validation sentences; none of the test sentences are exact repeats. The repaired lexical baseline uses the actual W16 index and preserves token candidates, but cannot invent a compositional semantic tree. The oracle receives the six generating rules, while still using the same lexicon and parser limitations.

## What the failures show

- Sparse evidence leaves only one supporting stem/predicate, below the predeclared two-stem rule. The learner abstains; the oracle still composes the withheld forms.
- Irregular test plurals use a suppletive form absent from the known rule family. Both learned and oracle rules abstain on those items. Their supported regular predictions remain correct.
- Merged noun spellings create contradictory surface-to-meaning supervision. The learner rejects the inconsistent input rather than manufacturing unique evidence. Even the oracle cannot resolve every lexical collision.
- A whole-word alias competes with productive plural segmentation. The fit-selected grammar fails its conservative per-rule validation gate, so the learner offers no rule package. The oracle answers some unaffected items. This exposes useful capability lost by the all-rules acceptance gate; W20's explicit competing-hypothesis model can address it without hiding the ambiguity.

The method uses approximate bounded beam search and a declared byte-code description-length objective. This is one tested scoring design, not proof of optimal compression, unique linguistic truth or calibrated probabilities. The small diagnostic corpus deliberately isolates failure modes. No local language model is invoked or compared in this experiment; the [W15 model results](evaluation-results.md) remain separate and unchanged.

## Reproduction and retained data

- [Development records and source snapshot](verification/w18-development-results.zip): 60 language/condition records, 960 method/item outcomes.
- [Evaluation records and source snapshot](verification/w18-evaluation-results.zip): 60 language/condition records, 960 method/item outcomes.

Each archive contains `manifest.json`, `records.json`, `summary.json` and source snapshots. The manifest records the frozen commit, configuration, source hashes and artifact hashes. Raw records retain inputs, truths on the evaluator side, predictions/derivations, candidate supports, description lengths, validation ablations, rejected alternatives and abstentions. Both ZIPs were extracted into separate local directories and passed deterministic replay.

From the stated Git revision, install the locked dependencies and run:

```sh
npm run evaluate:induction -- evaluation
npm run evaluate:induction -- verify PATH_TO_EXTRACTED_RESULTS
```

The verifier checks recorded artifact/source hashes, planned cell completeness, dataset regeneration, exact deterministic predictions and summary scoring. Later engine versions may differ; use the frozen revision when reproducing historical results. The snapshots identify the evaluated algorithm; the repository at the stated revision supplies the complete workspace/build environment.

See [grounded induction](grounded-induction.md) for the objective, search bounds and workbench workflow, and [implementation progress](implementation-progress.md) for independent Windows/Linux and installed-app verification. The [retained verification record](verification/w18-grounded-induction.json) includes archive hashes, downloaded CI replays, exact source identities and the initial Windows test timeout with its follow-up correction. The learner and these frozen experiment archives remain at `1cf6e90`; the verification follow-ups change CI worker concurrency, browser fixture archive-cleanup sequencing and test documentation only.
