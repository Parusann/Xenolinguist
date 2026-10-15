# Labeled acoustic pilot results

Author: Parusan Natheeswaran

The frozen `b61b394` evaluator ran 24 L2-ARCTIC recordings three times each through the pinned phone and Whisper services. [Protocol](acoustic-protocol.md), [licensed corpus](../evaluation/fixtures/audio/l2-arctic-pilot/README.md), [manifest](verification/w23-acoustic-pilot/manifest.json) and [all per-record scores](verification/w23-acoustic-pilot/summary.json) are retained. This is a two-speaker English pilot, not a claim of broad recognition accuracy or an improvement over another model.

| Split, first pass | Reference phones | Phone errors / PER | Reference words | Word errors / WER | Whisper failures | Both phone boundaries within 40 ms / all reference phones |
| --- | ---: | --- | ---: | --- | ---: | --- |
| ASI development, 12 clips | 387 | 101 / 26.10% | 115 | 10 / 8.70% | 0 | 152 / 387 (39.28%) |
| LXC evaluation, 12 clips | 424 | 126 / 29.72% | 114 | 38 / 33.33% | 3 | 88 / 424 (20.75%) |

No phone inference failed. Whisper rejected LXC `a0024`, `a0026` and `a0036` with `Invalid transcription segment` on every repetition. The strict service rejects invalid or out-of-recording model timestamps; these responses remain failures, scored as empty hypotheses. The recorded error does not identify which underlying timestamp triggered validation. No timestamp was clamped to make this evaluation pass. The pilot exposes this limitation for release notes and future investigation.

All 24 exact phone segment arrays repeated across three runs, including timings. All 21 successful Whisper texts repeated; the other three recordings failed every time. This is within-host repetition only. Earlier local/installed long-recording runs emitted different phone counts despite equal input/model hashes. Cross-host prediction equality is not established.

| Mean service-call time | Phone initialization pass | Phone reused-model pass 1 / 2 | Whisper fresh-process pass 0 / 1 / 2 |
| --- | ---: | ---: | ---: |
| ASI | 1763 ms | 510 / 494 ms | 1594 / 1579 / 1486 ms |
| LXC | 1897 ms | 680 / 650 ms | 1574 / 1591 / 1503 ms |

Hardware, OS, memory capacity and exact Node version are in the manifest. Timers exclude worker startup and preparation; OS caches were not cleared. Other desktop activity was not isolated, so these are descriptive observations rather than performance budgets. Whisper verifies and launches its executable every time. The production phone route also uses a fresh disposable process per job; reused-model numbers describe the evaluation harness, not the ordinary product request path.

The low boundary coverage supports retaining “approximate frame timings” and manual corrections. Phone outputs remain English TIMIT ARPABET with uncalibrated acoustic scores. This pilot does not justify replacing the model or adding beam search without a separately frozen comparison; tone and click recognition remain untested. The word failures preclude a blanket successful-transcription claim.

```sh
node scripts/evaluate-audio.mjs verify docs/verification/w23-acoustic-pilot
```

Replay verifies corpus and record identities and recomputes all 72 scored attempts without native inference. Seven scoring/corpus tests passed. [Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/38070318777) and [independent Windows installer acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/38070318739) passed at the freeze. These workflow gates are distinct from this local labeled experiment. Three native unit checks remain gated and existing dependency findings remain unresolved.
