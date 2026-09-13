# Screenshot provenance

The `w11-*` captures show the W11 implementation preview at 1440 × 1000 on September 13, 2026. They were produced by passing Playwright flows and visually reviewed. Source and image hashes are in [W11 evidence](../verification/w11-presentation.json).

- [Public hero](w11-hero.png), [dictionary widget](w11-dictionary.png) and [download distinction](w11-download.png): the public build at `/Xenolinguist/`, with reduced-motion preference enabled. The widget uses the shared fictional corpus and no model/API calls.
- [Workbench](w11-workbench.png): the new Eridian demo created through a real isolated authenticated backend. Chat is unavailable; model availability/output is not mocked. Finite entrance animations are settled for capture. This is a browser workbench screenshot, not native installer certification.

Run `npm run test:public` for current public screenshots under `test-results/public-browser/`. Run `npm run test:e2e` for the workbench capture under `test-results/browser/`. Tests do not automatically replace checked-in images; inspect and copy only after successful checks.

Other PNGs in this directory are historical captures from earlier versions. Their old model badges, confidence labels and feature descriptions should not be used as evidence of current behavior. The older `scripts/capture-screenshots.mjs` predates the authenticated workbench and is not the current acceptance workflow.
