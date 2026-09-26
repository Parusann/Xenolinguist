# Research evidence and retained derivations

W20 adds a version-3 research notebook with immutable observations, revisioned annotations, typed hypotheses, evidence links, decisions, saved derivations, supplied-target checks and evidence-count snapshots. Open **Field Log → Research evidence** to capture text or a saved sample, propose an investigation of a word or executable rule, and link supporting, contradicting or ambiguous evidence. The number panel can explicitly record its selected candidate as a proposed research hypothesis.

## Captures and corrections

A capture retains original text, its UTF-8 SHA-256, source context, capture time, provenance and any supplied source identifier. A saved sample is copied only on an explicit capture action. Editing or deleting that notebook sample does not rewrite the retained observation. Migration leaves research empty; old notes, samples, confidence ratings and generated prose do not become verified observations automatically.

Audio captures retain a clip identity, half-open time span and original asset hash. The current capture form uses the entire available sample clip. The schema also supports narrower time spans. Evidence links can select half-open UTF-16 offsets into the original captured text. Hash and audio-span checks run at profile writes and archive inspection/restoration. Deleting a notebook sample keeps any recording retained by a research capture. A captured recording must remain available even after withdrawal; withdrawal excludes it from analyses, while retaining bytes for the audit trail.

Corrections append an annotation with a consecutive revision and predecessor identifier. Earlier annotations and the original capture remain unchanged. Withdrawal appends an event. Derived observations name earlier parent captures; cycles and missing parents are rejected. Model restatements require parents and inherit their evidence roots. Hashes check consistency, not the authenticity or independence of an alleged source.

## Hypotheses and decisions

Hypotheses retain typed lexical, executable grammar or number content and creation provenance. States are proposed, accepted, rejected, superseded and invalidated. Explicit decisions carry reasons. A replacement names its predecessor; terminal decisions cannot be revived by editing history. Changed lexical assertions, executable rules, number inputs, linked annotation revisions or withdrawn observations invalidate affected hypotheses. Withdrawal propagates through derived observations.

Acceptance records a user decision. It neither proves a hypothesis nor changes the existing executable-rule inventory. Manual belief is a separate optional 0–100 value. No calibrated probability is produced. The evidence inspector shows the linked source text, exact spans, retained interpretation revision, relation and any invalidation reason. It is available in Vocabulary, Grammar, the translated-token inspector and symbolic derivations.

`evidence-counts-1` counts distinct normalized source roots separately for support, contradiction and ambiguity. Root text normalization is NFC, lowercase, trim and whitespace collapse. Repeated links, repeated captures with equivalent text and model restatements do not add credit. This conservative text deduplication can collapse independently collected identical utterances or case distinctions; it does not estimate statistical independence. A root can occur in more than one relationship category, making inconsistent interpretations visible. Withdrawn or superseded-annotation links remain visible but do not contribute to current counts. Prior metric snapshots retain their dependency snapshots and can become stale.

## Derivations, checks and invalidation

**Save derivation to research** retains a full-workspace symbolic run: source text, original source spans, lexical entry/sense identifiers, applied rule identifiers, meaning trees, unresolved alternatives, diagnostics, operation count, engine version and input profile revision. It is available after pending saves finish. Selected-rule previews do not masquerade as full-workspace runs.

New derivations are rerun and compared on the server. Their inventories, evidence snapshots and revision must match the current save boundary. Historical derivations imported from archives are replayed against their retained dictionary, grammar and lexical-policy snapshots. Invalid hashes, modified records, fabricated outcomes and invalid reference graphs are rejected. This is reproducibility checking, not cryptographic proof of who originally collected a source or performed a run.

Live symbolic analysis recomputes when the workspace changes. Retained runs never silently change. Exact sorted JSON dependency snapshots determine freshness; the originating revision remains visible. Translation runs conservatively depend on the whole lexicon, grammar, lexical policy and research evidence inventory. Adding a new alternative can invalidate a parse even when its old derivation did not use that entry. Unrelated profile descriptions and new result/history records do not invalidate existing analyses. Hypothesis metric snapshots use narrower per-hypothesis dependencies. This favors safe invalidation over minimal recomputation; it is not a minimal dependency optimizer.

