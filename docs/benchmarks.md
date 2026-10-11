# Reproducible benchmark guide

Author: Parusan Natheeswaran

Each result below belongs to a frozen experiment with its own source revision and denominator. Replaying raw records verifies scoring and integrity; it does not reproduce elapsed timings or regenerate identical model output on different hardware.

| Experiment | Information budget and control | Observed result / limitation | Full evidence |
| --- | --- | --- | --- |
| W15 composition | 30 reserved languages; 8/16/29 observations; common grammar prior; lookup/symbolic/model/hybrid | At 29: symbolic 150/150; model 0/300; hybrid 300/300 with zero model calls. Repeated model trials are not independent languages. | [Protocol](evaluation-protocol.md), [results/raw archives](evaluation-results.md) |
| W18 grounded induction | 7 supplied lexical anchors; 14 fit and 6 validation observations; 4 final compositions per language; memorization/lookup/learned/oracle | Regular 48/48; sparse 0/48; irregular 24/48. Twelve languages reused across conditions. | [Results](induction-results.md) |
| W19 number grammar | Primitive and productive integer/form mappings; independent validation; three final integers per system; memorization control | Regular 252/252; hidden irregulars 168/252 with 84 wrong. Eighty-four bounded parameter combinations reused across conditions. | [Results](number-results.md) |
| W21 model proposals | Supplied lexical/grammar anchors; 12 reserved tasks/method; legacy prose/typed control/tool pipeline | Pipeline 1 correct held-out meaning, zero application-eligible candidates. No demonstrated quality advantage. | [Protocol](proposal-evaluation-protocol.md), [results](proposal-results.md) |
| W22 active elicitation | Supplied finite alternatives; unit/declared costs; active versus five seeded-random runs and fixed curriculum | Regular grammar reaches 72/72 after two active answers; invisible irregularity remains wrong and incomplete predictions cause abstention. | [Protocol](elicitation-evaluation-protocol.md), [curves/raw archives](elicitation-results.md) |
| W23 acoustic pilot | 12 development + 12 reserved recordings from two English L2 speakers; three repeats; frozen phone folding and 40 ms boundary tolerance | Reserved PER 29.72%, WER 33.33% with failures included; boundary coverage 20.76%. Small pilot, not general speech accuracy. | [Protocol](acoustic-protocol.md), [results](acoustic-results.md) |
| W24 UI | 100/1,000/10,000 synthetic samples and words; five input events; single Windows host | 10,000 vocabulary 5,998 → 261 ms; editing 857–982 → 102–196 ms. Small startup regression and cache limitations retained. | [Measurements](performance.md) |

## Commands and artifacts

Use Node 24 and `npm ci` from the selected source revision. Source CI runs the small regression suites below and retains raw output. Full frozen experiment archives linked above contain their own source snapshots and replay instructions; follow those instructions when checking historical claims.

```sh
npm run evaluate:ci
npm run evaluate:induction -- evaluation
npm run evaluate:numbers -- evaluation
npm run evaluate:elicitation -- ci
npm run evaluate:unicode
node scripts/evaluate-audio.mjs verify docs/verification/w23-acoustic-pilot
```

Audio replay validates the retained native records and recomputes scores; a fresh native run additionally needs the manifest-verified Windows assets and corpus. The corpus has a separate CC-BY-NC license and attribution; it is excluded from the desktop payload. Do not remove third-party notices or conflate that license with the proprietary application license.

The [performance guide](performance.md) gives the explicitly enabled browser measurement command. The [demo script](demo-script.md) is a worked case with one observation, not a replacement for these comparisons. The [release checklist](release-checklist.md) covers engineering acceptance, which does not measure linguistic accuracy.
