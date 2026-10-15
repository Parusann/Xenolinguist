# Workspace evidence and user belief

W08 removes the weighted decoding percentage. Filling a notebook, increasing a manual rating, or repeating a guess cannot establish how much of a language has been decoded. The status bar, saved-profile list and dashboard now show content counts with explicit definitions. Tested linguistic hypotheses and evaluated language coverage remain unavailable until an evaluation engine exists.

## Count definitions

`shared/metrics/workspace-metrics.ts` defines the counts used by the client and saved snapshots. Text comparison applies Unicode NFKC, lowercase, trimming and whitespace collapse. It preserves punctuation.

| Metric | Definition | Limit |
| --- | --- | --- |
| Distinct observations | Distinct nonblank sample texts | Identical transcriptions count once, even if captured separately. Distinct text does not prove independent provenance. Audio without sample text is not included. |
| Asserted entries | Distinct nonblank word–meaning pairs | Repeated copies do not add assertions. This is not a verified vocabulary size. |
| Grammar notes | Distinct nonblank rule descriptions | Notes are not compiled or tested rules. |
| Competing forms | Word forms with more than one distinct asserted meaning | May reflect ambiguity, polysemy or competing hypotheses; no automatic adjudication. |
| Numbers 1–20 | Nonblank mappings at canonical integer keys 1 through 20 inclusive | Zero, 21 and higher, blank values, aliases, decimals and unsafe integers do not advance this milestone. |
| Rated dictionary records | Records with a non-null manual rating | Counts records, including duplicates, and is explicitly displayed against the total record count. |

Live counts include pending edits. Saved history describes only successfully persisted states. Sample and translation coverage labels describe dictionary matching against the displayed token count, not translation accuracy. Existing tokenization limitations still apply.

## Optional user belief

New manual words, grammar notes, audio-derived entries, translation corrections and sandbox rewards start unrated. The vocabulary and grammar forms accept an optional finite number from 0 to 100. Clearing the field removes the rating. Labels read `Asserted · unrated` or `User belief N/100`; no rating automatically becomes confirmed knowledge. Promotion, demotion and translation “Lock in” shortcuts have been removed.

Historical numeric values are preserved, including zero. The version-2 profile schema accepts null or omitted ratings for new content. `confidence` remains the writable compatibility field for existing saved drafts and clients; parsing mirrors it to `user_asserted_confidence`, including null. This avoids invalidating pending W03–W07 mutations. Neither field is a calibrated probability. Internal legacy color names remain styling identifiers only. Prompt context and CSV column labels identify these values as user belief.

Vocabulary inspector advice and dashboard field notes are deterministic guidance and are labeled accordingly. Actual model responses remain in the explicit analysis panels; the generic guidance does not invent model output or evidence.

## Exploratory number comparison

The comparison tests candidate bases 5, 6, 7, 8, 10, 12, 16 and 20. For each base B, it examines integer n in `(B, 2B]`. A comparison requires nonempty tokenized forms for n, B and n−B, a compound distinct from both references, and distinct compound and unit labels within that candidate's comparisons. Matching reuses a token from each reference. Tokens support Unicode letters, marks and numbers.

The table shows support/checked and checked/B candidate integers. Unsupported comparisons count against support; missing references do not become negative evidence. Ranking uses support/checked only among candidates with at least two supporting comparisons. Equal top ratios remain tied and produce no single suggestion. This guard establishes distinct informative comparisons, not independently collected linguistic evidence: mapping provenance is not yet recorded. The heuristic does not cover every numeral construction or prove a base.

The working base is an explicit user selection from 2–36 or unset. Neither the heuristic nor the model-analysis button changes it automatically. Positional breakdown uses only that selection. A candidate absent from the comparison table is not tested by this heuristic.

## Saved metric history

The server samples metric counts inside the profile save boundary. A new profile begins with a revision-zero snapshot. An existing profile with no history begins on its next successful save; reading or migrating it does not reconstruct earlier values. Subsequent snapshots appear only when a count changes, with the committed profile revision, server recording time and metric-definition version 1. Dates on original entries are never used to invent past progress.

Snapshots and the profile are written atomically. Failed writes and revision conflicts add no persisted snapshot; idempotent mutation retries do not duplicate history. The latest 1,000 snapshots are retained. Equal counts do not create a snapshot, so this is a metric history rather than a complete content audit log. Clock changes can affect displayed times; revisions preserve ordering.

History is server-owned metadata. JSON export includes it. Content import into an existing workspace retains that workspace's history and records the resulting counts on save; it does not adopt the imported profile's timestamps or history. The dashboard's separate session activity list remains an in-memory log for the current app session.

## Verification

Focused unit tests cover duplicates, blank content, normalization, competing meanings, range boundaries, historical ratings, unrated assertions, bounded history, sparse numeral evidence, contradictions and tied candidates. Store tests exercise snapshot atomicity, disk failures, stale revisions, retry identity and metadata protection. Browser checks exercise manual word and rule creation, rating removal, backend restart, failed saves, explicit base selection and the displayed definitions. The Windows release probe additionally checks unrated sandbox rewards and actual saved metric history after close/relaunch recovery.

These checks verify application behavior. They do not measure model quality, calibration, independent evidence, or linguistic accuracy.
