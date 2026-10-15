# Final candidate verification

Author: Parusan Natheeswaran

Candidate **1.1.0-rc.1**, Windows x64, source `00a25d525dcc0c713b25ed244e391ad84e1454e8`. This directory retains release evidence after temporary CI artifacts expire. The candidate remains a draft; publication, a main-branch merge and Pages deployment are separate actions.

[Owner review: GitHub draft release](https://github.com/Parusann/Xenolinguist/releases/tag/untagged-5e729b3e0a8025bd0b23). Draft assets are visible only to authorized repository users until publication; this is not a public download link. All 13 uploaded asset digests match the retained local files in [the release record](draft-release.json).

## Verification scope

The [source workflow](https://github.com/Parusann/Xenolinguist/actions/runs/38364842606) runs locked Windows/Linux lint, types, unit/tooling, browser/public checks and deterministic evaluation. The [installer workflow](https://github.com/Parusann/Xenolinguist/actions/runs/38364842792) builds once, then gives the exact installer and independent harness to separate fresh-install and upgrade runners.

The source records distinguish environment-gated native unit cases from required native execution in the installed app. The independent acceptance covers actual native phone/transcription/synthesis execution, missing-model failure, cancellation, archive round trips and recovery. The upgrade gate installs checksum-pinned v1.0.0 followed by the candidate in an accented path, checks every payload file, runs legacy migration and crash recovery, and uninstalls. Controlled legacy data is exercised in the new runtime; the old app is not launched.

The first upgrade attempt at `09810ef` failed Whisper execution in an accented installation directory while fresh installation passed. Relative native asset resolution in `3565bae` repaired the observed failure. The failure remains in [its workflow](https://github.com/Parusann/Xenolinguist/actions/runs/38098011560); it is not removed from the record. A later [run](https://github.com/Parusann/Xenolinguist/actions/runs/38363997467) exited inside an installer with code `-1073741819` before runtime acceptance. Its stage was not identifiable from the old log. The final harness records each installer separately; a later passing run does not establish the cause of that native installer crash.

## Retained files

- `verification.json`: final workflow outcomes, exact counts and replay results.
- `installed.json`: native installed acceptance, boundaries, archives and recovery.
- `upgrade-attempts.json`, `upgrade-install.json` and `upgrade-runtime.json`: installer/migration/recovery/uninstall and actual signature states.
- `payload-manifest.json`: full file inventory, source, lock and native identities.
- `release-manifest.json`: installer/evidence SHA-256 values and workflow links.
- `audit-all.json` and `audit-production.json`: advisory reports with lock identity; passing CI does not mean zero vulnerabilities.

The [recorded demonstration](../w26-demo/demo.mp4) uses the same source revision, reserved seed 104729, three supplied word meanings, two candidate plural rules and one observed answer. The [manifest](../w26-demo/demo-manifest.json) retains withheld truth for post-run audit, the derivation and the saved project. No model calls or readiness/output mocks are used. The video is captioned automation, not a human study.

## Checking retained bytes

The candidate and demo directories contain 14 JSON records. Git text normalization is disabled for them so their SHA-256 values remain stable across Windows and Linux checkouts. Compare each downloaded asset with its digest in `draft-release.json`; the installer hash must also match the candidate stage in `upgrade-attempts.json` and `release-manifest.json`. These identity checks do not substitute for publisher signing.

## Limits

Review [release exclusions](../../release-checklist.md) and [known limitations](../../limitations.md). This is an unsigned candidate; hashes establish file identity, not publisher authentication or bit-for-bit reproducible builds. Human screen-reader use, physical audio devices, arbitrary Unicode temporary paths, every historical profile, NSIS power-loss recovery and automatic update application are not certified. Strict offline checks cover application behavior and Chromium requests, not all OS or external Ollama traffic. Research results retain their individual datasets and failure rates.
