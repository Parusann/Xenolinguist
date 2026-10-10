# Performance and accessibility

Author: Parusan Natheeswaran

W24 measurements compare the production client at `abd92f1` with the W24 implementation. Raw [before](verification/w24/performance-before.json), [after](verification/w24/performance-after.json), and bundle inventories retain values. Both runs used Windows, Ryzen 9 7900, 32 GB RAM, Node 25.8.2 and locked Playwright Chromium. Each synthetic project contains the stated number of samples **and** dictionary entries; 10,000 of each is approximately 4.7 MB JSON. No inference runs during measurement. Filesystem/browser caches were not flushed, there is no CPU throttling, and five input events are insufficient for a population percentile or hardware-independent SLA.

| Records per collection | Profile open before → after | Vocabulary open before → after | Sample input paint before → after | Dictionary search paint before → after |
| --- | --- | --- | --- | --- |
| 100 | 398 → 1,079 ms | 134 → 102 ms | 25–39 → 33–38 ms | 22–32 → 25–40 ms |
| 1,000 | 845 → 1,101 ms | 664 → 113 ms | 80–103 → 32–55 ms | 20–39 → 32–52 ms |
| 10,000 | 7,257 → 1,410 ms | 5,998 → 261 ms | 857–982 → 102–196 ms | 32–188 → 31–54 ms |

At 10,000, lexical translation input paint is 89–149 ms (before 124–154), the revision-checked description PUT is 227 ms (before 345), and a warm listing GET is 10 ms (before 64). Profile open includes navigation, lazy loading, listing, profile retrieval and visible editor readiness. The small-profile startup regression remains visible; this is a route-loading tradeoff, not a universal speedup. Input timing uses a capture-phase input listener followed by two animation frames, so includes rendering and task contention; save timing is an API round trip, not end-to-end close durability. Native inference cancellation is measured separately in [the W23 installed evidence](audio-evaluation.md#sixth-unit-verification-at-the-frozen-revisions), at 46.2 ms in that five-minute cancellation case; no W24 inference improvement is claimed.

Samples and vocabulary now render pages of 50, reset on a changed filter, and clamp when results shrink. Matching and lexicon indexes retain revision/policy memoization. Landing reads summary counts from the listing API. The server caches at most 512 validated summaries against primary/previous-file identity, size and nanosecond modification/change times; it rechecks file identity before caching and retains recovery errors. It still enumerates authoritative profile files. External modifications, replacement and corrupt recovery pairs are tested.

Marketing and workbench have separate lazy route chunks; phone and transcription code load on demand, and the decorative marketing canvas loads lazily. The entry JS decreases from 694,441 bytes (201,916 gzip) to approximately 381 KB (118 KB gzip), but the workbench adds approximately 289 KB (81 KB gzip). This is deferred transfer and execution, **not** a 45% reduction in total workbench code. [Exact output sizes and hashes](verification/w24/bundle-after.json) include workers and route chunks. The rendering error boundary keeps the save providers mounted and retries the view without reloading drafts. Queue snapshots copy mutable containers while retaining immutable validated profile references; a delayed-write regression checks that later typing/edits cannot change earlier queued snapshots.

The proposed <100 ms editing budget is met in these 100/1,000 cases, but **not** at 10,000. The measured 10,000 target for this release is <200 ms input paint and <200 ms indexed lookup on this host; all five observed events meet it, narrowly for sample typing. This is a transparent revision of the initial target, not a guarantee. Full-record validation/storage and small-profile startup remain optimization opportunities. Moving draft persistence off the UI thread requires preserving acknowledgments and restart/close semantics; delaying a write must never label an unwritten draft durable.

## Accessibility scope

Automated axe checks cover Samples, Vocabulary and Translation at 1280×800, 1440×900 and 640×400, plus the public page at widths 390 and 768. The 640×400 viewport is a reflow proxy, **not** an actual browser 200% zoom or screen-reader certification. [Before](verification/w24/accessibility-before.json) and [after](verification/w24/accessibility-after.json) preserve scopes and findings. Nine core states and both public widths have zero automated WCAG A/AA violations in the local run; incomplete checks still require human judgment.

Changes include visible focus, stronger muted-text contrast, persistent names, semantic word/sample buttons, keyboard-operable pagination, focusable translation output, current-phase indication and responsive columns. Ctrl/Cmd+K now works inside inputs; the command palette exposes a combobox/listbox, supports arrows/Enter/Escape, retains focus on Tab and restores its trigger. Keyboard regression traverses pages, filters a last-page word, selects it and opens/closes commands. Reduced-motion CSS suppresses transitions, and decorative canvas effects honor the initial preference. A real assistive-technology session and physical 200% desktop zoom remain explicit manual checks in release readiness; automated scans do not establish those results.

## Reproduce

```powershell
npm ci
npm run check:source
npx playwright install chromium
$env:XENO_PERFORMANCE='1'
npx playwright test tests/e2e/performance.spec.ts
Remove-Item Env:XENO_PERFORMANCE
npx playwright test tests/e2e/accessibility.spec.ts tests/e2e/large-profile.spec.ts
npm run test:public
```

The performance test is excluded from ordinary CI unless explicitly enabled, avoiding misleading skipped performance gates. Functional pagination, summary recovery, queue snapshots and automated accessibility remain required source gates. Results use isolated synthetic data and never open the owner's projects.
