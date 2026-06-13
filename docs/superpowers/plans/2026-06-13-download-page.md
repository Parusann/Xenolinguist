# Download / Welcome Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public, welcoming download page for Xenolinguist (hosted on GitHub Pages, plus the same Download section in-app) with a one-click Windows installer wired to a published v1.0.0 GitHub Release.

**Architecture:** One React codebase, two builds. A build-time `VITE_PUBLIC_SITE` flag keeps the installed app pixel-identical to the locked prototype while the public Pages build adds a `DownloadSection` and re-points the hero CTAs to scroll to `#download` (the workbench can't run on a static host). The `/Xenolinguist/` base path is supplied only on the web build's CLI; `BrowserRouter` gets `basename={import.meta.env.BASE_URL}` so the public `/` route resolves under that subpath.

**Tech Stack:** Vite 8 + React 19 + react-router-dom 7, Vitest 2 + Testing Library, electron-builder (NSIS), GitHub Actions + GitHub Pages, `gh` CLI for the Release.

**Working dir:** `C:\Users\parus\Downloads\Xenolinguist-impl` on branch `feat/download-page` (already off `main` @ 48eeb29 which includes merged PR #7).

**Spec:** `docs/superpowers/specs/2026-06-13-download-page-design.md`

---

## File map

- Create `client/src/lib/site.ts` — `isPublicSite` flag + `DOWNLOAD_URL` constant.
- Create `client/src/vite-env.d.ts` — type the two new `VITE_*` env vars (file does not exist yet; `types: ["vite/client"]` has no index signature, so custom keys must be declared; `tsconfig.app.json` includes `src`).
- Create `client/src/components/marketing/DownloadSection.tsx` — the download/welcome block.
- Create `client/src/components/marketing/DownloadSection.test.tsx` — render test.
- Modify `client/src/marketing.css` — `.download-panel`, `.download-note`, `.download-list`, `.download-links`.
- Modify `client/src/components/marketing/HeroPage.tsx` — context-aware CTA + conditional `<DownloadSection/>` + version string.
- Modify `client/src/components/marketing/sections.tsx` — footer version string.
- Modify `client/src/main.tsx` — `basename={import.meta.env.BASE_URL}` on `BrowserRouter`.
- Create `client/public/404.html` — copied from the built `index.html` at deploy time (SPA fallback).
- Modify `electron/builder.config.cjs` — NSIS `artifactName`.
- Create `.github/workflows/pages.yml` — build + deploy the public site.

---

## Task 1: Build-time site flag + env types

**Files:**
- Create: `client/src/lib/site.ts`
- Create: `client/src/vite-env.d.ts`

- [ ] **Step 1: Create `client/src/lib/site.ts`**

```ts
// Distinguishes the two builds produced from this one codebase:
//   - desktop / in-app build  → VITE_PUBLIC_SITE unset → isPublicSite === false
//   - public GitHub Pages build → workflow sets VITE_PUBLIC_SITE=true
export const isPublicSite = import.meta.env.VITE_PUBLIC_SITE === 'true'

// Direct installer URL injected by the Pages workflow from the latest GitHub
// Release. Falls back to the releases page when not provided (e.g. local builds).
export const DOWNLOAD_URL =
  import.meta.env.VITE_DOWNLOAD_URL ||
  'https://github.com/Parusann/Xenolinguist/releases/latest'
```

- [ ] **Step 2: Create `client/src/vite-env.d.ts`**

The file does not exist. Create it as a global script (no imports/exports) so the
`interface ImportMetaEnv` merges with vite/client's via declaration merging:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SITE?: string
  readonly VITE_DOWNLOAD_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 3: Verify the client still type-checks / builds**

Run: `npm run build -w client`
Expected: clean build (one pre-existing harmless WaveformCanvas dynamic-import warning is OK).

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/site.ts client/src/vite-env.d.ts
git commit -m "feat(marketing): add public-site build flag and download URL"
```

---

## Task 2: DownloadSection component (TDD)

**Files:**
- Create: `client/src/components/marketing/DownloadSection.tsx`
- Test: `client/src/components/marketing/DownloadSection.test.tsx`
- Modify: `client/src/marketing.css`

- [ ] **Step 1: Write the failing test**

Create `client/src/components/marketing/DownloadSection.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import React from 'react' // test-file JSX uses the classic runtime here (repo convention)
import { render, screen, cleanup } from '@testing-library/react'
import { DownloadSection } from './DownloadSection'

afterEach(() => { cleanup() })

describe('DownloadSection', () => {
  it('renders a Windows download link pointing at the releases fallback', () => {
    render(<DownloadSection />)
    const link = screen.getByRole('link', { name: /download for windows/i })
    // VITE_DOWNLOAD_URL is unset under test, so DOWNLOAD_URL uses the fallback.
    expect(link.getAttribute('href')).toBe(
      'https://github.com/Parusann/Xenolinguist/releases/latest',
    )
  })

  it('states the SmartScreen "Run anyway" reality and the Ollama requirement', () => {
    render(<DownloadSection />)
    expect(screen.getByText(/run anyway/i)).toBeTruthy()
    expect(screen.getByText(/ollama/i)).toBeTruthy()
  })

  it('has an anchor id so CTAs can scroll to it', () => {
    const { container } = render(<DownloadSection />)
    expect(container.querySelector('#download')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w client -- DownloadSection`
Expected: FAIL — cannot resolve `./DownloadSection`.

- [ ] **Step 3: Create `client/src/components/marketing/DownloadSection.tsx`**

```tsx
import { DOWNLOAD_URL } from '@/lib/site'

const REPO = 'https://github.com/Parusann/Xenolinguist'

/** Public-site download / welcome block. Rendered only on the GitHub Pages
 *  build (see HeroPage). Built from the existing marketing CSS vocabulary so it
 *  reads as part of the locked design rather than a bolt-on. */
export function DownloadSection() {
  return (
    <section id="download" className="section">
      <div className="section-eyebrow">
        <span className="acc">05</span>
        <span className="ln" />
        <span>Get it</span>
      </div>
      <h2 className="section-title">
        Bring it <em>home.</em><br />
        Run it on your machine.
      </h2>
      <p className="section-sub">
        Xenolinguist is a desktop app. Download it once and work entirely
        offline — your samples, your dictionary, and the AI inference all stay on
        your machine.
      </p>

      <div className="download-panel">
        <div className="download-cta">
          <a className="btn-hero primary" href={DOWNLOAD_URL} download>
            <span>Download for Windows</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>↓</span>
          </a>
          <span className="download-meta">Windows 10 / 11 · 64-bit · v1.0.0</span>
        </div>

        <p className="download-note">
          Unsigned build — Windows may warn “unknown publisher.” Click{' '}
          <b>More info → Run anyway.</b> It’s open source, so you can{' '}
          <a href={REPO} target="_blank" rel="noreferrer">read every line</a> first.
        </p>

        <p className="download-note">
          AI features (translation, field notes) use a local{' '}
          <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a>{' '}
          model — free, and it runs on your machine. The rest of the workbench
          works without it.
        </p>

        <ul className="download-list">
          <li>Local-first — nothing leaves your machine</li>
          <li>Runs fully offline</li>
          <li>Voice decoding bundled (espeak-ng · whisper · IPA model)</li>
          <li>Import / export everything as JSON</li>
        </ul>

        <div className="download-links">
          <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">All releases →</a>
          <a href={REPO} target="_blank" rel="noreferrer">View source →</a>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Add styles to `client/src/marketing.css`**

Append (mirrors the `.demo-frame` glass treatment so it matches the locked design):

```css
/* Download / welcome block (public-site only) */
.download-panel {
  margin-top: 56px;
  max-width: 760px;
  padding: 32px 30px;
  border-radius: 18px;
  border: 1px solid var(--border-mid);
  border-top-color: var(--border-light-top);
  background: rgba(10, 14, 12, 0.62);
  backdrop-filter: blur(14px) saturate(1.3);
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.download-cta { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; }
.download-meta {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-mute);
}
.download-note {
  margin: 0;
  max-width: 620px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--fg-1);
}
.download-note a { color: var(--accent); text-decoration: none; }
.download-note a:hover { text-decoration: underline; }
.download-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--fg-mute);
}
.download-list li::before { content: "▸ "; color: var(--accent); }
.download-links { display: flex; flex-wrap: wrap; gap: 20px; }
.download-links a {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-dim);
  text-decoration: none;
}
.download-links a:hover { color: var(--fg); }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w client -- DownloadSection`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/marketing/DownloadSection.tsx client/src/components/marketing/DownloadSection.test.tsx client/src/marketing.css
git commit -m "feat(marketing): add download/welcome section"
```

---

## Task 3: Wire context-aware CTAs + conditional section into HeroPage

**Files:**
- Modify: `client/src/components/marketing/HeroPage.tsx`

- [ ] **Step 1: Add imports**

After line 6 (`import { PhasesSection, ... } from './sections'`), add:

```tsx
import { DownloadSection } from './DownloadSection'
import { isPublicSite } from '@/lib/site'
```

- [ ] **Step 2: Replace the navigate handler with a context-aware primary action**

Replace:

```tsx
  const navigate = useNavigate()
  const onEnterApp = () => navigate('/app')
```

with:

```tsx
  const navigate = useNavigate()
  // Public site has no workbench (static host, needs the local server + Ollama),
  // so CTAs scroll to the download block instead of opening /app.
  const onPrimary = isPublicSite
    ? () => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })
    : () => navigate('/app')
```

- [ ] **Step 3: Repoint every CTA from `onEnterApp` to `onPrimary`**

There are three `onClick={onEnterApp}` occurrences (nav button, and the two hero CTA buttons) and one prop pass `<FinalCTA onEnterApp={onEnterApp} />`. Change all four to use `onPrimary`:

- `<button className="btn-hero primary" ... onClick={onEnterApp}>` → `onClick={onPrimary}` (nav)
- `<button className="btn-hero primary" onClick={onEnterApp}>` → `onClick={onPrimary}` (Start decoding)
- `<button className="btn-hero" onClick={onEnterApp}>` → `onClick={onPrimary}` (Try the sandbox)
- `<FinalCTA onEnterApp={onEnterApp} />` → `<FinalCTA onEnterApp={onPrimary} />`

- [ ] **Step 4: Render the DownloadSection conditionally**

Between `<PrivacySection />` and `<FinalCTA ... />`, add:

```tsx
          {isPublicSite && <DownloadSection />}
```

- [ ] **Step 5: Update the hero version string**

Change `v0.7.2 — Eridian engine` (in the `.hero-meta` block) to `v1.0.0 — Eridian engine`.

- [ ] **Step 6: Verify desktop build is unchanged behaviorally and compiles**

Run: `npm run build -w client`
Expected: clean. (Desktop build: `isPublicSite` is false → no DownloadSection, CTAs still navigate to `/app`.)

- [ ] **Step 7: Commit**

```bash
git add client/src/components/marketing/HeroPage.tsx
git commit -m "feat(marketing): context-aware CTAs and conditional download section"
```

---

## Task 4: Footer version string + router basename

**Files:**
- Modify: `client/src/components/marketing/sections.tsx`
- Modify: `client/src/main.tsx`

- [ ] **Step 1: Update footer version**

In `sections.tsx` `HeroFooter`, change the `<span>v0.7.2</span>` to `<span>v1.0.0</span>`.

- [ ] **Step 2: Add `basename` to BrowserRouter**

In `client/src/main.tsx`, change `<BrowserRouter>` to:

```tsx
    <BrowserRouter basename={import.meta.env.BASE_URL}>
```

(Desktop `BASE_URL` is `/` — the default, so no behavior change. The public Pages build sets `BASE_URL` to `/Xenolinguist/` via the `--base` flag, which makes the `/` route resolve under the subpath instead of redirecting to the origin root.)

- [ ] **Step 3: Confirm no other stale version strings remain**

Run: `git grep -n "0\.7\.2" client/src`
Expected: no matches. (If any remain, update them to `1.0.0` and re-check.)

- [ ] **Step 4: Build + run the full client test suite**

Run: `npm run build -w client && npm test -w client`
Expected: build clean; tests pass (existing 15 + the 3 new DownloadSection tests = 18).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/marketing/sections.tsx client/src/main.tsx
git commit -m "feat(marketing): bump displayed version to v1.0.0; router basename for subpath hosting"
```

---

## Task 5: Verify the public build locally (preview gate)

No code change — this proves the web build before we wire CI. (HeroPage can't be unit-tested in jsdom because it mounts the Vanta/p5 backdrop, so this manual preview is the verification for Tasks 3–4's web behavior.)

- [ ] **Step 1: Build the public variant**

Run (PowerShell):
```powershell
$env:VITE_PUBLIC_SITE = "true"; npm run build -w client -- --base=/Xenolinguist/; Remove-Item Env:\VITE_PUBLIC_SITE
```
Expected: clean build. Output in `client/dist` with asset URLs prefixed `/Xenolinguist/`.

- [ ] **Step 2: Preview it**

Run: `npm run preview -w client -- --base=/Xenolinguist/`
Then load the preview using the preview tooling (preview_start / preview_snapshot / preview_screenshot) at the `/Xenolinguist/` path.

- [ ] **Step 3: Confirm, via snapshot/inspect**
  - The page renders and the new Download section is present (`#download`).
  - "Download for Windows" link href = the fallback `…/releases/latest` (no `VITE_DOWNLOAD_URL` locally).
  - Clicking "Start decoding" scrolls to the Download section (does NOT navigate to `/app`).
  - The SmartScreen "Run anyway" note and the Ollama line are visible.
  - The download panel visually matches the glass/accent aesthetic of the existing sections.

- [ ] **Step 4: Sanity-check the desktop build is untouched**

Run: `npm run build -w client` (no env, no base)
Load `client/dist/index.html` behavior is the in-app one: no Download section, CTAs target `/app`. (Confirmed by inspecting the built `index.html` asset base is `/` and the bundle excludes the section under the flag.)

No commit (verification only).

---

## Task 6: NSIS artifact name

**Files:**
- Modify: `electron/builder.config.cjs`

- [ ] **Step 1: Add a URL-friendly installer name**

In `electron/builder.config.cjs`, change the `win` entry from:

```js
  win: { target: ['nsis'] },
```

to:

```js
  win: { target: ['nsis'], artifactName: 'Xenolinguist-Setup-${version}.${ext}' },
```

(Produces `Xenolinguist-Setup-1.0.0.exe` — no spaces, friendlier URL. `latest.yml` references this name automatically, so electron-updater keeps working.)

- [ ] **Step 2: Commit**

```bash
git add electron/builder.config.cjs
git commit -m "build(electron): URL-friendly NSIS installer artifact name"
```

---

## Task 7: GitHub Pages workflow

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Deploy public site to Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Resolve latest installer URL
        id: dl
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          URL=$(gh api repos/${{ github.repository }}/releases/latest \
            --jq '.assets[] | select(.name|endswith(".exe")) | .browser_download_url' \
            2>/dev/null | head -1 || true)
          echo "url=$URL" >> "$GITHUB_OUTPUT"
      - name: Build public site
        env:
          VITE_PUBLIC_SITE: "true"
          VITE_DOWNLOAD_URL: ${{ steps.dl.outputs.url }}
        run: npm run build -w client -- --base=/Xenolinguist/
      - name: SPA fallback (404 = index)
        run: cp client/dist/index.html client/dist/404.html
      - uses: actions/upload-pages-artifact@v3
        with:
          path: client/dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Lint the YAML mentally / confirm indentation**

(No CI step here; the workflow runs after merge to `main`. The 404 copy is generated in CI, so no `client/public/404.html` is committed — keeping the desktop build clean.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: deploy public marketing/download site to GitHub Pages"
```

---

## Task 8: Build + publish the v1.0.0 Windows Release

This produces the real download artifact. Run from the impl worktree (it has `node_modules`, the vendored binaries, and the IPA model needed by the build).

- [ ] **Step 1: Build the installer**

Run: `npm run dist`
Expected: builds the desktop client + electron bundle, then electron-builder emits to `release/`:
`Xenolinguist-Setup-1.0.0.exe`, `Xenolinguist-Setup-1.0.0.exe.blockmap`, `latest.yml`.

- [ ] **Step 2: Confirm the artifacts exist**

Run: `git -C . status` is irrelevant (release/ is build output). Instead list:
`ls release/Xenolinguist-Setup-1.0.0.exe release/latest.yml release/Xenolinguist-Setup-1.0.0.exe.blockmap`
Expected: all three present.

- [ ] **Step 3: Publish the GitHub Release**

> Caveat: this PR must be merged with a **merge commit** (the repo convention), not a squash, so the tagged commit stays in history. Tag the release on the current branch HEAD so the download is live immediately.

```bash
git rev-parse HEAD   # note the SHA
gh release create v1.0.0 \
  "release/Xenolinguist-Setup-1.0.0.exe" \
  "release/latest.yml" \
  "release/Xenolinguist-Setup-1.0.0.exe.blockmap" \
  --repo Parusann/Xenolinguist \
  --target <SHA-from-above> \
  --title "Xenolinguist v1.0.0" \
  --notes "First public release. Local-first workbench for decoding unknown languages. Windows installer (unsigned — Windows SmartScreen will prompt: More info -> Run anyway). AI features require a local Ollama install. Voice (espeak-ng / whisper / IPA) bundled."
```

- [ ] **Step 4: Verify the asset URL resolves**

Run: `gh release view v1.0.0 --repo Parusann/Xenolinguist --json assets --jq '.assets[].name'`
Expected: lists the three asset names. The button URL `…/releases/latest/download/Xenolinguist-Setup-1.0.0.exe` now 302s to the asset.

(No git commit — the Release lives on GitHub, not in the tree.)

---

## Task 9: Finish the branch + verification + handoff of manual steps

- [ ] **Step 1: Full green check**

Run:
```bash
npm test -w server
npm test -w client
npm run build -w client
npm run bundle
```
Expected: server 51 pass / 3 skip; client 18 pass; client build clean; "bundled electron/dist".

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/download-page
```

- [ ] **Step 3: Open the PR (use superpowers:finishing-a-development-branch to choose merge vs PR)**

```bash
gh pr create --repo Parusann/Xenolinguist --base main --head feat/download-page \
  --title "Download / welcome page + v1.0.0 release" \
  --body "Adds a public GitHub Pages download/welcome page (and the same Download section in-app via the VITE_PUBLIC_SITE flag), wired to the published v1.0.0 Windows installer. Desktop build is unchanged. See docs/superpowers/specs/2026-06-13-download-page-design.md."
```

- [ ] **Step 4: Merge with a merge commit** (preserves the v1.0.0-tagged commit):

```bash
gh pr merge --repo Parusann/Xenolinguist --merge <pr#>
```

- [ ] **Step 5: Surface the one manual step to the user**

GitHub Pages must be enabled once, by the repo owner: **Settings → Pages → Build and deployment → Source: "GitHub Actions"**. After that, the `pages.yml` run on the merge commit publishes `https://parusann.github.io/Xenolinguist/`. Re-run the workflow (Actions → "Deploy public site to Pages" → Run workflow) if the Release was published after the first Pages build so the button picks up the direct asset URL.

- [ ] **Step 6: Final confirmation**

Confirm the live site loads, the Download button downloads `Xenolinguist-Setup-1.0.0.exe`, and report the SmartScreen "More info → Run anyway" first-launch step as the one unavoidable friction (unsigned build).

---

## Self-review notes

- **Spec coverage:** §4 two-build model → Tasks 1,3,4; §5 Download section → Task 2; §6 release → Tasks 6,8; §7 Pages → Tasks 4(basename),5,7; §8 version strings → Tasks 3,4. All covered.
- **Type/name consistency:** `isPublicSite`, `DOWNLOAD_URL`, `onPrimary`, `#download`, `.download-panel/-cta/-meta/-note/-list/-links`, `artifactName: 'Xenolinguist-Setup-${version}.${ext}'`, asset `Xenolinguist-Setup-1.0.0.exe` — used consistently across tasks.
- **Honest non-test areas:** HeroPage web behavior, the Pages workflow, and the installer are verified by preview/build/dist (Tasks 5,8,9), not unit tests, because they can't run meaningfully in jsdom. This is intentional, not a skipped requirement.
