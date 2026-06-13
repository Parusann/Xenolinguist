# Design — Xenolinguist Download / Welcome Page

Date: 2026-06-13
Branch: `feat/download-page` (off `main` @ 48eeb29, which includes the merged PR #7 full-audit)
Status: Draft for user review

## 1. Goal

Let a first-time visitor land on a public web page, understand what Xenolinguist
is, and **download + run it with as little friction as possible** — ideally one
click to get the Windows installer. The page must be reachable *before* the
visitor has the app, so it is hosted publicly on GitHub Pages (free; satisfies
the free+local project constraint).

## 2. Constraints (carried from project rules)

- **Free + local only** — no paid hosting, no paid code signing. Hosting is
  GitHub Pages; the installer is unsigned.
- **No AI attribution** in commits, PRs, or files.
- **Prototype-exactness** — the existing marketing/hero design is a locked 1:1
  port of the designer mock. We may *add* new sections in the same visual
  vocabulary, but must not alter or approximate the existing pixels.
- **Honesty** — the unsigned installer triggers Windows SmartScreen
  ("unknown publisher"); AI features require a local Ollama install. Both are
  surfaced plainly on the page, not hidden.

## 3. Locked decisions (from scoping)

| Decision | Choice |
| --- | --- |
| Hosting | GitHub Pages (public static export) **and** in-app — one source |
| Release artifact | Build **and publish** the Windows installer to a GitHub Release this session |
| Platforms | **Windows only** (only OS with vendored voice support today) |
| Git base | Merge PR #7 → branch `feat/download-page` from updated `main` (done) |
| Release version | **v1.0.0** (matches `package.json`); on-page version strings updated to match |

## 4. Architecture — one codebase, two builds

A build-time flag distinguishes the desktop app from the public website so the
same React app serves both without forking the design.

`client/src/lib/site.ts`:

```ts
// True only for the public GitHub Pages build (workflow sets VITE_PUBLIC_SITE=true).
export const isPublicSite = import.meta.env.VITE_PUBLIC_SITE === 'true'

// Direct installer URL injected by the Pages workflow from the latest GitHub
// Release; falls back to the releases page if not provided.
export const DOWNLOAD_URL =
  import.meta.env.VITE_DOWNLOAD_URL ||
  'https://github.com/Parusann/Xenolinguist/releases/latest'
```

### Desktop / in-app build (default, `VITE_PUBLIC_SITE` unset)
- HeroPage renders **exactly as today, pixel-for-pixel**. No Download section.
- Hero + FinalCTA CTAs keep `navigate('/app')` → opens the workbench.
- `base: '/'` (Electron serves the SPA over HTTP at `http://127.0.0.1:<port>`
  from root — confirmed in `electron/main.ts`). `vite.config.ts` is untouched.

### Public Pages build (`VITE_PUBLIC_SITE=true`)
- HeroPage additionally renders the **Download section** (`id="download"`).
- The hero CTAs ("Start decoding", "Try the sandbox", nav "Open workbench →")
  and FinalCTA "Open workbench" **smooth-scroll to `#download`** instead of
  navigating to `/app` (which can't run without the local server + Ollama).
  Same labels, same pixels — only the click target changes on web.
- `base: '/Xenolinguist/'` supplied **only** via the build CLI
  (`vite build --base=/Xenolinguist/`) so `vite.config.ts` and the desktop
  build stay unchanged. (Pages project URL: `parusann.github.io/Xenolinguist/`.)
- `client/public/404.html` is a copy of the SPA-redirect shim so deep links /
  refreshes resolve under BrowserRouter on Pages.

Net effect: every *addition* appears only on the public deploy. The installed
app remains a 1:1 port of the locked prototype.

### CTA wiring

`HeroPage` computes the primary action once:

```ts
const onPrimary = isPublicSite
  ? () => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })
  : () => navigate('/app')
```

`onPrimary` replaces today's `onEnterApp` at every call site (hero nav button,
hero CTAs, FinalCTA). Behavior on desktop is byte-identical to today.

## 5. The Download section (new component)

New file `client/src/components/marketing/DownloadSection.tsx`, rendered between
`PrivacySection` and `FinalCTA`. Built entirely from the existing marketing CSS
vocabulary (`.section`, `.section-eyebrow`, `.section-title`, `.demo-frame`-style
glass panel, `.btn-hero primary`, design tokens `--accent`/`--fg`/`--font-mono`/
`--font-display`) so it matches the locked aesthetic without inventing new pixels.

Content:

- **Eyebrow:** `05 · Get it` (continues the numbered-eyebrow sequence:
  02 method, 03 proof, 04 privacy).
- **Title** (display font, with an `<em>` accent like sibling sections):
  e.g. "Bring it home." / "Run it on your own machine."
- **Sub:** one welcoming line — local-first, offline, yours.
- **Glass panel** (styled like `.demo-frame`):
  - Primary button **"Download for Windows"** → `DOWNLOAD_URL`, with mono
    subtext: `Windows 10 / 11 · 64-bit · ~<size> MB · v1.0.0`.
  - **SmartScreen honesty line:** "Unsigned build — Windows may warn
    'unknown publisher.' Click **More info → Run anyway.** It's open source —
    read every line on GitHub." (links to the repo).
  - **Ollama step** (sets real "ready to use" expectations): the app runs
    offline, but AI features need the free local [Ollama](https://ollama.com)
    running. Presented as one short step, not buried.
  - **"What you get"** micro-list: local-first · runs offline · voice
    (espeak-ng / whisper / IPA model) bundled · your data never leaves.
  - Secondary links: "All releases" → releases page · "View source" → repo.

The section is informational and static (no network on render); the only
outbound action is the user clicking through to GitHub.

## 6. Release — build + publish v1.0.0

- `electron-builder` NSIS `artifactName` set to `Xenolinguist-Setup-${version}.${ext}`
  → `Xenolinguist-Setup-1.0.0.exe` (no spaces; URL-friendly).
- Build on this machine: `npm run dist` → Windows NSIS installer + `latest.yml`
  + `.blockmap` in `release/`. (electron-builder builds only the host platform;
  on Windows that is the `win` target — mac `dmg` cannot cross-build here, which
  matches the Windows-only decision.)
- Publish via `gh release create v1.0.0 release/Xenolinguist-Setup-1.0.0.exe
  release/latest.yml release/*.blockmap --title "Xenolinguist v1.0.0" --notes ...`.
  `latest.yml` + `.blockmap` are included so electron-updater auto-update keeps
  working. The tag `v1.0.0` is created on the release commit.
- Download URL strategy: the Pages workflow resolves the actual installer URL
  from the latest Release via the GitHub API and injects `VITE_DOWNLOAD_URL`, so
  the button stays correct across future version bumps; fallback is
  `/releases/latest`.

## 7. GitHub Pages deploy

New `.github/workflows/pages.yml`:

1. Trigger on push to `main` (+ `workflow_dispatch`).
2. `npm ci`, then resolve latest release asset URL via the GitHub API into
   `VITE_DOWNLOAD_URL`.
3. `VITE_PUBLIC_SITE=true vite build --base=/Xenolinguist/` (run via the client
   workspace), copy `dist/index.html` → `dist/404.html`.
4. `actions/upload-pages-artifact` + `actions/deploy-pages`.

**Manual one-time step (flagged for the user):** enable Pages in repo Settings →
Pages → Source: "GitHub Actions". Cannot be done from here.

## 8. Version-string consistency

The hero meta ("v0.7.2 — Eridian engine") and footer ("v0.7.2") are updated to
**v1.0.0**. This is a content change (one token), not a layout/pixel
approximation, and only needs to read true on the public site; applying it
everywhere keeps the app honest too.

## 9. Testing & verification

- `npm test -w server` (51 pass / 3 skip) and `npm test -w client` (15 pass)
  stay green — no server/shared changes; client changes are additive.
- `npm run build -w client` clean (default/desktop build).
- `VITE_PUBLIC_SITE=true npm run build -w client -- --base=/Xenolinguist/`
  builds clean and emits the Download section.
- Preview the public build locally (vite preview with the base) and confirm:
  Download button points at the release asset, CTAs scroll to `#download`,
  layout matches the locked aesthetic, desktop build still opens the workbench.
- `npm run dist` produces a real installer; install it on Windows and confirm it
  launches (the actual "one click to use" path, SmartScreen step included).

## 10. Out of scope / deferred

- macOS / Linux installers (no vendored voice; Windows-only decision).
- Paid code signing to remove the SmartScreen warning (free+local rule).
- Pre-existing `npm audit` vulnerabilities — untouched, as in PR #7.
- A custom domain for Pages — project-page URL is sufficient.

## 11. Work plan summary (for the implementation plan)

1. ~~Merge PR #7, branch `feat/download-page` from main~~ (done).
2. Add `lib/site.ts`; wire context-aware `onPrimary` into HeroPage + FinalCTA.
3. Build `DownloadSection.tsx`; render conditionally on `isPublicSite`.
4. Update version strings v0.7.2 → v1.0.0.
5. Add `client/public/404.html` SPA shim.
6. Set NSIS `artifactName`; `npm run dist`; `gh release create v1.0.0` with assets.
7. Add `.github/workflows/pages.yml`.
8. Verify (section 9); open PR → main; flag the "enable Pages" manual step.
