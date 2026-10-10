# Dependency review

Reviewed 2026-09-13 for W12. The source lockfile is the version authority. Run `npm ci`, `npm run check:source`, `npm run test:e2e:run`, `npm run test:public` and `npm run audit:record` to reproduce the source checks and current audit. Advisory data changes independently of the lockfile.

The initial audit contained 39 affected package entries (4 critical, 25 high, 8 moderate, 2 low). After the W12 updates, both the complete and production-only audits contained four high entries, representing two dependency families and their parent dependency propagation. The dated reviews below supersede those historical counts. Counts are not counts of independently exploitable application defects. CI retains both JSON reports with the lockfile hash. Audit service/format failures fail the audit step; known advisory counts remain a review signal, not a claim that CI certifies a vulnerability-free application.

| Group | Change and verification scope |
| --- | --- |
| Tests and bundling | Both workspaces use Vitest 4.1.11; Vite resolves to 8.3.0, esbuild to 0.28.2 and tsx to 4.23.13. This removes the old Vitest/Vite development-server chain. Unit suites, TypeScript, production builds and browser flows are checked after the update. |
| HTTP server | W12 aligned Express 4.22.2 and Express 4 type definitions 4.17.25. The October 8 update below moves Express to 4.22.3, whose qs range accepts the existing 6.16.0 override. The prior invalid-range warning is resolved; HTTP contract tests and browser requests verify the selected parser with the bundled backend. |
| Desktop packaging | Electron stays on major 42 and resolves to 42.11.3; electron-builder resolves to 26.15.3 and electron-updater to 6.8.9. `7zip-bin` 5.2.0 is an explicit development dependency because manifest provisioning invokes its Windows extractor directly; it is no longer inherited from the builder. Native acceptance uses the resulting executable, not the development Electron executable. |
| Native inference | Transformers.js 4.2.0, onnxruntime-node 1.24.3, sharp 0.34.5 and the manifest-pinned model bytes remain paired. No unverified major native-library override is used to suppress audit findings. |

## Outstanding dispositions

