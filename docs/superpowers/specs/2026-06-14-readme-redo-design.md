# Design — Full README Redo with Fresh Screenshots

Date: 2026-06-14
Branch: `docs/readme-redo` (off `main` @ c28013a)
Status: Draft for user review

## 1. Goal

Replace the stale root `README.md` with a current, polished, **download-first**
README, and regenerate **all** screenshots fresh from the redesigned app
(~18 images covering every marketing section and workbench page). The current
README predates the desktop app, the voice subsystem, the marketing site, the
v1.0.0 release, and the black-glass/green redesign; its API/env tables and the
"Apple frosted-glass" framing are wrong.

## 2. Locked decisions (from scoping)

| Decision | Choice |
| --- | --- |
| Screenshot coverage | Comprehensive (~16-20), freshly captured |
| README focus | Download-first (end users), with a Build-from-source section for devs |
| Capture script | Commit `scripts/capture-screenshots.mjs`; Playwright stays out of `package.json` |
| AI state in shots | Ollama is running (`gemma4:e4b`) → workbench shows AI **connected** |
| Demo content | Seeded **Eridian** demo profile (`POST /api/profiles/demo`) |

## 3. Screenshot capture architecture

Real, file-saved, interactive screenshots require a browser-automation tool —
the preview MCP returns images inline (can't write repo files) and a
headless-Chrome CLI can't navigate the workbench/overlays. Approach:

- **Playwright in headed mode** (`headless: false`) so the Vanta topology /
  particle **WebGL** backdrops render with real GPU instead of blank software
  canvases. Viewport 1440×900, `deviceScaleFactor: 2` for crisp images.
- `scripts/capture-screenshots.mjs` (committed) drives capture. Header documents
  the one-time local setup: `npm i -D playwright && npx playwright install chromium`.
  Playwright is **not** added to `package.json` (avoids dep/lockfile bloat).
- Two sources, because the marketing **download section** + scroll-CTAs only
  exist in the public build:
  - **Marketing shots** ← the public build served by `vite preview`
    (`VITE_PUBLIC_SITE=true`, base `/`) on a local port.
  - **Workbench shots** ← `npm run dev` (client :5173 + server :3001) with the
    Eridian demo profile seeded via `fetch('http://localhost:3001/api/profiles/demo', {method:'POST'})`.
- Per-shot **settle delay** for animations (e.g. the `DecodeMoment` reveal) and
  `waitForLoadState('networkidle')` before each capture.
- Output: `docs/screenshots/*.png` (1440-wide, dark theme). The 8 stale images
  are removed (`git rm`), including the space/Capitalized names.

### Shot list (~17 core)

Marketing (public build):
| File | Page state |
| --- | --- |
| `hero.png` | Hero — nav + "Decode the unknown" + DecodeMoment settled (also README banner) |
| `method.png` | "Six steps. One workflow." phases ribbon |
| `demo.png` | Interactive Eridian→English mini-decoder |
| `features.png` | Four-feature grid |
| `privacy.png` | Privacy editorial block + stats |
| `download.png` | Download section (Windows button, SmartScreen + Ollama notes) |

Workbench (dev + seeded Eridian):
| File | Page state |
| --- | --- |
| `landing.png` | Profile selector with the Eridian card |
| `new-profile.png` | "New Language" setup form |
| `phase1-samples.png` | Phase 1 Samples + Decode View |
| `phase2-numbers.png` | Phase 2 Numbers grid + base inference |
| `phase3-vocabulary.png` | Phase 3 Vocabulary (cards/table) |
| `phase4-grammar.png` | Phase 4 Grammar rules |
| `phase5-translation.png` | Phase 5 live word-by-word translation |
| `phase6-dashboard.png` | Phase 6 Dashboard (progress ring, stats) |
| `sandbox.png` | Sandbox difficulty-selection screen (no AI wait needed) |
| `ai-chat.png` | AI slide-over chat, connected, with a real response |
| `command-palette.png` | `Ctrl+K` command palette overlay |

Optional if cleanly capturable: `voice.png` (Phase 1 audio recorder / IPA decode).
Any shot that can't be captured cleanly is logged and skipped (no silent gaps).

## 4. New README structure (download-first)

Cross-checked against `docs/FEATURES.md` (current source of truth) so no claim is
stale.

1. **Header** — centered `logo.svg`, name, tagline, refreshed badges: Electron,
   React 19, TypeScript, Vite 8, Tailwind 4, Ollama (local), `release v1.0.0`,
   platform Windows, License Proprietary. (Drop nothing factual; fix versions.)
2. **Hero banner** — `hero.png` + one-paragraph intro: a local-first **desktop**
   workbench for decoding unknown/alien/constructed languages; everything runs
   offline via local Ollama + bundled voice models.
3. **Download** (first CTA) — link to the **v1.0.0** GitHub Release Windows
   installer and the live site (`https://parusann.github.io/Xenolinguist/`), with
   the honest notes: unsigned → SmartScreen "More info → Run anyway"; AI features
   need a free local Ollama.
4. **Visual tour** — the screenshot gallery, grouped (the decode workflow phases;
   voice/sandbox; the marketing/landing visuals).
5. **Features** — the six-phase table; **voice subsystem** (espeak-ng TTS,
   whisper STT with honesty gating, wav2vec2 IPA phones); Sandbox; local-first AI
   (streaming, heavy/light routing); the 0-100 confidence model.
6. **How it works** — the capture→numbers→vocab→grammar→translate→review loop.
7. **Tech stack** — Electron + electron-builder, React 19/Vite 8/Tailwind 4,
   Express, Ollama, Transformers.js wav2vec2, espeak-ng, whisper.cpp; npm-workspace
   monorepo (client/server/shared/electron).
8. **Build from source** (devs) — `npm install`, `npm run dev`,
   `npm run electron:dev`, `npm run dist`; prerequisites (Node, Ollama, a model).
9. **Configuration** — the real env-var table from FEATURES §15
   (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`, timeouts, voice paths, `DATA_DIR`, …).
10. **Project structure** — updated tree incl. `electron/`, voice components,
    `marketing/`, `vendor/`.
11. **License** — proprietary (unchanged).

### Removed (stale/incorrect)
- `POST /api/ai/generate` (does not exist). The stale API table is replaced by a
  concise correct endpoint summary plus a pointer to `docs/FEATURES.md` §14 for
  the full HTTP reference (keeps the download-first README from bloating).
- `OLLAMA_URL` → `OLLAMA_BASE_URL`; `.env.example`/`cp .env` step (verify it
  exists before referencing — otherwise drop).
- "full-stack web application" / "Apple-Style Frosted Glass UI" framing →
  desktop app + the current cinematic aesthetic.

## 5. Image hosting & format

`docs/screenshots/*.png`, committed, referenced by relative path (renders on
GitHub). Total expected size a few MB (well under any limit). PNG to match the
existing convention.

## 6. Verification

- Capture script runs end-to-end and writes every listed PNG; each file is a
  valid non-empty PNG (size sanity check).
- Visually review each captured image (the agent inspects them) — correct page,
  no error states, backdrops rendered, Eridian data present.
- New README: every `docs/screenshots/...` path it references exists; external
  links (release, site, Ollama) are well-formed; no leftover stale claims
  (grep for `ai/generate`, `OLLAMA_URL`, `frosted glass`, old version strings).
- Render-check the README via a Markdown preview / GitHub once pushed.

## 7. Out of scope
- `client/README.md` (left as-is unless asked).
- Animated GIFs / video (static PNGs only).
- Re-theming or code changes to the app itself — capture only.
- macOS/Linux screenshots (Windows-only build).
