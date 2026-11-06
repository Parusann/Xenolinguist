# Lexical evidence proposals

`compareLexical` exposes the validated lexical constraint method to application code. It accepts a complete form inventory, a complete meaning inventory, cited anchors and one query. The caller must explicitly supply the assumption `closed-bijective-inventory`. Inputs are validated by the shared schema. [Implementation](../engine/src/comparison/lexical.ts) · [Contract](../shared/schemas/lexical-comparison.ts)

Under this assumption, each form has exactly one meaning and each meaning has exactly one form. The method returns a unique meaning only when the anchors force it. Multiple remaining meanings produce an ambiguous proposal. A query outside the inventory or more than 16 remaining meanings produces insufficient evidence. Contradictory anchors produce an inconsistent state. Every result remains proposed and carries its evidence identifiers.

Ordinary uploaded wordlists can include synonymy, polysemy, gaps and transcription uncertainty. The atlas must obtain a justified inventory assumption before using this constraint method. Reference-language retrieval and similarity reports require their own evidence and evaluation.

## Inspect the demonstrations

The callable method handled all 32 development lexical challenges correctly across eight synthetic lineages excluded from adapter optimization. It made zero unsupported claims. This reproduces the lexical portion of the earlier surface baseline through the product interface. The complete run retains inputs, proposal results, durations and scores. [Development evidence](verification/m6-lexical-product.json)

In episode `e5`, anchors establish `iθo → stone`, `ʃfo → sun` and `tɣŋ → moon`. The declared inventory contains four forms and four meanings. The remaining form `ŋɣi` therefore maps to `water`. The same episode queries `iuw`, which falls outside that inventory and receives insufficient evidence.

In episode `e6`, `gri → moon` and `ɣɣθ → stone` leave `θbd` compatible with both `water` and `sun`. The proposal preserves both possibilities. An additional anchor linking one of the two unresolved forms to one of those meanings would distinguish them.

The scorer uses a fixed confidence of 0.5 for compatibility with the existing benchmark response type. The application proposal omits a confidence probability. These demonstrations establish behavior within the declared synthetic constraint class.

## Reproduce

Run from the configured HDD checkout.

~~~powershell
. ./scripts/research-env.ps1
& $ResearchWorkspace.Node node_modules/tsx/dist/cli.mjs evaluation/src/decipherment/product.ts (Join-Path $env:XENO_RESEARCH_RESULTS 'new-product-study.json')
~~~

Application callers import the engine function and shared contract directly. The engine receives learner-visible evidence only. It has no dependency on evaluator truth, corpus generation, model services, account storage or network access. The atlas will wrap proposals with dataset/version identifiers and permission checks before saving or displaying them.
