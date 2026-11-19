# Atlas beta completion and engineering review

Author: Parusan Natheeswaran

Reviewed November 12, 2026. Database and worker lifecycle follow-up verified November 16. Final dependency review November 19.

The completed implementation covers the initial specialist-research cycle (M0–M6) and the local personal Atlas beta (L1–L9). It lives on `research/decipherment` in [PR #8](https://github.com/Parusann/Xenolinguist/pull/8). The published installer and website are separate releases. Remote sharing, a proven specialist model and a continuously available cloud service are later goals.

## What is strongest today

The project combines inspectable linguistic algorithms with real application engineering. Comparisons retain alignments, competing paths, distinct-concept support, counterexamples, held-out predictions and source identities. Model output remains a proposal. The service enforces private ownership in PostgreSQL, bounds background work, rejects stale workers and makes recoverable database/object snapshots. The desktop transfers only reviewed selections and keeps its credential outside the renderer.

Those mechanisms are more meaningful than a large reference count or a successful training command. They let a reviewer inspect how a result was produced and how the program behaves when evidence, permissions or infrastructure fail.

## Review corrections

| Finding | Resolution |
| --- | --- |
| Selecting restic's first `--latest 1` result could restore an older backup because each staging path forms a separate group | Select the latest validated timestamp across Atlas snapshots; verify two successive real snapshots and restore the newer one. |
| Browser decoding silently removed a UTF-8 byte-order mark | Preserve it during decoding; ignore it only for parsing. Browser acceptance compares original BOM/CRLF bytes, and JSON parsing retains the raw input. |
| Upload review hid the provenance metadata and a failed file replacement could leave the old selection active | Show source rights and observed grammar in the final review; clear the previous selection before decoding a replacement. |
| Dataset deletion wording omitted older snapshots | Explain that live deletion does not rewrite encrypted historical backups. Retention and restore-time deletion handling are explicit gates before third-party data. |
| Research and setup documents described milestones as pending and blurred branch availability | Record the completed null result, separate the Atlas baseline from the closed-bijection research task and identify the source-only branch. |
| Linux CI exposed a race between pool shutdown and forced deletion of the disposable database | Wait for server-side connections to drain, then drop only validated disposable databases without force. Handle idle-connection loss without a process crash or credential-bearing log. |
| Losing the worker's leadership connection could leave its status active, and a failed leadership query could retain a pool checkout | Mark the worker unavailable immediately, stop scheduling and abort computation; drain work and destroy the failed connection on shutdown. Verify failed startup and a terminated leader followed by a sequential restart against real PostgreSQL. |

## Verification boundaries

The [local review manifest](verification/l9-local-review.json) ties the source-check counts, lockfile identity, audit records and acceptance phases together.

- [Database and HTTP checks](verification/l9-leader-foundation.json): 32 phases covering accounts, forced RLS, immutable uploads, jobs, cleanup and desktop authorization, including recovery from a terminated idle connection without retaining tenant context, failed worker startup and lost leadership followed by restart.
- [Actual Electron entry](verification/l9-review-desktop.json): six phases covering approval, reviewed transfer, OS-protected credentials, proposal staging, restart and offline editing, rerun with Electron 42.11.18.
- [Browser review regression](verification/l9-review-browser.json): eleven phases and six automated WCAG A/AA audits, with zero page/CSP errors, including BOM/CRLF originals and invalid replacement files. Automated audits do not certify full accessibility. The separate November 6 demonstration retains its original recording and result.
- [Recovery and HDD measurements](atlas-recovery.md): populated two-account recovery plus separate primary snapshot restores; checksum/fingerprint equality, private access and saved-report replay. Performance uses one host, warm caches and declared small samples.
  The [November 16 follow-up](verification/l9-drain-recovery.json) passes all eight recovery phases with connection-draining teardown.
- The new [Atlas CI workflow](../.github/workflows/atlas.yml) checks database and browser behavior independently on Linux. Existing source and installed-Windows workflows remain separate gates. The PR checks identify results for the exact pushed revision.
- [Live website review](verification/l9-live-site-review.json): the published cinematic translation pauses and resumes advancing, the dictionary preserves meanings and unknown markers, and the 390-pixel mobile viewport has no horizontal overflow. No page errors or failed HTTP responses were observed. This checks the published site separately from the source-only Atlas beta.

The November 19 audit reports zero production entries and six moderate development entries in Electron packaging. TypeScript ESLint now uses a patched minimatch release. The dated review explains why the earlier CI audit temporarily reported five high production entries and identifies the two packaging copies the audit still flags. [Versions, audit records and remaining scope](dependency-review.md)

The [captioned demonstration](verification/l9-atlas-demo/atlas-demo.mp4) uses a licensed known-English control and insufficient unglossed evidence. It proves a usable workflow, not the decipherment of an unknown natural language.

## Research assessment

The frozen candidate did not improve the reserved lexical outcome: both base and adapter recovered 0/8 identifiable mappings and handled 16/24 uncertain items correctly. Both abstained throughout the study. The 96 training targets contain 24 identified answers, 24 ambiguity abstentions and 48 insufficient-evidence abstentions. That composition suggests a testable response-policy hypothesis; it does not establish why training failed. [Model card and retained evidence](decipherment-model-card.md)

Atlas's 550 correct emitted proposals across its 128-case controlled study validate a narrow synthetic substitution method. They do not measure natural-language reconstruction. The six-language reference set is deliberately small, with source licenses and missing mappings exposed. [Comparison method](atlas-comparison.md)

## What should happen next

1. **Diagnose the all-abstention result using development data.** Separate response-format constraints, uncertainty policy and target balance. Retain per-case raw predictions, useful-answer coverage and false claims. Do not spend on a larger training run until a small controlled intervention improves the declared development behavior.
2. **Produce an independent linguistic-quality result.** Curate a licensed held-out form-prediction task with supplied relatives, family-aware separation, unrelated/borrowing controls and simple alignment baselines. Freeze the data and scorer independently of tuning. Publish coverage and errors, including unsupported proposals.
3. **Choose one justified model experiment.** Freeze one change, matched base/symbolic controls, resource bounds and a fresh holdout before final evaluation. The original reserved set has been inspected and must not become a reusable tuning target.
4. **Prepare recovery for irreplaceable data.** Add a genuinely independent copy and portable key recovery, provision roles on a clean host, test a full restore, and establish retention plus deletion handling. Keep the current E: test setup until that separate storage decision is made.
5. **Then open a small private group.** Add HTTPS enrollment and explicit sharing, enforce revocation at retrieval and job publication, and test realistic workloads before claiming multi-user capacity. Public hosting remains optional.

These follow-ups are sequenced research and operational decisions. They are not hidden requirements for the reproducible-data personal beta, nor evidence that a general decipherment specialist already exists.