A user can check an expected English string against a retained run. `supplied-target-1` compares NFC, whitespace-normalized, lowercase text for one resolved, renderable candidate; ambiguous and incomplete runs remain unresolved. Results are matches, differs or unresolved. Expectations are explicitly supplied after capture and are **not a held-out benchmark**, calibrated probability or measured language coverage. Changing evidence leaves both the old derivation and its old target check available, with the derivation marked stale.

## Persistence and portability

The migration chain is version 1 → version 2 → version 3. Version-2 revisions, mutation ledgers, entity identities, timestamps, optional fields and manual ratings are retained. The first migrated write preserves byte-for-byte `.v1.bak` or `.v2.bak` source bytes; reading does not rewrite the source. Pending save-queue profiles migrate too, preserving sealed mutation payloads and retry identities.

Research collections are bounded and append-only through both mutations and the compatibility PUT route. They share the profile's atomic save and revision checks. Concurrent changes to the research notebook produce a save conflict rather than merging potentially incompatible annotation chains. The pending local history is retained for recovery; the server refuses attempts to overwrite committed audit records. Explicit whole-project archive replacement remains a separate authorized restore operation.

Archives accept version-2 and version-3 profiles and export version 3. Restoring a copy gives current entities and research records new identities, remapping typed references and retained dependency inventories while preserving prose, meanings, hashes and prior outputs. Source captures and historical snapshots can retain references to notebook entities that were already removed; these remain historical references. Captured audio assets must still be present. JSON language-field import does not import research history; use `.xeno` for a complete project.

The current limits are 2,000 observations, 4,000 annotations, 1,000 hypotheses, 8,000 links, 4,000 events, 100 analyses, 1,000 target checks and 1,000 metric snapshots, subject to existing request/archive byte limits. Reaching a bound fails validation rather than silently pruning audit records. History lists initially show the latest 20 records per collection with a control to reveal more.

## Verification

See [implementation progress](implementation-progress.md), [testing](testing.md) and [W20 verification](verification/w20-research-evidence.json) for the measured revision, CI results and exact payload identities. Regression coverage includes version-2 files and sealed drafts, migration backups, legacy archives, hashes, immutable records, invalid spans/references, annotation chains, derived-evidence withdrawal, contradictory roots, exact replay, fabricated target checks, audio retention, ID remapping and save conflicts. The browser flow traces a translated word to competing evidence, saves a derivation, corrects its interpretation and checks stale history after backend restart and archive restore. Independent installed-app acceptance includes the research workflow and an eighth project archive.

W20 adds no language-model calls, calibrated probabilities or new scientific accuracy claims. Frozen W15, W18 and W19 experiment artifacts and algorithms remain unchanged.

## Reopen the recorded example

The [example project](verification/w20-research-project.xeno) retains the final synthetic browser scenario at implementation revision `309b9d7`. Import it as a new project from Field Log. It contains one original capture, its correction, a user acceptance decision, both supporting and contradicting links, a saved derivation, a supplied-target check and a prior count snapshot. The correction leaves the capture and prior results intact while invalidating the hypothesis and marking the old derivation/counts stale. It does not automatically rewrite the dictionary meaning. The archive was separately restored and its remapped derivation replayed.

The same history is available as [readable JSON](verification/w20-research-history.json). With the W20 implementation and this report's verification files checked out together, install the locked dependencies and run the [replay check](verification/w20-replay.mts) from the repository root:

```sh
npx tsx docs/verification/w20-replay.mts
```

The check validates the profile, capture hash and retained derivation, then verifies the preserved acceptance decision, later invalidation, stale dependencies and historical target outcome. This is a reproducible application scenario, not a language accuracy benchmark. [The inspector screenshot](verification/w20-research-correction.png) shows the two retained links after their interpretation becomes stale.
