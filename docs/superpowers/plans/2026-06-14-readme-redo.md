# README Redo + Fresh Screenshots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale `README.md` with a current, download-first README and regenerate ~17 screenshots fresh from the redesigned app via a committed Playwright capture script.

**Architecture:** A committed `scripts/capture-screenshots.mjs` (Playwright, **headed** for WebGL backdrops) drives two running targets — the **public marketing build** (`vite preview`, `VITE_PUBLIC_SITE=true`) for the 6 marketing shots, and the **dev workbench** (`npm run dev`, client :5173 + server :3001) seeded with the demo **Eridian** profile and Ollama connected for the 11 workbench shots. Output PNGs land in `docs/screenshots/`, replacing the 8 stale images, and the rewritten README embeds them.

**Tech Stack:** Playwright (local-only dev tool), Node 25 ESM, Vite 8, the app's own dev/preview servers, Ollama (`gemma4:e4b`, already running).

**Working dir:** `C:\Users\parus\Downloads\Xenolinguist-impl` on `docs/readme-redo` (off `main` @ c28013a).

**Spec:** `docs/superpowers/specs/2026-06-14-readme-redo-design.md`

> **Note on TDD:** this is an asset/doc task — there are no unit tests. "Verification" means: valid non-empty PNGs, an **agent visual review** of each captured image, and grep/link checks on the README. Screenshot automation is inherently look-and-adjust: Task 4 is an explicit iterate-until-clean loop.

---

## File map
- Create `scripts/capture-screenshots.mjs` — Playwright capture driver (committed).
- Replace `docs/screenshots/*.png` — remove 8 stale, add ~17 new (kebab-case names).
- Rewrite `README.md` — download-first, current content, new image embeds.
- (Local, not committed) Playwright + chromium install.

---

## Task 1: Install Playwright locally (dev tool, not committed)

- [ ] **Step 1: Install Playwright + chromium without touching package.json**

