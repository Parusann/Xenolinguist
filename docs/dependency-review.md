# Dependency review

Reviewed 2026-09-13 for W12. The source lockfile is the version authority. Run `npm ci`, `npm run check:source`, `npm run test:e2e:run`, `npm run test:public` and `npm run audit:record` to reproduce the source checks and current audit. Advisory data changes independently of the lockfile.

The initial audit contained 39 affected package entries (4 critical, 25 high, 8 moderate, 2 low). After the updates, both the complete and production-only audits contain four high entries, representing two dependency families and their parent dependency propagation. Counts are not counts of independently exploitable application defects. CI retains both JSON reports with the lockfile hash. Audit service/format failures fail the audit step; known advisory counts remain a review signal, not a claim that CI certifies a vulnerability-free application.

| Group | Change and verification scope |
| --- | --- |
| Tests and bundling | Both workspaces use Vitest 4.1.11; Vite resolves to 8.3.0, esbuild to 0.28.2 and tsx to 4.23.13. This removes the old Vitest/Vite development-server chain. Unit suites, TypeScript, production builds and browser flows are checked after the update. |
| HTTP server | Express 4.22.2 and Express 4 type definitions 4.17.25 now use the same major API. The root override pins qs 6.16.0, including Express's narrower declared tilde range. HTTP contract tests and browser requests verify the selected parser with the bundled backend. npm 11's workspace `npm ls qs` may still label Express's declared range invalid; the explicit override and lockfile intentionally select 6.16.0, and locked installation is checked in CI. Revisit the override when Express accepts the patched range. |
| Desktop packaging | Electron stays on major 42 and resolves to 42.11.3; electron-builder resolves to 26.15.3 and electron-updater to 6.8.9. `7zip-bin` 5.2.0 is an explicit development dependency because manifest provisioning invokes its Windows extractor directly; it is no longer inherited from the builder. Native acceptance uses the resulting executable, not the development Electron executable. |
| Native inference | Transformers.js 4.2.0, onnxruntime-node 1.24.3, sharp 0.34.5 and the manifest-pinned model bytes remain paired. No unverified major native-library override is used to suppress audit findings. |

## Outstanding dispositions

| Dependency / advisory | Observed reachability and disposition |
| --- | --- |
| adm-zip 0.5.x: [allocation denial of service](https://github.com/advisories/GHSA-xcpc-8h2w-3j85), [destination symlink overwrite](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9) | onnxruntime-node's `script/install-utils.js` opens downloaded NuGet archives and extracts selected native binaries during dependency installation. The dependency is also present in the staged runtime tree. The app's current audio/profile routes do not accept ZIP archives through this helper. Retain the pinned native chain pending an upstream compatible update; review installation/download trust and do not reuse this archive helper for W13 project imports. A fixed allocation release does not also establish a fix for the later symlink advisory. |
| sharp 0.34.5: [libvips findings](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [libheif findings](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | Transformers includes sharp for image processing, and it ships in the runtime closure. Current inference prepares PCM audio for the phone model; there is no image-upload inference endpoint. This limits the observed route to the affected image parsers but is not proof of unreachability under every dependency path. Retain pending a supported Transformers/sharp update and rerun installed inference when the native chain changes. |
| Transformers / onnxruntime-node audit entries | These are propagated dependency findings from the two families above. They are not separate demonstrated faults in the phoneme model or inference API. |

No applicable complete fix was offered by the reviewed audit for these remaining native families. Recheck before any public installer release and before introducing archive/image input. The current acceptance suite verifies packaging and application behavior; it is not an exploit test or security certification. Existing licenses and native notices remain required.

W13 review on 2026-09-15 adds yauzl 3.4.0 and yazl 3.3.1, bundled into the backend, for portable project archives. Imports use sequential entry streams, separate actual-byte/digest checks and generated staging filenames; they never invoke adm-zip or a general-purpose extract-all operation. The locked full and production audits still contain the same four high native-chain entries. See [archive boundaries and negative tests](project-archives.md).