| Dependency / advisory | Observed reachability and disposition |
| --- | --- |
| adm-zip 0.5.x: [allocation denial of service](https://github.com/advisories/GHSA-xcpc-8h2w-3j85), [destination symlink overwrite](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9) | onnxruntime-node's `script/install-utils.js` opens downloaded NuGet archives and extracts selected native binaries during dependency installation. The dependency is also present in the staged runtime tree. The app's current audio/profile routes do not accept ZIP archives through this helper. Retain the pinned native chain pending an upstream compatible update; review installation/download trust and do not reuse this archive helper for W13 project imports. A fixed allocation release does not also establish a fix for the later symlink advisory. |
| sharp 0.34.5: [libvips findings](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [libheif findings](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | Transformers includes sharp for image processing, and it ships in the runtime closure. Current inference prepares PCM audio for the phone model; there is no image-upload inference endpoint. This limits the observed route to the affected image parsers but is not proof of unreachability under every dependency path. Retain pending a supported Transformers/sharp update and rerun installed inference when the native chain changes. |
| Transformers / onnxruntime-node audit entries | These are propagated dependency findings from the two families above. They are not separate demonstrated faults in the phoneme model or inference API. |

At the W12 review, no applicable complete fix was offered by the reviewed audit for these remaining native families. Recheck before any public installer release and before introducing archive/image input. The current acceptance suite verifies packaging and application behavior; it is not an exploit test or security certification. Existing licenses and native notices remain required.

W13 review on 2026-09-15 adds yauzl 3.4.0 and yazl 3.3.1, bundled into the backend, for portable project archives. Imports use sequential entry streams, separate actual-byte/digest checks and generated staging filenames; they never invoke adm-zip or a general-purpose extract-all operation. The locked full and production audits still contain the same four high native-chain entries. See [archive boundaries and negative tests](project-archives.md).

## W22 audit refresh — 2026-10-01

At implementation revision `117f2d3`, the [retained full audit](verification/w22-grammar-audit-all.json) reports five high and one moderate affected package entry; the [production audit](verification/w22-grammar-audit-production.json) reports four high entries. The lockfile did not change in this unit. Newly reported development-tool findings are `brace-expansion` (high) and `fast-uri` (moderate). These counts distinguish affected package entries from individual advisory records.

`npm ls brace-expansion fast-uri --all` locates brace-expansion 1.1.18 under ESLint, 5.0.9 under TypeScript ESLint and electron-builder, and 2.1.4 under electron-builder's universal/filelist paths. The audit reports recursion/expansion denial-of-service advisories. Fast-uri 3.1.7 is under electron-builder → app-builder-lib → ajv; its advisory concerns percent-encoded host normalization. These two findings are absent from the production-only audit; that fact alone does not establish safety of every development input.

Follow-up: update the affected build/lint dependency paths using compatible fixed versions, inspect the lockfile changes, and rerun source/browser and clean installed acceptance. The new audit also marks fixes available for the native dependency entries; compatibility of those updates with the pinned runtime/model chain has not been verified. Retain all current findings until the respective updates and verification are complete. No dependency change or vulnerability remediation is claimed by the grammar-workflow checkpoint.

The W22 learning-curve freeze `af1a197` leaves dependencies unchanged. Its [full audit](verification/w22-curves-audit-all.json) again reports five high and one moderate affected package entry; its [production audit](verification/w22-curves-audit-production.json) reports four high entries. Both Windows/Linux source and independent installed acceptance pass at that revision, but functional acceptance does not remediate these findings. The update work above remains open.

## W23 audit refresh — 2026-10-03

The W23 acoustic metadata unit `4342cb6` leaves the dependency lockfile unchanged. Production audit reports 4 high entries; the full audit reports 13 high and 1 moderate entries. [Full](verification/w23-ctc-audit-all.json) and [production](verification/w23-ctc-audit-production.json) audit bytes are retained from source CI. Passing native/source/installer checks does not remediate these findings; the update work above remains open.

Compared with W22, the full audit adds eight high affected-package entries: `http-cache-semantics` plus the propagated `cacheable-request`, `got`, `@electron/get`, `app-builder-lib`, `dmg-builder`, `electron-builder-squirrel-windows` and `electron-builder` entries. These are not eight independent demonstrated defects. The reported advisory is GHSA-ch52-4w7c-c8xp, described in the retained audit as max-stale handling that can disclose cross-user cached responses.

The installed development path is electron-builder 26.15.3 → app-builder-lib 26.15.3 → @electron/get 3.1.0 → got 11.8.6 → cacheable-request 7.0.4 → http-cache-semantics 4.2.0. Electron itself uses a separate @electron/get 5.0.0. The new family is absent from the production-only audit; that does not establish safety for every build input. The audit's suggested builder change targets 26.5.0 and is marked breaking, so it must not be treated as an automatically verified compatible update. Review the actual fixed dependency path, preserve build/runtime compatibility and rerun installed acceptance before claiming remediation. Native-chain, brace-expansion and fast-uri findings also remain open.

## W23 windowing audit refresh — 2026-10-04

At W23 windowing revision `57703a9`, the lockfile is unchanged. Production audit retains 4 high entries; full audit reports 6 high and 1 moderate entries. The [full](verification/w23-chunks-audit-all.json) and [production](verification/w23-chunks-audit-production.json) audit reports are retained from source CI. Source/installed acceptance verifies behavior, not vulnerability remediation; the preceding update work remains open.

The count decreases because the current audit no longer propagates the http-cache-semantics finding to seven parent package entries. The vulnerable http-cache-semantics 4.2.0 entry itself remains high. Its audit range is now `<=4.2.0`, its effects list is empty and `fixAvailable` is true, replacing the prior builder-downgrade suggestion. These are changes in the returned audit metadata with the same locked dependencies, not a remediation performed by this unit. Recheck the now-offered compatible dependency update and rerun source/installed acceptance before claiming it fixed. The native chain, brace-expansion and fast-uri entries also remain unresolved.

## W23 annotation-layer audit — 2026-10-06

Frozen revision `9192533` changes no locked dependency. The October 6 CI audit reports 1 critical, 7 high and 9 moderate entries overall; production reports 1 critical, 5 high and 3 moderate entries. Windows and Linux report the same counts. [Full audit](verification/w23-layers-audit-all.json), [production audit](verification/w23-layers-audit-production.json) and [source/installed verification](verification/w23-layers-verification.json) preserve the observations. Passing annotation tests and installed acceptance do not remediate these findings; previously documented dependency work remains open.

The critical entry is `proxy-addr` 2.0.7, with the audit reporting IPv4-mapped IPv6 trust-subnet spoofing ([GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)). Newly reported production findings also include `source-map-js` and the `sprintf-js` / `roarr` / `global-agent` chain. These are current audit observations against unchanged dependencies, not vulnerabilities introduced or fixed by this annotation unit. Compatible update validation and an application-specific reachability assessment remain required before claiming remediation.

The advisory identifies 2.0.8 as patched and describes exploitation through incorrectly configured trusted proxy subnets. A local read of `createApp().get('trust proxy')` returns `false`; source inspection found no `trust proxy` override or `req.ip` authorization path. This does not remove the vulnerable dependency or establish a complete reachability assessment. Prioritize the compatible update and repeat source/installed validation before the next release.

## W23 compatible dependency remediation — 2026-10-08

A fresh audit before this update reported 3 critical, 7 high and 9 moderate affected-package entries overall; production reported 1 critical, 5 high and 3 moderate. In addition to proxy-addr, the full audit now identifies shell-quote and its concurrently parent as critical. These counts are a fresh baseline, not the October 6 snapshot.

| Dependency | Locked change | Reason |
| --- | --- | --- |
| proxy-addr | 2.0.7 → 2.0.8 | Fix IPv4-mapped trust-subnet handling ([GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)). The app still disables trust proxy. |
| shell-quote | 1.9.0 → 1.11.0 | Fix line terminators after comment tokens ([GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)). concurrently 9.2.4 pins 1.9.0, so an explicit root override selects the patched version. Revisit this override when upstream adopts a patched range. |
| Express | 4.22.2 → 4.22.3 | Accept the existing patched qs 6.16.0 range; prevent installation of a nested older parser and remove the invalid dependency-tree edge. |
| source-map-js | 1.2.1 → 1.2.2 | Apply the compatible patch selected by the current audit. |
| brace-expansion | 1.1.18 / 2.1.4 / 5.0.9 → 1.1.21 / 2.1.7 / 5.0.12 | Update all five locked build/lint copies. |
| fast-uri | 3.1.7 → 3.1.8 | Update the builder's URI parser. |
| http-cache-semantics | 4.2.0 → 4.3.0 | Update the builder's cache policy implementation. |

Two behavior regressions exercise malformed mapped trust subnets and all four shell line terminators after a comment, plus ordinary quoting round trips. The shell test never executes constructed commands. Local checks pass 485 unit tests, nine tooling tests, lint/type/build gates and nine browser cases covering session boundaries, audio lifecycle and retained annotations. Three native unit cases remain gated. Cross-platform source and independent installed acceptance are pending at this implementation checkpoint.

The final local audit reports **0 critical, 4 high and 8 moderate** entries overall and **0 critical, 4 high and 3 moderate** in production. No audited entry remains for the updated dependency families. The four high entries remain in Transformers/ONNX/adm-zip/sharp; their native versions and model bytes are unchanged. The moderate sprintf-js → roarr → global-agent chain remains, with additional propagated builder entries in the full audit. The registry still lists sprintf-js 1.1.3 as latest, while the audit suggests a breaking builder downgrade rather than a verified patch. Native compatibility work and review of that logging/proxy chain remain open. Audit counts are dated observations, not proof of application exploitability or a clean security certification.


Inspection of the remaining logging chain finds global-agent under both the ONNX installation helper and electron-builder's downloader. In global-agent's request agent, request URLs, response headers and serialized errors are context fields; the inspected logging calls use constant format messages. roarr still exposes sprintf formatting for supplied messages, so this observation narrows the inspected path without proving every possible caller safe. The production audit includes this installation dependency because it remains in the runtime package closure. Keep the finding open, avoid passing external format strings into it, and reassess a supported upstream fix before release.


At frozen revision `44deb8764b9d716e5ee12fd850eecf3b3e0e6c35`, [Windows/Linux source CI](https://github.com/Parusann/Xenolinguist/actions/runs/37733986164) passes all lint/type/build gates, 485 unit tests, nine tooling tests, 48 workbench checks and eight public checks on each platform. No browser cases are skipped, flaky or unexpected. All 12 regression, 60 induction, 336 number and 56 elicitation records replay on both platforms, with unchanged W19 number summaries. Three native unit tests remain gated.

[Independent installed acceptance](https://github.com/Parusann/Xenolinguist/actions/runs/37733986171) passes on a separate Windows runner, checking 3,772 files, eight archive round trips, native cancellation/recovery and two real phone analyses (49 runs each) with manual corrections retained through restoration. Pinned model bytes match the preceding checkpoint. Both CI audits match the final local counts: zero critical, four high and eight moderate overall; production retains four high and three moderate. The [verification record](verification/w23-deps-verification.json), [locked version changes](verification/w23-deps-lock-changes.json), [installed evidence](verification/w23-deps-installed.json), [full audit](verification/w23-deps-audit-all.json) and [production audit](verification/w23-deps-audit-production.json) retain the results. Linux audit hashes match the committed LF lockfile; Windows and installed hashes match its CRLF checkout bytes. Before-update audit reports retain the fresh October 8 baseline. Existing W23 CTC/window/annotation replays also pass. These checks do not establish recognition accuracy or remediate the remaining dependency families.


## W23 Whisper provenance checkpoint — verified 2026-10-09

Revision `e33c030` changes no dependency or native model bytes. Its October 8 [full audit](verification/w23-stt-audit-all.json) retains zero critical, four high and eight moderate affected-package entries; [production](verification/w23-stt-audit-production.json) retains zero critical, four high and three moderate. Windows and Linux agree. [Source and independent installed verification](verification/w23-stt-verification.json) passes the new transcription-provenance contract and existing regressions; it does not remediate the remaining findings documented above.
