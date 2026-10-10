# Acoustic pilot protocol v1

Author: Parusan Natheeswaran

Protocol `l2-arctic-pilot-v1` is frozen before running either native recognizer on the 24 selected utterances. It evaluates the existing pinned English TIMIT ARPABET phone model and bundled Whisper base q5_1 with explicit English. It does not select a replacement model, tune thresholds or support tone/click/universal-phoneme claims.

## Corpus and information boundaries

The [licensed corpus manifest](../evaluation/fixtures/audio/l2-arctic-pilot/README.md) records 12 ASI development clips and 12 LXC evaluation clips with disjoint prompt IDs, source byte hashes, manually corrected phone intervals and word tiers. Selection is lexicographic before inference. No transcript or reference phone is given to either recognizer. The two speakers and small sample do not establish generalization across accents or languages. Training-set overlap is unknown. Development/evaluation separation supports future changes; v1 uses identical fixed settings on both.

Human annotations describe perceived speech. A substitution `CPL,PPL,s` uses PPL; an addition uses PPL; a deletion uses silence. Stress digits and deviation stars are removed. `err` remains an unresolved reference token, counted in the denominator and reported separately, rather than silently dropping difficult speech. Unknown or malformed labels stop preparation.

The declared 39-phone comparison folds AO→AA, AX/AX-H→AH, AXR→ER, IX→IH, UX→UW, EL→L, EM→M, EN/NX→N, ENG→NG, HV→HH, DX→T and ZH→SH. Silence, pauses, stop closures and Q are removed. No adjacent equal reference or hypothesis phones are merged after normalization. This intentionally loses distinctions and is a comparison convention, not a phonetic truth claim.

## Scores and failures

PER and WER use unit-cost Levenshtein insertions, deletions and substitutions divided by reference token count. Aggregate rates divide summed errors by summed reference counts; they can exceed 100%. Empty reference denominators are undefined. Word normalization uses NFKC, lowercase, normalized apostrophes and ASCII English word tokens retaining internal apostrophes. Punctuation is removed; there is no language model, numeric expansion or fuzzy matching in scoring.

Ties in edit alignment choose diagonal, deletion, then insertion. Phone boundary evaluation uses only equal-label pairs in that alignment, with both start and end within 40 ms. Report matched-phone agreement and coverage of all reference phones; never hide deletions behind matched-only accuracy. Model timestamps retain their unadjusted 20 ms frame-bin convention. Word timing alignment is not claimed.

An inference failure retains its error and timing, scores an empty hypothesis (all reference deletions) and increments the failure count. Infrastructure failure leaves an incomplete manifest and prevents acceptance. Raw successful responses, including model/input hashes and settings, remain available. No failed case is removed from the schedule.

## Preparation, timing and repetition

Decode the original PCM16 WAV, average channels, use the application's windowed-sinc resampler, then encode mono 16 kHz PCM16. Preserve the original and derived hashes separately. This controlled path excludes browser-specific decoding differences. Record preparation time separately.

Each recording starts a new Node process and executes three phone/Whisper pairs serially. Phone pass 0 includes verified model initialization; passes 1 and 2 reuse the loaded phone model. Whisper starts its native executable and verifies assets on every pass, so its repeated passes are **process-cold with potentially warm OS caches**, not a resident-model benchmark. No disk-cache flushing is attempted. Timers bracket the service call, excluding worker creation and preparation. Record CPU model, OS, Node, memory capacity and the source/lock identities. Report elapsed milliseconds and real-time factor (elapsed/audio duration).

Compare exact phone segment arrays, including timings, and exact Whisper text across all three attempts. Differences are results, not a reason to rerun until agreement. This probes within-host repetition; it does not establish cross-platform determinism. Total native memory, end-user latency and real-time guarantees are outside this pilot.

## Reproduction

```sh
npm ci
npm run provision:models -- --download
python scripts/prepare-acoustic-corpus.py
# Commit the corpus/protocol/code freeze before native execution.
node scripts/evaluate-audio.mjs run test-results/acoustic-pilot
node scripts/evaluate-audio.mjs verify test-results/acoustic-pilot
```

Native execution requires the manifested Windows assets. Replay runs without native inference and validates corpus/result hashes, schema and audio binding, scheduled attempts and recomputed scores. Source scores are engineering observations on this explicitly limited pilot. A later model comparison must retain this baseline and freeze a new protocol before looking at its evaluation outcomes.
