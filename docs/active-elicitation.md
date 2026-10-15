# Active elicitation

W22 is in progress. The engine constructs bounded questions, predicts outcomes under competing hypotheses and ranks uniform disagreement per declared cost. The Numbers and Grammar workbenches record selected questions, explicit answers or declines and the resulting comparisons. The paired active/random/fixed-curriculum learning-curve experiment remains pending; no learning-efficiency advantage is claimed.

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

## Recorded grammar questions

In **Grammar**, open **Configure alternatives and answerable meanings** under **Ask about competing grammars**. Assign saved executable rules to each complete alternative rule set. Shared clause-order or morphology rules must appear in every alternative that needs them. Empty rule sets are permitted as a no-rule alternative; missing predictions cannot earn disagreement credit. Exact duplicate rule sets count once and retain aliases. These are user-selected alternatives, not automatically inferred or exhaustive hypotheses.

Choose a noun phrase or a clause with lexical anchors. The editor uses each entry's first explicit sense, requires the dictionary's verb frame, and offers the anchor plus one-change plurality, tense, negation and agent/patient contrasts. Mark each meaning you can actually observe and assign its cost in a consistent effort unit (1–1000). Unchecked meanings are unavailable. The interface never receives an oracle answer or guesses that a question is answerable. Added anchors, alternatives and availability/cost choices persist as per-project drafts; unfinished anchor controls must be added before they are saved.

**Select and record grammar question** captures the setup, relevant dictionary fields, selected executable rule sets, prior compatible observations, exclusions and computed report. Private notes, prose rules and unrelated fields are omitted. The report displays the requested meaning, predicted forms, candidate identities, costs and disagreement. Declining records a reason and excludes that meaning while the input evidence is unchanged; it changes no linguistic evidence.

**Save observed answer** atomically adds an immutable research capture, its user-supplied meaning annotation, a durable decision receipt and a new comparison report. A unique prediction that disagrees with an answer eliminates that alternative from this comparison. Unavailable or ambiguous predictions remain unresolved rather than becoming contradictions. If every alternative disagrees, the report retains zero survivors and the actual answer. No rule is accepted, generated or rewritten automatically. This is finite candidate filtering, not a new induction search or a blind accuracy estimate.

Subsequent questions reuse nonarchived answers only under the identical dictionary/rule-set context. A changed lexical grounding or selected rule set starts a different comparison context. A withdrawn capture or changed meaning annotation stops contributing to later comparisons and makes pending questions stale. Recorded snapshots and before/after reports remain unchanged. Ordinary project renaming and private note edits do not change the context. Modifying the setup does not rewrite an already recorded question; its full setup remains inspectable.

The authenticated `/api/grammar-elicitation/:profileId` GET/POST and `/:recordId/decision` POST endpoints use revision checks and durable request identities. Creation retries require the same setup; decision retries require the same action, answer and reason. Ordinary profile edits cannot replace server-owned history. Draft cleanup after delayed responses targets the originating project. Archive inspection replays selection and answer comparisons; restored records preserve exact historical payloads, remap captures and cannot apply pending answers. Configure a fresh comparison after restoration; historical answers do not silently become evidence under new lexical identities.

The grammar engine supports up to 32 alternative rule sets with 64 rules each, 128 dictionary entries, 16 anchors and 64 available meanings. Grammar history is separately bounded to 20 questions and 2 MB; individual retained source JSON is limited to 40,000 characters and each report to 180,000. Oversized records fail without partial evidence writes. There is no silent truncation, history deletion or compaction. The editor supports single noun phrases and simple clauses with first-sense anchors; richer combined meanings need a future grounding editor. Existing W18 induction remains a separate explicit workflow.

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

The recorded number workflow adds 12 server cases and three browser scenarios for decisions, stale inputs, durable drafts, project isolation, delayed responses, restart and actual archive restoration. At `afc81b9`, [Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/36383936633) passes 425 unit tests, seven tooling tests, all 43 workbench checks and eight public checks per platform, plus lint, type checks and build. Downloaded 12/60/336 experiment records replay on each platform. [Independent installed acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/36383936847) verifies 3,774 files and passes existing native/restart/research/eight-archive flows. The new workflow is covered by source HTTP/browser acceptance; installed acceptance retains its existing scope. [Second-unit verification](verification/w22-number-elicitation.json) records exact identities and limits.

