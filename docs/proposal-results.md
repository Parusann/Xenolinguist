# W21 validated proposal comparison

The frozen comparison completed on 27 September 2026 at `21631f82aadc04e176ede9c231bd32fde3fe9ad7`. It does **not** demonstrate a linguistic-quality advantage for the tool pipeline. On the 12 reserved tasks per method, both typed methods produced one correct held-out prediction and **zero application-eligible proposals**. The pipeline retained valid references for all 27 final citations, but correct offsets did not imply supporting evidence. This result exposes useful contract and evidence-selection failures while confirming that those candidates remain blocked from application.

The [protocol](proposal-evaluation-protocol.md), [verification record](verification/w21-proposal-evaluation.json), and raw archives below retain all scheduled attempts, including failures. The source, prompts, corpus, parsers and scoring were committed before generation; none changed between development and reserved runs.

## Design and denominators

Two supplied-anchor families test one missing noun meaning and one missing past-tense prefix. Development uses seed 137: six cases paired across three methods, or 18 tasks. Reserved evaluation uses seeds 431 and 829: 12 cases paired across three methods, or 36 tasks. Each task has one held-out compositional meaning and one generation attempt at model seed 42. Regular, conflicting-label and withheld-irregular conditions are paired; regular/irregular inputs are identical to the model. The hidden irregular cannot be learned from those visible inputs.

These are two reserved form permutations, not 12 independently sampled language systems. Other lexical anchors, clause order and a plural rule are supplied. Visible targets are workspace checks; held-out targets are available only to the scorer. Repeated singular observations do not establish independent lexical support.

The methods are unchanged pre-W21 workbench prose prompts, a one-shot typed contract control with observation IDs, and the shipping W21 retrieval/tool loop. The original prompts are frozen from `d99cf684319b4d16b3d54c2e4b8bb66546302147`. Contract-only is an adapted comparator, not the old UI. The pipeline uses the actual server implementation, rather than a separate benchmark reasoning system.

## Reserved outcomes

All counts below include all 12 scheduled tasks per method. Executable coverage means the frozen parser produced a candidate for private preview, even if its references or replacement target are invalid. Application eligibility additionally requires valid scope/references, compatible visible checks and a check that exercises the candidate.

| Measure | Legacy prose | Contract-only | W21 pipeline |
| --- | ---: | ---: | ---: |
| Original-format compliance | 12/12 | 12/12 | 11/12 |
| Executable candidates | 0/12 | 7/12 | 11/12 |
| Observation requests | 0 | 5 | 0 |
| Application-eligible candidates | 0/12 | 0/12 | 0/12 |
| Correct held-out meaning | 0 | 1 | 1 |
| Wrong held-out meaning | 0 | 1 | 2 |
| Unresolved held-out meaning | 0 | 5 | 8 |
| Abstained | 12 | 5 | 1 |
| Generation failures | 0 | 0 | 1 tool-limit failure |
| Invalid/incomplete typed final output | Not applicable | 0 | 1 |

Unresolved means an executable candidate did not yield a unique controlled-English answer. Abstention means no executable candidate was retained, including observation requests and the failed pipeline task. Legacy prose is not invalid JSON. Its frozen extractor converted none of these outputs; this measures interoperability with the engine and **does not establish that all its linguistic reasoning was wrong**.

Each condition has four challenges per method (two families × two reserved seeds):

| Condition | Method | Correct | Wrong | Unresolved | Abstained |
| --- | --- | ---: | ---: | ---: | ---: |
| Regular | Legacy | 0 | 0 | 0 | 4 |
| Regular | Contract-only | 1 | 1 | 1 | 1 |
| Regular | Pipeline | 1 | 2 | 1 | 0 |
| Conflicting | Legacy | 0 | 0 | 0 | 4 |
| Conflicting | Contract-only | 0 | 0 | 1 | 3 |
| Conflicting | Pipeline | 0 | 0 | 3 | 1 |
| Irregular | Legacy | 0 | 0 | 0 | 4 |
| Irregular | Contract-only | 0 | 0 | 3 | 1 |
| Irregular | Pipeline | 0 | 0 | 4 | 0 |

