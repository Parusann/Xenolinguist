# Grounded rule induction

W18 learns a bounded concatenative grammar from supplied lexical anchors and human-grounded observations. It proposes executable W17 rules without receiving a hidden rule inventory. It does not infer arbitrary meanings from English translations or raw audio, and it is not unrestricted decipherment.

## Workbench flow

1. Save observations in Samples and define the known dictionary stems/senses. Clauses require explicit verb argument frames.
2. Open Grammar, then **Assign a known meaning** in **Learn from grounded observations**. Choose a saved sample, noun phrase or clause, and known semantic roles. The first explicit lexical sense is used; create separate entries for other senses. The current form applies plurality/adjective to a noun phrase or a clause object, with singular subjects. The engine contract supports modifiers on either role.
3. Mark observations as **Fit rules** or **Validate unseen forms**. Two distinct fit observations across two known stems/predicates are required for each candidate. For example, singular/plural contrasts for `nesh` and `kor` can support suffix `-en`; a distinct plural using `tal` can validate it.
4. Run induction. A cancellable worker keeps search off the renderer thread. Review the proposed rule set, validation counts, top alternatives, support/contrast IDs and rejection reasons.
5. Accept the proposal explicitly. Acceptance saves all new rules in one revisioned profile edit with captured grounding and validation evidence. Dismissal does not change the grammar. Changing samples, dictionary, grammar, policy or groundings invalidates an outstanding proposal.

The grounding draft survives navigation/reload through the existing profile draft store. It is not an archived first-class annotation record yet. Accepted rules and their textual evidence are archived; restored entry/sample IDs may differ, so captured IDs in these evidence strings are historical labels, not live links. W20 will add versioned evidence entities and dependency invalidation. Existing manual rules remain and can conflict with accepted rules; Translation exposes resulting ambiguity.

## Candidate extraction and alignment

`engine/src/induction/affixes.ts` compares observed tokens with known stems under the profile NFC/case policy. Plural candidates need a plural-grounded occurrence and a singular-grounded occurrence containing that same bare anchor. Past/future candidates similarly require a present-tense occurrence of the same verb. The engine enumerates nonempty prefix/suffix residues and counts distinct supporting observations and anchored stems. This is lexical supervision: a known bare form is an input, not an inferred discovery. Infixes, allomorphy, tone and unknown stem meanings are unsupported.

`word-order.ts` aligns known subject, predicate and object anchors by their positions rather than copying English word order. Candidates cover SVO/SOV/VSO, before/after adjective placement and adjacent negation. Negation discovery requires a grounded positive/negative pair differing by one token next to the same known verb. Structural candidate discovery currently needs uninflected anchor occurrences; it does not jointly discover an entirely unanchored lexicon. For one-argument clauses SVO and SOV both yield SV, so a single canonical SVO representative is retained.

Identical normalized surfaces with identical meanings contribute once. Duplicate source IDs, contradictory meanings for one surface, or any normalized surface appearing in both fit and validation are rejected. A candidate must have at least two distinct fit supports and two anchored stems/predicates. These thresholds are protocol rules, not probabilities or guarantees of correctness.

## Description length and bounded search

All coding costs live in `engine/src/induction/mdl.ts`, versioned with `grounded-induction-1`:

- A positive integer length uses Elias gamma length `2 floor(log2(n)) + 1` bits.
- A literal string uses its UTF-8 bytes plus the gamma-coded byte length.
- The fixed supplied lexicon is encoded once; each selected typed rule adds its canonical serialized literal cost.
- An unexplained observation encodes a flag, the full surface and its grounded meaning as an exception.
- A correctly explained observation encodes a flag, token count, uniform dictionary/rule references and its minimum segmentation cost.

`alignments.ts` uses dynamic programming over original grapheme boundaries. States track whether a lexical stem has been consumed, with prefix/suffix transitions and literal fallback. This supplies minimum-cost morphological segmentation under the current inventory. Complete correctness is checked independently by the W17 parser and exact semantic-tree comparison, preserving subject/object roles. Multiple derivations with the same meaning may agree; competing meanings do not count as a correct explanation.

