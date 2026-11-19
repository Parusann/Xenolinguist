# Atlas comparison baseline

Atlas compares uploaded, glossed evidence with a small licensed reference collection. The first method is deterministic and runs on the CPU. It uses no paid API or model inference. The research adapter did not pass its improvement gates, as documented in the [model card](decipherment-model-card.md).

## Evidence and computation

1. Resolve meaning labels against documented glosses, source concept IDs and Concepticon IDs. Ambiguous aliases remain unmapped. Plain-text samples without meanings remain useful stored evidence but cannot support this lexical comparison.
2. Select up to 50 reference languages by anchored-concept overlap. Compare up to 64 shared concepts and two variants per concept. Retain coverage separately from scores.
3. Compute unit-cost edit alignments over Unicode grapheme clusters. Supplied space-separated transcriptions use a separate segment alignment. Transcription is never inferred from spelling. Count tied optimal paths explicitly.
4. Learn a conservative position-independent reference-to-query symbol mapping from unique, ungapped alignments. A rule needs three distinct concepts and three distinct aligned word types. Counterexamples remain visible. This is a conditional correspondence hypothesis, not proof of a historical sound law.
5. Rank by the fraction of anchored query concepts fully explained by supported rules, then overlap and edit similarity. Retain orthographic, phonetic and observed grammatical components separately. Unverified grammar is excluded. No combined ancestry percentage is calculated.
6. Compare with up to eight cyclic shifts of concept labels. These deterministic controls expose accidental matching. They are not independent samples or calibrated significance tests.
7. Remove each target concept before learning prediction rules. Show emitted/correct counts and prediction coverage. Missing-form proposals require at least five emitted leave-one-concept-out predictions, at least 90% precision, consistent anchors and a unique covered prediction across retained reference variants. Every output stays a proposed hypothesis.

Each job allows 10 million alignment cells, 96 units per form and 60 seconds. Reports distinguish complete, insufficient and partial work. Long or unmapped entries are counted. A complete computation can still contain insufficient linguistic evidence. Adding a gloss does not establish that two words are cognates.

## Recorded development study

[Raw cases and two inspectable examples](verification/l5-comparison-study.json) retain 32 seeds at each evidence size, source digests, runtime and every failure or abstention. Five-unit words have equal lengths and use disjoint scripts, so character overlap and word length cannot reveal the regular-substitution candidate. The unrelated control has random forms. An additional control borrows one exact query form.

| Anchors | Cases | Missing-form proposals | Correct | Held-out emissions | Correct | p95 computation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 32 | 0 | 0 | 0 | 0 | 1.13 ms |
| 6 | 32 | 46 | 46 | 85 | 85 | 1.01 ms |
| 12 | 32 | 312 | 312 | 382 | 382 | 2.82 ms |
| 24 | 32 | 192 | 192 | 768 | 768 | 5.45 ms |

All two-anchor cases are marked insufficient. The unrelated borrowing controls emitted zero proposals. The related candidate ranked first in all cases, but tied two-anchor rankings cannot be interpreted as evidence. The dense cases each omit six forms, while the six- and twelve-anchor cases may propose at most ten. Do not compare raw proposal totals as a monotonic learning curve.

This development study validates a narrow substitution model. It is not a held-out historical-language benchmark, and its perfect emitted precision does not generalize to natural languages. Conditioned sound change, loan identification, semantic drift, indels, morphology reconstruction and unknown segmentation require later methods and independent evaluation. Process maximum resident memory was 116,948 KiB, including the TypeScript runner. End-to-end HDD service latency is measured separately.

## Reference provenance

The vocabulary pilot retains 70 WOLD forms across six languages and eleven concepts. The structural pilot retains twelve WALS values across four languages, with five unique language mappings. Kildin Saami has no values for the three selected features. Mandarin is excluded from structural linkage because two WALS varieties share its Glottocode. Neither missingness nor ambiguity is converted into a negative feature value.

The structural source is [WALS CLDF v2020.6](https://doi.org/10.5281/zenodo.23010827), revision `81298aa26d01fdc11b769bcc7fa87ad9e43d7ccd`, under CC BY 4.0. The original source is Dryer and Haspelmath, editors, 2013. Matthew S. Dryer's chapters 26, 81 and 85 describe affixing preference, constituent order and adposition order. Full chapter citations, original value references and license notices accompany the fixture. The affixing feature does not describe all morphology.

`evaluation/src/atlas/ingest/build-wals.ts` verifies pinned upstream Git blobs before producing the selected CSV files and bibliography. `loadWalsReference` verifies every fixture digest. Immutable database ingestion rejects changes to an existing source version. Runtime retrieval pins both vocabulary and structural source digests in each report. These sources remain reference-only and are excluded from adapter training.

The [database integration record](verification/l5-atlas-integration.json) covers eighteen actual PostgreSQL/HTTP verification phases, including source-pinned retrieval, transcription persistence, signed accounts, isolated ownership, retries, raw-byte integrity and deletion disclosure. Queue delivery and the interface have separate acceptance checks.
