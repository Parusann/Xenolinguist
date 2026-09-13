# Public presentation and capability claims

W11 aligns the website build and current documentation with the implementation preview. The published v1.0.0 installer and Pages deployment remain separate. The source is publicly viewable under the existing proprietary license; W11 changes no license or third-party notice.

## One Eridian source

`shared/demo-language.ts` defines `eridian-demo-2`. `shared/demo-presentation.ts` derives the website lookup and displayed examples directly from its dictionary and sample records. The app's demo endpoint uses that same seed. The update adds explicit dictionary entries for the counting example's three/four words, which previously existed only in number mappings. Existing profile documents are not rewritten.

The hero is an illustrative rotation of saved glosses with the saved sentence interpretation shown separately. It does not run inference or simulate measured confidence. The public widget is local exact dictionary lookup, with a fixed input limit and explicit unknowns. It does not infer grammar, translate unseen compositions or call an LLM. Its word-match count is coverage of the given input against the demo dictionary, not accuracy.

## Prominent claims and supporting evidence

| Statement shown to visitors | Evidence | Boundary shown with it |
| --- | --- | --- |
| Website and app share Eridian meanings | `demo-presentation.test.ts`, `tests/e2e/demo-presentation.spec.ts` | Versioned fictional seed; existing saved profiles remain unchanged |
| Widget runs in the browser without AI | `tests/public/marketing.spec.ts` observes requests while typing and redirecting | Exact lookup only, unresolved words remain [?] |
| Local work can proceed without chat | W10 independent capability probe and W11 real demo screenshot | AI needs separately installed model/runtime; file availability is not inference success |
| Original recordings are retained | W06 browser lifecycle checks and W10 Windows artifact evidence | JSON contains audio references, not recording bytes |
| Phone analysis is approximate ARPABET | Hash-identified W05/W10 native results | English-trained model, constrained WAV input, no universal/click-phoneme claim |
| Model inference is controlled locally | W10 metadata, HTTP cancellation and actual model checks | Relies on truthful local daemon metadata; no broad quality or latency guarantee |
| Sessions and partial proposals persist | W07/W10 browser/native recovery checks | Generated keys can be inconsistent; bounded history and unflushed-fragment limits |
| Download is v1.0.0, distinct from preview | GitHub API metadata and direct asset HEAD | Old unsigned installer; new reliability work has not been released |
| Source is viewable, proprietary | Existing `LICENSE` unchanged | No general reuse rights; dependencies retain their licenses |

Detailed definitions: [feature reference](FEATURES.md), [limitations](limitations.md), [runtime jobs](runtime-jobs.md), [testing](testing.md), [release guide](desktop-release.md).

## Build, navigation and links

`VITE_PUBLIC_SITE=true` selects the public variant. The page mounts no workbench providers; `/app` redirects to download information. “Try dictionary demo” reaches the interactive widget, while “Download for Windows” leads to the versioned download section. The local build's primary action opens `/app`.

Git source identity is injected at build time, with `+working` when client/shared files have local changes and `unversioned` for source archives lacking Git metadata. This label is separate from the installer version. Release version, date, size and URL are pinned together in `client/src/lib/site.ts`, rather than resolving a new latest asset while retaining an old version label. They must be reviewed together at the next release.

The public test build uses `/Xenolinguist/`, checks assets and internal anchors, and exercises keyboard controls plus reduced-motion preferences. Widths 320, 390, 768 and 1440 px are tested and screenshots reviewed. The direct installer, release page, public site, repository branch, license and Ollama links respond successfully to the recorded external HEAD checks. New documentation links resolve to repository files before push and can be checked on GitHub after publication.

## Screenshots and publication

[Current screenshots](screenshots/README.md) were captured only after the associated browser flows passed. They are preview screenshots, not representations of the published installer. The workbench capture uses a real isolated backend and no model-status fixture; chat is unavailable and manual work is visible. Screenshot bytes and source hashes are retained in [W11 evidence](verification/w11-presentation.json).

The live Pages site deploys from `main`. This package updates the implementation branch and does not publish the website or an installer. CI/release gates, portable archives, a deterministic compiler and scientifically scored model comparisons remain the roadmap.