`candidate-search.ts` explores compatible rule subsets in a deterministic beam. It retains at most one rule per feature slot (plural, each tense, adjective order, negation and each clause arity). The initial empty-rule model competes with every visited model. Ranking uses fit observations only. Equal-cost leading sets remain ambiguous. Beam pruning can miss a globally optimal combination; no global-optimality claim is made.

Bounds: 48 fit and 48 validation observations, 128 dictionary entries, 16 tokens per observation, 64 characters per anchor/token, eight aliases/senses per anchor, 32 supported candidates, beam width 12, six search depths and 600 scored sets. W17's own parse limits also apply. The UI terminates its worker after 15 seconds and supports cancellation/unmount cleanup. Search-limit outcomes never offer partial rules for acceptance.

## Validation gate

After fit selection, validation never reranks candidate models or generates candidates. The selected set must improve exact semantic predictions over the empty-rule baseline without regressing any baseline-correct item. Removing each proposed rule must individually reduce validation correctness. Thus a rule with no independent validation benefit is not offered for acceptance, even if it fits training examples. This conservative all-rules gate can reject a partly useful grammar. Sparse, ambiguous and unsupported cases are retained as failures/abstentions.

Validation is part of model acceptance and is not the final test set. The evaluation harness uses an additional withheld partition that the learner sees only as surfaces/IDs for prediction. Interactive users can repeatedly revise their validation examples; such sessions do not constitute a blind scientific evaluation.

## Separate reproducible experiment

`evaluation/configs/ablation.json` declares 12 development seeds (100–111), 12 evaluation seeds (200–211), five conditions and four methods. `grounded-affixes-1` has its own independent surface renderer; the learner receives known dictionary anchors, 14 fit observations and six validation observations in the regular condition. Four further withheld items combine plural, tense, negation, adjective placement and reversed semantic roles. The known lexicon includes stems used in withheld forms; the experiment measures grammar generalization with lexical supervision. Development/evaluation lexical forms are disjoint, while the same declared rule families occur in both.

Methods are exact observed-sentence memorization (allowed fit and validation observations), the actual repaired W16 lexical index with no compositional rules, learned typed rules, and an oracle using the six generating rules. The lexical baseline retains token candidates; it can only assign a full meaning to an exact single nominal and does not invent clause roles. The oracle knows the supported rule inventory, not irregular exceptions. All methods retain unanswered and wrong outcomes in the denominator.

Conditions are regular morphology, sparse one-stem/predicate evidence, withheld suppletive plurals, merged noun forms (syncretism), and a whole-word alias competing with productive segmentation. These are deliberately small diagnostic families. They are not natural-language accuracy estimates, learned lexical alignment, acoustic evaluation or a general model ranking. No LLM is invoked.

The W15 `symbolic.ts`/`hybrid.ts` adapters, corpus and published results remain frozen. Their contract describes bracketed entities, numeral composition and separate marker tokens, which differs from W17's attached affixes and lexical-reference trees. The new `grounded-symbolic.ts` adapter avoids silently changing their information budget. Model proposal integration remains W21; unsupported induction never invokes a model as a hidden fallback.

```sh
npm run evaluate:induction -- development
npm run evaluate:induction -- evaluation
npm run evaluate:induction -- verify test-results/induction-evaluation-TIMESTAMP
```

Each run refuses overwrite, snapshots its source/config/lockfile, retains complete inputs, predictions, oracle rules on the evaluator side, alternatives and reasons, and verifies artifact hashes, experiment cells, regenerated outputs and scoring. Replaying with changed engine code can fail; use the retained source revision/snapshot for historical reproduction. Source CI runs the declared evaluation protocol; the independent installed harness exercises actual worker induction, withheld validation, explicit acceptance, symbolic execution and archive preservation.

See [measured results and failure cases](induction-results.md) for the frozen evaluation, raw records and source archives, and [implementation progress](implementation-progress.md) for independent application verification. Scientific conclusions remain limited to this corpus and its supplied anchors.
