# Active elicitation

W22 is in progress. The first unit implements a bounded query constructor, prediction matrix and deterministic selector in `engine/src/elicitation/`. It can compare concrete numeral forms and grounded grammatical contrasts. Workbench integration, durable answer/decline records and the paired learning-curve experiment remain pending. The existing W19 number panel still uses its first-disagreement selector; this engine unit does not silently change that workflow or its published results.

## Inputs and grounding

`selectNumberQuery(input)` accepts a caller-selected set of number grammars, an explicit list of available integer questions with costs, observed/declined integers, and the case policy. A W19 caller should pass the inference's leading candidates, rather than mixing in lower-ranked alternatives. The input contains no generating language specification, hidden answer, model output or probability estimate. Question values range from 0 to 4095; the caller supplies at most 512 answerable values instead of the selector searching an unbounded space.

`selectGrammarQuery(input)` accepts supplied dictionary anchors, lexical policy, alternative executable rule sets and explicitly available meaning questions. Its question constructor considers the anchor itself and one change at a time: noun plurality, tense, negation or swapping the subject and object of a transitive clause. It never inflects a pronoun as a plural noun or invents a new lexical anchor. A constructed meaning is eligible for prediction only if the grounding interface explicitly lists that exact meaning as answerable. Already observed and declined meanings are excluded. Combined changes require an explicit anchor; arbitrary natural-language questions are outside this interface.

Available meanings are permissions to ask, not answers. A later human or benchmark-oracle interface must return only the selected answer. The selector itself performs no I/O and has no access to an oracle, a model or persistent project state.

## Predictions and scoring

Every surviving question is generated under every distinct supplied candidate. Number hypotheses use the existing bounded arithmetic composer. Grammar hypotheses use the existing meaning-to-surface generator and validate each lexical reference, sense, lemma, verb frame and plural metadata against the supplied dictionary. Missing atoms/rules, stale grounding, composition limits and multiple distinct forms within one hypothesis remain unavailable predictions. A question with even one unavailable candidate receives no disagreement score and cannot be selected. Unknown is not treated as an informative possible answer.

Equivalent output forms are grouped with NFC normalization, whitespace normalization and the declared case policy. Exact duplicate number grammars are collapsed. Grammar rule sets are deduplicated by executable content, independent of rule ordering or repeated copies; the caller's candidate IDs remain available as aliases. Distinct grammars are not merged merely because they currently predict the same outputs. This is a uniform weight over the supplied structurally distinct candidates, not a calibrated belief distribution or an unbiased sample of all possible languages. Different candidate parameterizations can still affect those weights.

For a question with `N` candidates and outcome groups of sizes `n₁ … nₖ`, the selector records:

- Uniform version-space disagreement: `−Σ (nᵢ/N) log₂(nᵢ/N)` bits.
- Expected remaining candidates under those same assumed weights: `Σ nᵢ²/N`.
- Selection utility: disagreement bits divided by declared query cost.

Costs are finite values from 1 to 1000 in one caller-declared unit. They are not inferred effort or measured latency. Default cost is one. At least two predicted outcome groups are required. The highest utility wins, then lower cost, then a stable semantic query key; numeric keys sort in numeric order. Questions with the same candidate partition are marked redundant with the best-ranked representative, regardless of their surface labels. Their predictions remain in the returned record.

For example, if one numeral splits four hypotheses into groups of three and one, its disagreement is about 0.811 bits. A second that gives four different forms has two bits and wins at equal cost. If the second costs three units, the first wins on disagreement per cost. This is a tested policy example, not evidence that it learns real languages faster.

## Results and limits

The returned plan contains the version, weighting definition, representative/alias candidate IDs, all considered questions, per-candidate predictions or failure reasons, grouped outcomes, costs, scores, redundancy links and selected question. It distinguishes `selected`, `none` and `invalid`. `none` means no fully predicted disagreement was available in this bounded set, not that the hypotheses are equivalent.

Runtime schemas reject unknown fields, malformed grammar/meaning data, duplicate candidate or dictionary IDs, conflicting costs for the same query, and oversized inputs before returning any ranking. The limits are 256 number candidates × 512 questions, or 32 grammar candidates with at most 64 rules each, 128 dictionary entries, 16 anchors and 64 available meanings. Existing composition/generation operation limits apply to every prediction. There is no silent truncation and no guessed fallback answer.

Observed/declined queries are excluded by semantic identity, independent of cost. A decline only changes query availability; it does not eliminate a hypothesis or become linguistic evidence. The functions do not mutate caller inputs. The next integration unit must persist selections and decisions, check for stale evidence, save an explicit observed answer, rerank from the updated evidence and retain the downstream change. Those lifecycle guarantees are not supplied by an in-memory selector alone.

## Verification and remaining work

Fifteen engine cases cover independent partition arithmetic, a stronger split than the first question, cost tradeoffs, equivalent partitions, input-order invariance, duplicate hypotheses, observed/declined exclusions, missing atoms, operation limits, empty sets, Unicode/case policy, strict input bounds, one-change grounded contrasts, actual plural/tense/role generation, ambiguous or stale grounding, and a supplied numeral answer reducing real W19 inference alternatives.

```sh
npm test -w server -- --run ../engine/src/__tests__/elicitation.test.ts
```

The [retained selection examples](verification/w22-elicitation-example.json) contain complete inputs and prediction/score records for the equal-cost four-way numeral split, the changed-cost decision and the plural prefix/suffix distinction. They were recorded at `72ee9916e60d5eaa235e675addf380ee367555c1`. With locked dependencies installed at that revision, replay them using the [verification script](verification/w22-elicitation-replay.mts) supplied alongside the JSON:

```sh
npx tsx docs/verification/w22-elicitation-replay.mts
```

Replay recomputes all three plans and compares every retained outcome, score and selection. These are deterministic engineering examples with no model calls or recorded human session, not learning-curve results.

[Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/36358519348) at `72ee991` passes 413 unit tests, seven tooling tests, lint, type checks, desktop build, 40 workbench checks and eight public checks per platform. Downloaded 12/60/336 regression/induction/number records replay on both platforms, with number summaries unchanged from W19. [Independent installed Windows acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/36358519418) verifies 3,774 files and passes its existing native/restart/research/eight-archive flows. The new engine is checked by source tests and example replay; it is not yet connected to the installed UI. [Verification metadata](verification/w22-query-selection.json) retains source and artifact identities. Three gated native unit skips and four reviewed high native-chain audit entries remain.

The learning-curve comparison must still freeze a separate corpus and query interface, run active, seeded-random and fixed-curriculum policies under identical observation budgets, retain per-step costs/answers/predictions and replay the resulting traces. Query selection must never receive held-out targets or hidden language rules. Any negative result must remain in the report. W21's exposed reserved cases cannot serve as fresh blind evidence for changes informed by that evaluation. No learning-efficiency, model-quality or calibrated-uncertainty claim follows from the selector's unit tests.