Run:
```bash
npm install --no-save playwright
npx playwright install chromium
```
Expected: chromium downloads; `node -e "require('playwright')"` exits 0.
(`--no-save` keeps it out of `package.json`/lock so it isn't committed.)

- [ ] **Step 2: Confirm it loads**

Run: `node -e "const {chromium}=require('playwright'); console.log('playwright ok')"`
Expected: prints `playwright ok`.

No commit.

---

## Task 2: Write the capture script

**Files:** Create `scripts/capture-screenshots.mjs`

- [ ] **Step 1: Write the script**

```js
// scripts/capture-screenshots.mjs
//
// Regenerates docs/screenshots/*.png from the running app.
//
// One-time local setup (Playwright is intentionally NOT a package.json dep):
//   npm install --no-save playwright && npx playwright install chromium
//
// Run two servers first (see docs/superpowers/plans/2026-06-14-readme-redo.md):
//   1. Public marketing build:  VITE_PUBLIC_SITE=true npm run build -w client
//                               npm run preview -w client -- --port 4173 --strictPort
//   2. Dev workbench:           npm run dev   (client :5173 + server :3001)
//
//   node scripts/capture-screenshots.mjs
//
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const OUT = 'docs/screenshots'
const MARKETING = process.env.MARKETING_URL || 'http://localhost:4173/'
const WB = process.env.WB_URL || 'http://localhost:5173'
const API = process.env.API_URL || 'http://localhost:3001'
const VW = { width: 1440, height: 900 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const done = []
const skipped = []

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  done.push(name)
  console.log('  ✓', name)
}
async function tryShot(label, fn) {
  try { await fn() } catch (e) { skipped.push(`${label}: ${e.message}`); console.log('  ✗', label, '-', e.message) }
}

async function captureMarketing(browser) {
  const page = await browser.newPage({ viewport: VW, deviceScaleFactor: 2 })
  await page.goto(MARKETING, { waitUntil: 'networkidle' })
  await sleep(2500) // let DecodeMoment + Vanta settle
  await tryShot('hero', async () => { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(400); await shot(page, 'hero') })
  const sections = [
    ['method', '#method'],
    ['demo', '#proof'],
    ['features', 'section:has(.features)'],
    ['privacy', '#privacy'],
    ['download', '#download'],
  ]
  for (const [name, sel] of sections) {
    await tryShot(name, async () => {
      await page.locator(sel).first().scrollIntoViewIfNeeded()
      await sleep(900)
      await shot(page, name)
    })
  }
  await page.close()
}

async function captureWorkbench(browser) {
  const ctx = await browser.newContext({ viewport: VW, deviceScaleFactor: 2 })
  // Seed the Eridian demo profile (idempotent enough for a fresh dev data dir).
  await tryShot('seed-demo', async () => {
    const r = await ctx.request.post(`${API}/api/profiles/demo`)
    if (!r.ok()) throw new Error(`seed HTTP ${r.status()}`)
  })
  const page = await ctx.newPage()
  await page.goto(`${WB}/app`, { waitUntil: 'networkidle' })
  await sleep(2000)

  // Profile selector (now lists Eridian)
  await tryShot('landing', async () => { await shot(page, 'landing') })

  // New profile setup form, then back
  await tryShot('new-profile', async () => {
    await page.getByText('New Language', { exact: false }).first().click()
    await sleep(900)
    await shot(page, 'new-profile')
    await page.keyboard.press('Escape')
    await sleep(500)
  })

  // Sandbox difficulty screen, then back to landing
  await tryShot('sandbox', async () => {
    await page.getByText('Sandbox', { exact: false }).first().click()
    await sleep(900)
    await shot(page, 'sandbox')
    await page.keyboard.press('Escape')
    await sleep(500)
  })

  // Enter the Eridian workbench
  await page.goto(`${WB}/app`, { waitUntil: 'networkidle' })
  await sleep(1200)
  await page.getByText('Eridian', { exact: false }).first().click()
  await sleep(1500)

  // Phases 1-6 via number keys
  const phases = ['phase1-samples','phase2-numbers','phase3-vocabulary','phase4-grammar','phase5-translation','phase6-dashboard']
  for (let i = 0; i < 6; i++) {
    await tryShot(phases[i], async () => {
      await page.keyboard.press(String(i + 1))
      await sleep(1200)
      await shot(page, phases[i])
    })
  }

  // Command palette
  await tryShot('command-palette', async () => {
    await page.keyboard.press('Control+k')
    await sleep(700)
    await shot(page, 'command-palette')
    await page.keyboard.press('Escape')
    await sleep(400)
  })

  // AI chat (connected) — open, ask, wait for a streamed answer
  await tryShot('ai-chat', async () => {
    await page.keyboard.press('Shift+A')
    await sleep(800)
    const input = page.locator('textarea, input[type=text]').last()
    await input.fill('What base is the Eridian number system, and how confident are you?')
    await page.keyboard.press('Enter')
    await sleep(9000) // let the local model stream a reply
    await shot(page, 'ai-chat')
  })

  await ctx.close()
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: false })
await captureMarketing(browser)
await captureWorkbench(browser)
await browser.close()
console.log(`\nDONE ${done.length} shots:`, done.join(', '))
if (skipped.length) console.log(`SKIPPED ${skipped.length}:`, skipped.join(' | '))
```

- [ ] **Step 2: Commit the script**

```bash
git add scripts/capture-screenshots.mjs
git commit -m "chore: add Playwright screenshot capture script"
```

---

## Task 3: Start the two capture targets

- [ ] **Step 1: Build + serve the public marketing site (background)**

Run (PowerShell, background job):
```powershell
$env:VITE_PUBLIC_SITE="true"; npm run build -w client; Remove-Item Env:\VITE_PUBLIC_SITE
```
Then serve in the background:
```powershell
Start-Job { Set-Location C:\Users\parus\Downloads\Xenolinguist-impl; npm run preview -w client -- --port 4173 --strictPort }
```
Verify: `curl http://localhost:4173/` → 200, and the HTML references `/assets/`.

- [ ] **Step 2: Start the dev workbench (background)**

Run (background): `npm run dev` (starts client :5173 + server :3001).
Verify: `curl http://localhost:5173` → 200 and `curl http://localhost:3001/api/health` → `{status:"ok"...}`.

- [ ] **Step 3: Confirm Ollama is reachable**

Run: `curl -s http://localhost:11434/api/tags` → lists models incl. `gemma4:e4b`.
(If down, the workbench still captures with seeded data; only `ai-chat` would show offline.)

No commit.

---

## Task 4: Capture and iterate until clean (look-and-adjust loop)

- [ ] **Step 1: Run the capture script**

Run: `node scripts/capture-screenshots.mjs`
Expected: console logs `✓ <name>` per shot and a final `DONE … SKIPPED …` summary.

- [ ] **Step 2: Visually review every PNG**

Read each `docs/screenshots/*.png` (agent inspects the image) and check:
- Correct page/section, no error/empty/offline states (except where intended).
- WebGL backdrops rendered (hero/landing not blank).
- Eridian data visible in the workbench shots; AI-chat shows a real streamed reply.
- No truncated overlays / mid-animation frames.

- [ ] **Step 3: Fix and re-capture as needed**

For any skipped or bad shot, adjust the selector/timing in `scripts/capture-screenshots.mjs`
(e.g., a phase that needs a different key, a chat input selector, a longer settle),
then re-run `node scripts/capture-screenshots.mjs`. Repeat until all ~17 are clean.
**Log any shot that genuinely can't be captured** (don't silently drop it) and note it
when reporting — the README simply omits that one.