## Reopen the recorded number example

Import [the retained project archive](verification/w22-number-elicitation-history.xeno) through the Dashboard, restore as a new project, and open Numbers. The history contains a declined question followed by an independently rendered synthetic answer for integer 11. The seven leading candidates reduce to one after `ru ka ra` is supplied as validation. Restored records are historical; their answer-capture links point to the restored observations. [The screenshot](verification/w22-number-elicitation-answer.png) shows the original completed session.

The [original profile](verification/w22-number-elicitation-profile.json) and [restored profile](verification/w22-number-elicitation-restored-profile.json) come from Windows browser CI at the implementation revision. With locked dependencies installed, run:

```sh
npx tsx docs/verification/w22-number-elicitation-replay.mts
```

Replay verifies both profiles, recomputes question selection and the after-answer report, checks exact historical payloads, decline exclusion, validation assignment and remapped capture links. It makes no model calls. The two decisions are engineering fixtures, not a human study or a learning-curve result.

## Reopen the recorded grammar example

Import [the retained grammar project](verification/w22-grammar-elicitation-history.xeno) through Dashboard, restore as a new project and open Grammar. The two alternatives predict prefix versus suffix plural forms. The history declines one answerable meaning, then captures the independent answer `nesh-en` for **the stars**, leaving one alternative. All four saved executable rules remain as they were; none is automatically accepted or removed. [The screenshot](verification/w22-grammar-elicitation-answer.png) shows the original completed comparison.

The [original profile](verification/w22-grammar-elicitation-profile.json) and [restored profile](verification/w22-grammar-elicitation-restored-profile.json) retain exact input and result snapshots. With locked dependencies installed, run:

```sh
npx tsx docs/verification/w22-grammar-elicitation-replay.mts
```

The script recomputes every recorded selection and after-answer report, checks decline exclusion, the two-to-one comparison, exact historical payloads and remapped capture links. It also confirms restored histories cannot be applied or silently reused under remapped lexical identities. No model is called. [Verification metadata](verification/w22-grammar-elicitation.json) records the exact CI revision, artifacts and coverage boundaries.

At `117f2d3`, [Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/36824421316) passes 438 unit tests, seven tooling tests, lint/type/build gates, 46 workbench and eight public checks per platform. Both platforms' downloaded 12/60/336 experiment records replay. [Independent installed acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/36824421178) passes its existing native/restart/research/eight-archive flows and verifies 3,774 files. New grammar elicitation is exercised by source HTTP/browser acceptance. Three native unit skips remain. [Current dependency findings](dependency-review.md#w22-audit-refresh--2026-10-01) are retained separately from functional test results.

The [learning-curve protocol](elicitation-evaluation-protocol.md) now has an executable harness with separate development, reserved evaluation and CI partitions. It compares active, seeded-random and fixed-curriculum policies using the shipping predictor/selector, supplied alternatives, selected answers and identical observation/cost ceilings. Each trace retains full decisions and held-out predictions behind an explicit information boundary. The [completed report and raw archives](elicitation-results.md) retain 336 development and 672 reserved traces with complete source replay, including negative results. W21's exposed reserved cases are not reused. No model-quality or calibrated-uncertainty claim follows from these engineering examples.

At frozen revision `af1a197`, [Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/36959426454) passes 450 unit tests, seven tooling tests, lint/type/build gates, 46 workbench checks and eight public checks per platform. Downloaded 12/60/336 regression/induction/number artifacts and the new 56-trace elicitation CI partition replay on both platforms. [Independent installed acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/36959426438) passes existing native/restart/research/eight-archive flows across 3,774 files. [Final W22 verification](verification/w22-elicitation-evaluation.json) preserves scope and hashes. Three native unit skips and the current dependency findings remain unresolved.
