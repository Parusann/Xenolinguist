# README and public-site review — 2026-10-13

## What changed

The default-branch README and deployed Pages site still described the earlier workbench. The presentation now starts with an actual research demonstration, links the algorithms to their implementations, and gives measured results with their information budgets and failed controls.

| Previous presentation | Current presentation / evidence |
| --- | --- |
| Generic language-decoding and confidence claims | Bounded executable grammar, explicit ambiguity, source-linked derivations and user belief distinguished from measured accuracy |
| AI capability presented without an evaluation boundary | Controlled proposals and explicit review, with zero application-eligible reserved candidates retained in the comparison |
| Broad phonetic / IPA language | English-trained TIMIT ARPABET; separate acoustic pilot errors and recurring transcription failures |
| Blanket offline / privacy claims | Local project data, explicit asset/model setup, application-level strict-offline policy and network-dependent downloads |
| JSON backup described as complete | Checksummed .xeno archives retain recordings; standalone exports do not |
| Stale test counts | Clearly dated frozen release checkpoint; current presentation validation recorded separately below |
| MIT / open-source language on the deployed site | Actual proprietary license and preserved third-party notices |
| Workbench action on static Pages | Working local dictionary demonstration, real recorded research loop, and version-specific download guidance |

## Verification

- README: all 46 linked implementation file/directory paths exist in the repository. Absolute branch links work from the default-branch README while implementation remains separate.
- Public regression suite: 11 checks pass, including dictionary behavior without API requests, keyboard interaction, animation controls, video decoding/playback under the Pages base path, accessibility scans at 390/768 px, and asset/layout checks at 320/390/768/1440 px.
- Visual review: desktop research/results sections and mobile hero; fixed navigation now has an opaque background so scrolling text does not collide with its links. Paragraph links are underlined, and the footer mark has readable contrast.
- Lint and TypeScript checks pass. The isolated full rerun passed 492 server + 37 client = 529 unit tests and 11 tooling checks; three existing native unit cases remain gated. An initial concurrent run timed out in two existing experiment tests; the isolated server rerun passed all 492 tests with its three pre-existing native gates.
- An initial public run caught footer/link contrast and an editing-time encoding issue in test selectors. Both were corrected before the passing run; no assertions were weakened.
- The website recording and poster are byte-for-byte copies from `docs/verification/w26-demo`. The MP4 SHA-256 is `4f48644f7a5236d415b51e0950d6958e4713eddbdafb715863b17769498b37df`. The recording is captioned automation of the real application, not newly staged results.

## Publication and release separation

GitHub Pages permits deployments from `main`. The Pages workflow therefore runs by explicit dispatch on `main`, with a required full source SHA. It checks out that immutable implementation commit, runs lint, type checks, unit/tooling and public browser gates, and deploys the exact tested static output. Automatic main pushes no longer rebuild the old main application. Future website publication uses:

```sh
gh workflow run pages.yml --ref main -f source_sha=<full-reviewed-implementation-SHA>
```

Only README and this deployment workflow are copied to main. This is a presentation update, not a merge of the application or an installer release. The verified `1.1.0-rc.1` installer remains a draft at its frozen revision; the public download remains the older `v1.0.0`. New website checks do not recertify a new native package. The historical release manifests, benchmark records and measured denominators remain unchanged.