- [ ] **Step 4: Remove the 8 stale screenshots**

```bash
git rm "docs/screenshots/Grammar.png" "docs/screenshots/New Profile.png" "docs/screenshots/Samples.png" \
       "docs/screenshots/dashboard.png" "docs/screenshots/landing.png" "docs/screenshots/numbers.png" \
       "docs/screenshots/translation.png" "docs/screenshots/vocabulary.png"
```
(The new `landing.png`/`dashboard.png` etc. created by the script then replace them.)

- [ ] **Step 5: Validate every PNG is real**

Run (PowerShell): `Get-ChildItem docs/screenshots/*.png | ForEach-Object { "{0}  {1}KB" -f $_.Name, [int]($_.Length/1KB) }`
Expected: each listed shot present and > ~20 KB (not a blank/zero file).

- [ ] **Step 6: Commit the screenshots**

```bash
git add docs/screenshots
git commit -m "docs: regenerate screenshots from current app"
```

---

## Task 5: Rewrite README.md (download-first)

**Files:** Rewrite `README.md`. Source of truth for facts: `docs/FEATURES.md`.

- [ ] **Step 1: Write the new README**

Structure (use exact content below; write remaining prose from the spec + FEATURES):

1. **Header** (centered): `client/public/logo.svg` (width 80), `# Xenolinguist`, tagline
   *"A local-first desktop workbench for decoding unknown languages — from the first sample to the first sentence."*
   Badges row:
   ```md
   ![Download](https://img.shields.io/github/v/release/Parusann/Xenolinguist?label=download&color=00e676)
   ![Platform](https://img.shields.io/badge/platform-Windows-0078D6)
   ![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron&logoColor=white)
   ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
   ![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
   ![Ollama](https://img.shields.io/badge/AI-Local%20Ollama-000?logo=ollama&logoColor=white)
   ![License](https://img.shields.io/badge/license-Proprietary-lightgrey)
   ```
