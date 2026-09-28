# Active elicitation

W22 is in progress. The engine constructs bounded questions, predicts outcomes under competing hypotheses and ranks uniform disagreement per declared cost. The Numbers workbench now records selected questions, explicit answers or declines and the resulting reranking. Grounded grammar questions are supported by the engine but still need their workbench grounding interface. The paired active/random/fixed-curriculum learning-curve experiment remains pending; no learning-efficiency advantage is claimed.

## Inputs and grounding

`selectNumberQuery(input)` accepts a caller-selected set of number grammars, an explicit list of available integer questions with costs, observed/declined integers, and the case policy. A W19 caller should pass the inference's leading candidates, rather than mixing in lower-ranked alternatives. The input contains no generating language specification, hidden answer, model output or probability estimate. Question values range from 0 to 4095; the caller supplies at most 512 answerable values instead of the selector searching an unbounded space.

`selectGrammarQuery(input)` accepts supplied dictionary anchors, lexical policy, alternative executable rule sets and explicitly available meaning questions. Its question constructor considers the anchor itself and one change at a time: noun plurality, tense, negation or swapping the subject and object of a transitive clause. It never inflects a pronoun as a plural noun or invents a new lexical anchor. A constructed meaning is eligible for prediction only if the grounding interface explicitly lists that exact meaning as answerable. Already observed and declined meanings are excluded. Combined changes require an explicit anchor; arbitrary natural-language questions are outside this interface.

Available meanings are permissions to ask, not answers. The number interface asks a human for the selected answer; a later benchmark-oracle interface must likewise return only that answer. The selector itself performs no I/O and has no access to an oracle, a model or persistent project state.

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

Observed/declined queries are excluded by semantic identity, independent of cost. A decline only changes query availability; it does not eliminate a hypothesis or become linguistic evidence. The functions do not mutate caller inputs. The server-backed number workflow below supplies persistence and revision checks separately from this in-memory selector.

## Recorded number questions

In **Numbers**, use **Select and record next question** under **Choose a distinguishing observation**. This interface searches integers 1–64 at equal cost, using the current W19 leading grammars. It shows the requested integer, each predicted form and its candidate identities, uniform disagreement and expected remaining candidates. Missing predictions exclude a question. A bounded absence is recorded when no question qualifies. The older quick question inside **Number grammar inference** remains a manual mapping workflow; use the recorded selector for the new question/decision history.

Enter an independently observed form and a source/reason, then choose **Save observed answer**. One atomic profile write adds the mapping, its validation assignment, an immutable source capture with a user annotation, the decision receipt and a replayable report of reranking. The answer need not match any suggestion. No hypothesis is automatically accepted, and no model is called. Newly supplied atoms or linkers still require an explicit move into fit before W19 can learn them; answers enter selection validation only. That validation is not a blind accuracy measure.

**Decline question** records a reason and changes no mapping, capture or hypothesis. Subsequent selection excludes the declined integer while the number input snapshot is identical. A later change to the mapped forms, fit/validation partition or case policy can make that integer available again. A pending question becomes stale when those inputs change. Project names and unrelated notes are excluded from the snapshot. Captured-answer annotation edits do not automatically rewrite number mappings; update the mapping explicitly when correcting its executable evidence.

Question history and decisions survive reload/restart. Answer/reason drafts use the existing durable per-project draft store. A delayed response clears only the originating project's drafts. Pending saves disable selection and decisions. The server checks the revision again under the profile lock; a race cannot overwrite intervening edits. Creation and decision request identities persist with their records, so identical retries acknowledge the existing write even after the rolling mutation ledger changes. Different-payload decision retries fail.

`GET /api/elicitation/:profileId` returns history and current availability. Authenticated `POST` on that path requires `expectedRevision` and `mutationId` and computes the selection from saved evidence. `POST /api/elicitation/:profileId/:recordId/decision` additionally accepts `action`, `answer` (null for a decline) and `reason`. Ordinary profile edits cannot alter this server-owned metadata. The shared atomic research commit verifies retained records; archive inspection independently recomputes selection and answer results from hashed input snapshots. This checks consistency, not the truth of a human observation.

History is bounded to 20 records and 2 MB, with no silent pruning. At that limit the interface requires exporting the project and continuing in a new research project; deletion/compaction is not implemented in this unit. Restored histories retain exact source/report payloads, remap answer-capture links and are marked historical. They cannot apply answers in the restored project; select a new question there. Original files, drafts and earlier exports can retain copies.

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

The recorded number workflow adds 12 server cases and three browser scenarios for decisions, stale inputs, durable drafts, project isolation, delayed responses, restart and actual archive restoration. Local full source gates pass 425 unit tests and seven tooling tests; four focused browser checks pass including the W19 workflow. Exact-revision CI results are recorded in [implementation progress](implementation-progress.md). The first-unit CI above predates this workbench integration.

The learning-curve comparison must still freeze a separate corpus and query interface, run active, seeded-random and fixed-curriculum policies under identical observation budgets, retain per-step costs/answers/predictions and replay the resulting traces. Query selection must never receive held-out targets or hidden language rules. Any negative result must remain in the report. W21's exposed reserved cases cannot serve as fresh blind evidence for changes informed by that evaluation. No learning-efficiency, model-quality or calibrated-uncertainty claim follows from the selector's unit tests.
