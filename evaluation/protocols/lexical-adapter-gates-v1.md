# First lexical adapter experiment

Frozen after the development studies and before training or reserved evaluation. This document governs one candidate and one reserved comparison.

**Question.** Can a small adapter recover a meaning forced by the remaining lexical anchors while withholding a unique claim when multiple mappings remain or a form falls outside the inventory?

**Primary track.** Compare the unmodified base and candidate on the same text-only track, with identical evidence, prompts, decoding, time limits and token limits within that comparison. Leave tools disabled for this primary test. Report any optional tool experiment separately. The model, tokenizer revision, precision, backend and generation settings must match across the pair. If the experiment uses a different runtime or precision from the Q4_K_M development study, measure the base again in that runtime before comparing it with the adapter.

**Data.** Use only synthetic training lineages for optimization. Keep development lineages for diagnosing feasibility and selecting the single candidate. Exclude the independent controls, licensed WOLD reference fixture and reserved episodes from training and retrieval. Save the exact training manifest, base revision, adapter hash, configuration and training seed before the first reserved inference. Refuse a second final run for tuning. A failed or interrupted attempt must remain visible.

**Pilot and candidate.** Use a tiny checkpoint to verify finite gradients, a weight update, saved-state reload and resumed optimization. Keep this disposable checkpoint separate from the experimental candidate. Freeze the candidate's optimizer, training schedule, data and seed after measuring local throughput and before candidate training. No training-duration or speed claim precedes measurement.

**Reserved lexical gates.** The eight held-out lineages schedule eight identified lexical challenges, eight ambiguous ones and sixteen outside-inventory cases. All of the following must pass.

1. At least 6/8 identified answers are correct, with at least four more correct answers than the matched base.
2. At least 22/24 uncertain lexical challenges receive a correct ambiguity response, complete supported set or correct insufficient-evidence response as appropriate.
3. Zero ambiguous or outside-inventory lexical challenges receive an unsupported unique claim. At most one unsupported assertion occurs across all 32 lexical challenges.
4. At least 31/32 lexical challenges return a valid prediction. Missing, malformed, timed-out and errored predictions remain in the scheduled denominator.

**Transfer checks.** Score the other 72 scheduled challenges under the same protocol. The candidate may add at most two unsupported claims and at most two failed items relative to the matched base. Report identified accuracy, coverage, uncertainty handling and false claims for each task and each lineage. These transfer checks guard against broad regressions and do not establish a new task capability.

**Decision.** Report a null or inconclusive result whenever a gate fails or the comparison cannot be completed under matched settings. All gates passing supports this bounded lexical pilot only. A distributable specialist additionally needs evaluation of its exported quantized artifact against a matching quantized base, inference resource measurements and preserved notices. Eight lineages provide limited precision. Report paired per-lineage counts alongside aggregates.