2. **Hero banner**: `<p align="center"><img src="docs/screenshots/hero.png" width="820" /></p>` + 1-paragraph intro (desktop app; decode unknown/alien/constructed languages; everything offline via local Ollama + bundled voice models; no account).
3. **⬇ Download** (first CTA):
   - **[Download for Windows (v1.0.0)](https://github.com/Parusann/Xenolinguist/releases/latest/download/Xenolinguist-Setup-1.0.0.exe)** · live site: **https://parusann.github.io/Xenolinguist/**
   - Honest notes: unsigned build → Windows SmartScreen "More info → Run anyway"; AI features need a free local [Ollama](https://ollama.com).
   - Embed `docs/screenshots/download.png`.
4. **Visual tour** — gallery grouped:
   - *The decode workflow* — `phase1-samples`…`phase6-dashboard` (each with a one-line caption from FEATURES §6).
   - *Practice & assist* — `sandbox`, `ai-chat`, `command-palette`.
   - *Landing & marketing* — `landing`, `new-profile`, `method`, `demo`, `features`, `privacy`.
   Use `<p align="center"><img src="docs/screenshots/<name>.png" width="760" /><br/><em>caption</em></p>`.
5. **Features** — the six-phase table (from FEATURES §6, corrected), plus subsections: **Voice subsystem** (espeak-ng TTS, whisper STT with honesty gating, wav2vec2 IPA phones — FEATURES §9), **Sandbox** (§7), **Local-first AI** (streaming, heavy/light routing — §8), **Confidence model** (0-100 buckets ≥76/≥41).
6. **How it works** — the capture→numbers→vocabulary→grammar→translate→review loop (one line each).
7. **Tech stack** table — Electron 42 + electron-builder; React 19 / TS / Vite 8 / Tailwind 4; Express; Ollama; Transformers.js wav2vec2; espeak-ng; whisper.cpp; npm-workspace monorepo (`client`/`server`/`shared`/`electron`).
8. **Build from source** — prerequisites (Node 20+, Ollama + a model); `npm install`; `npm run dev` (web at :5173/:3001); `npm run electron:dev` (desktop); `npm run dist` (installer → `release/`). Pull a model: `ollama pull gemma3:4b` (note: default `OLLAMA_MODEL` is `gemma4:e4b`).
9. **Configuration** — env table copied from FEATURES §15 (`DATA_DIR`, `OLLAMA_MODEL`=`gemma4:e4b`, `OLLAMA_BASE_URL`=`http://localhost:11434`, `OLLAMA_TIMEOUT_MS`, `WHISPER_TIMEOUT_MS`, `TTS_TIMEOUT_MS`, `PORT`, voice paths). Mention `.env.example`.
10. **API** — one-line summary + "Full HTTP reference: `docs/FEATURES.md` §14." (Do NOT reproduce the stale table.)
11. **Project structure** — updated tree incl. `electron/`, `client/src/components/{marketing,audio,phase1-6,sandbox}`, `vendor/`, `scripts/`.
12. **License** — keep the proprietary block verbatim from the current README (lines 289-293).

- [ ] **Step 2: Verify no stale claims survive**

Run: `grep -niE "ai/generate|OLLAMA_URL|frosted glass|full-stack web application|TypeScript 5\.8" README.md`
Expected: **no matches**.

- [ ] **Step 3: Verify every embedded image exists**

Run (PowerShell):
```powershell
Select-String -Path README.md -Pattern 'docs/screenshots/([^")\s]+\.png)' -AllMatches |
  ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique |
  ForEach-Object { "{0}  {1}" -f $_, (Test-Path "docs/screenshots/$_") }
```
Expected: every referenced path prints `True`.

- [ ] **Step 4: Commit the README**

```bash
git add README.md
git commit -m "docs: rewrite README — download-first, current features, fresh screenshots"
```

---

## Task 6: Finish

- [ ] **Step 1: Stop background servers**

Stop the dev + preview background jobs (PowerShell `Get-Job | Stop-Job; Get-Job | Remove-Job`).

- [ ] **Step 2: Confirm working tree is clean and Playwright didn't leak into tracked files**

Run: `git status --short` (expect clean) and `git diff --stat origin/main -- package.json package-lock.json` (expect **no** changes — Playwright was `--no-save`).

- [ ] **Step 3: Render-check + finish the branch**

Use superpowers:finishing-a-development-branch. Merge to `main` with the ff-merge → push flow (same as prior tasks this session). The push triggers the Pages workflow (harmless — README/screenshots don't affect the built site). Do **not** remove the impl worktree.

---

## Self-review notes
- **Spec coverage:** capture approach → Tasks 1-4; ~17 shot list → Task 2 script + Task 4 review; download-first README structure → Task 5; removed-stale checks → Task 5 Step 2; image hosting → `docs/screenshots`; verification → Tasks 4-5. All covered.
- **Name consistency:** screenshot file names (`hero`, `method`, `demo`, `features`, `privacy`, `download`, `landing`, `new-profile`, `phase1-samples`…`phase6-dashboard`, `sandbox`, `ai-chat`, `command-palette`) are identical in the script, the README embeds, and the validation greps.
- **Honest gaps:** selectors (chat input, `Shift+A`, phase keys) are best-effort; Task 4 is an explicit iterate-until-clean loop, and any uncapturable shot is logged and omitted rather than faked.