Overall held-out correctness is 1/12 (8.3%) for each typed method. Conditional on returning a resolved answer, it is 1/2 for contract-only and 1/3 for pipeline; those tiny denominators are not reliable quality estimates. Legacy conditional accuracy is undefined. Abstention can be appropriate for conflicting evidence; a correct prediction alone does not make a proposal safe to apply.

The final visible validators report eight invalid, two falsified and two valid observation requests for contract-only. Its other three requests have invalid references. Pipeline reports five invalid, four falsified, two inconclusive and one failed generation. No candidate is compatible.

## Evidence quality and concrete failures

| Citation measure | Legacy prose | Contract-only | Pipeline |
| --- | ---: | ---: | ---: |
| Valid exact references / final citations | Absent | 14/25 | 27/27 |
| Citations covered by finite semantic gold map | 0 | 4/25 | 4/27 |
| Correct declared evidence relation / gold-scored citations | Undefined | 4/4 | 0/4 |

Semantic scoring covers only the canonical meaning and explicit rival (star/moon or past/future), and requires the full declared focus span. Other meanings remain unscored. The 4/4 and 0/4 results are **conditional relation precision**, not global citation precision; their small coverage prevents a broad comparison. Citations from repeated conditions are also not independent evidence.

The archive records preserve these examples:

- `tense-regular-431-pipeline.json` proposes the correct past prefix and renders the held-out answer `you did walk`. It nevertheless invents replacement ID `tense-affix-sul`, which is absent from the profile. The validator blocks application. Its two exact quotes contain only ` su`; both are marked supports but fail the declared full-word relevance criterion.
- `lexical-regular-829-contract.json` predicts the correct held-out meaning but names a nonexistent replacement lexical entry. Raw semantic success and application eligibility therefore differ for both typed methods.
- `lexical-regular-431-pipeline.json` and `lexical-regular-829-pipeline.json` use `the star` as the executable noun meaning. The renderer adds its own article, producing `the the stars`. Visible singular checks already falsify the candidates. This is a contract mismatch between an English phrase and the lemma expected by the engine.
- `tense-conflicting-829-pipeline.json` reaches the four-tool limit without a final proposal. It remains a failed task and held-out abstention; no successful intermediate output replaces it.
- `tense-regular-431-legacy.json` correctly identifies the past prefix in prose and suggests `kir sul-zom` for “I walked.” The conservative extractor abstains on its narrative format. That qualitative example is not retroactively converted into a scored success, and the zero extraction score must not be presented as zero linguistic understanding.

## Development, runtime and cost

The separate development run retained all 18 tasks. Legacy produced six compliant prose responses and six extraction abstentions. Contract-only produced three executable candidates and three requests, with one wrong, two unresolved and three abstained outcomes. Pipeline produced three executable candidates, one request and two tool-limit failures, with one wrong, two unresolved and three abstained outcomes. Neither typed method had an eligible candidate. The deliberate pause after three tasks resumed to 18 with all original record hashes unchanged; failures were never regenerated.

Both splits used local `gemma4:e4b`, digest `c6eb396dbd5992bbe3f5cdb947e8bbc0ee413d7c17e2beaae69f5d569cf982eb`, Ollama 0.32.5, Node v25.8.2, Windows x64, AMD Ryzen 9 7900 and 33,440,882,688 bytes of system memory. GPU identity and provider token counts were unavailable and remain null; this does not establish CPU-only inference. Temperature was 0.2, seed 42, with separate thinking output disabled.

| Reserved observed cost | Legacy | Contract-only | Pipeline |
| --- | ---: | ---: | ---: |
| Generation calls | 12 | 12 | 56 |
| Sum of task wall times | 223.620 s | 131.881 s | 174.137 s |
| Mean task wall time, including failures | 18.635 s | 10.990 s | 14.511 s |

