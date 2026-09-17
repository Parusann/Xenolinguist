# Persistent sandbox practice

Sandbox practice stores its generated language, answer key, stable challenge IDs, draft answers, grading events, current step, visible exercises, word-help mode and completion state in `profile.sandbox_session`. Browser and desktop recovery use the existing revisioned profile queue. Answer events and their dictionary, number, sample or grammar updates enter the same mutation, so a failed save can retry the complete change. Competing edits to a session produce a save conflict rather than silently combining different answer histories.

The creative session format and grader each have version 1. A session records the selected generator model name and creation time. This is creative practice using a model-generated answer key, not a blind or scientifically validated language benchmark. The stored key is accessible in profile JSON. W14 adds a separate [deterministic compiler mode](deterministic-compiler.md) with executable semantics, server-owned keys and versioned datasets. Model digest capture and comparative learner evaluation remain future work.

## Grading contract

- Vocabulary matches a complete canonical answer or an explicitly declared `accepted_forms` alternative. NFKC Unicode normalization, case folding, whitespace normalization and surrounding punctuation removal are deterministic. Internal punctuation remains significant. `s` cannot solve `sky`; `caterpillar` cannot solve `cat`.
- Number challenges, including number tokens in word-by-word exercises, require a complete safe integer. Full-width digits and signed/zero-padded integers are accepted. Decimals, exponent notation, units, partial numbers and unsafe integers are rejected. A sign error remains a distinct attempt that can be corrected.
- Sentences match conservative accepted strings. Feedback says “Not matched”; it does not claim an unlisted paraphrase is semantically wrong. No LLM judge decides correctness.
- Each submission, hint and reveal has a stable event ID. Duplicate submissions of the same answer and events for already resolved challenges do not create extra attempts or entries. Repeating a session does not duplicate an existing identical word/meaning or grammar rule.
- First-attempt unaided matches, retries, hints and reveals are shown separately. The first-attempt denominator is attempted number, vocabulary and sentence challenges; total available challenges and resolved challenges are also shown. Word-by-word checks do not add separate accuracy credit. Revealing an answer never counts as an unaided match, and related token assistance remains assistance when returning to vocabulary.

Workspace entries use stable IDs derived from the session and challenge, with notes identifying matched or revealed generated answers. New rewards are unrated assertions. Existing historical ratings remain intact; see [workspace evidence](workspace-evidence.md) for the W08 belief labels and metric definitions.

## Generation validation and recovery

A generated language must have a name, phoneme inventory, supported number base, word-order description, distinct grammar rules, at least three number words, vocabulary and sample sentences. Alien spellings must be unique after normalization. Every sentence token must be declared in the vocabulary or number map. Optional accepted-form lists are explicit; synonyms are not inferred. Bounds on strings, collections and event history limit malformed inputs.

Validation checks stored challenge definitions against the answer key and rejects unknown event references, duplicate event IDs, grading results that disagree with the contract, and additional grading events after resolution. These structural checks do not prove that a model's grammar rules, translations or morphology are coherent. Inflected forms and particles must be declared as tokens; a generative morphology engine is not implemented yet.

Malformed generations produce inline, actionable errors without creating a session. The response is held only in memory; the user can explicitly download it for diagnostics. It is not automatically persisted in profiles or a diagnostic archive. Navigating away during generation cannot attach its late result to another profile.

An old workspace with entries but no saved exercise key keeps those entries and explains that the earlier exercise cannot be reconstructed. Starting new practice generates a new key rather than inventing the missing one. “Play Again” explicitly replaces the active session and preserves workspace entries. Historical session archives and automatic reconstruction of old unsaved keys are not provided.

## Verification

Shared tests cover exact and Unicode matching, integer edge cases, explicit alternatives, sign correction, idempotency, first-attempt accounting, hints, reveals, token assistance, serialization, malformed generations and inconsistent events. Server and client queue tests verify atomic session/reward persistence, stale revisions and failed-save recovery.

Browser acceptance reproduces and repairs the original substring and phase-navigation defects. It also verifies failed-save reload/retry, real backend restart, attempts and unfinished drafts, conservative sentence/token grading, completion recovery, generation validation, legacy entries and profile isolation. Generator responses in these tests are deterministic fixtures, not measured model-quality results.

The packaged release verifier adds a pending sandbox session alongside the existing text/audio recovery probe, closes the actual Electron window, relaunches on a new origin, compares the restored session, and continues grading without duplicate dictionary entries. This is an unpacked Windows application check, not installer or broad power-loss certification.

The [retained Windows result](verification/w07-windows-sandbox.json) passed session identity, event recovery and exactly-once reward checks. The final unit count is 153 passing tests with three native unit skips; the browser suite contains 17 working checks and one unrelated expected failure.