The legacy output ceiling is 2,048 tokens per task, contract-only 1,024, and pipeline up to six 1,024-token calls under a 180-second shared deadline. These are limits, not measured usage. The 11 completed pipeline traces contain 40 tool actions and zero structural repairs; the failed task's requests remain in its raw call record. No unrecorded warmup occurred, methods rotate by case, and normal two-minute model keep-alive applies. This was sequential work on one host, not an isolated latency benchmark. Different budgets, response lengths, model loading and host conditions preclude a general speed claim.

## Raw evidence and replay

Download and extract each archive into its own new directory. Each contains the frozen source snapshot, manifest, generated corpus, exact model requests/responses, per-task scores, failures and summary. No private thinking channel is stored.

| Archive | Records | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| [Development](verification/w21-proposals-development.zip) | 18 | 608,777 | `670d1d088b3a6ef8932d200d99a8b2dca25f7c25adcd71bbbeb349a31953d907` |
| [Reserved evaluation](verification/w21-proposals-evaluation.zip) | 36 | 808,528 | `23f92f017e00a4c4151513be86e31b46a8787ea193689225c09f36c38ce49801` |

In a checkout of revision `21631f82aadc04e176ede9c231bd32fde3fe9ad7` with locked dependencies installed, run:

```sh
npx tsx evaluation/src/proposals/run.ts verify /path/to/extracted-development
npx tsx evaluation/src/proposals/run.ts verify /path/to/extracted-evaluation
```

Both extracted archives passed locally: 18 and 36 records, zero pending tasks. Replay checks source/artifact hashes, scheduled inputs, regenerated corpus, exact requests and deterministic tool feedback, extraction, validation, held-out derivations and aggregate scores. It does not regenerate model text, reproduce wall times or establish independent authenticity of model output. External failures are retained observations; the replay result's retained-failure count is not a successful new generation.

At the frozen revision, [Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/36303156231) passes 398 unit tests (367 server/shared/engine/evaluation, 31 client), seven tooling tests, lint, type checking, build, 40 workbench checks and eight public checks per platform. Downloaded 12/60/336 regression/induction/number artifacts replay on both platforms; number summaries match frozen W19. [Independent installed Windows acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/36303156249) passes its existing native, restart, research and eight-archive flows across 3,774 files. It does not run this model experiment. Three gated native unit skips and four reviewed high native-chain audit entries remain.

## Consequences for the next iteration

The bounded review and deterministic rejection boundary meet W21's engineering exit condition. The model comparison provides failure evidence, not a quality victory. Prior browser acceptance separately demonstrates a falsified future-tense proposal being rejected and a compatible past-tense proposal being explicitly accepted; those controlled fixtures are not model-quality results.

1. Make creation versus replacement explicit in the proposal contract, constrain replacement IDs to existing entities, and preserve rejection of unknown IDs. Retain cases where a semantically correct rule currently fails that contract.
2. Specify executable noun lemmas separately from display glosses. Test article-bearing inputs and preview the rendered consequences before any normalization policy is introduced.
3. Make citation selection preserve meaningful source spans and distinguish exact-reference checks from semantic support. Expand independent relevance annotations beyond the small canonical/rival map before reporting global precision.
4. Improve prose-to-executable coverage only through a separately frozen extractor evaluation; do not hand-correct this baseline. Use a broader corpus, repetitions and clearer budget matching for subsequent quality claims.
5. Carry unresolved alternatives into W22's explicit distinguishing questions. Evaluate whether answers reduce ambiguity against random, frequency and fixed-order query policies, using the same bounded oracle access.

These are follow-ups, not changes to this run. Any prompt, contract or parser iteration informed by these reserved outputs needs fresh reserved cases. General language decipherment, calibrated uncertainty, unfamiliar-script performance and broad model superiority remain unmeasured. No main merge, installer release or Pages deployment is implied.
