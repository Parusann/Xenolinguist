# Xenolinguist Redesign — Integration Spec

**Date:** 2026-06-02 · **Owner:** Parusan · **Status:** Approved (strategy), pending spec review

## Goal

Implement the **entire design handoff** (`XenoLingustic/design_handoff_xenolinguist_redesign/`)
into the existing working app at **pixel-perfect fidelity**, with **zero feature regressions**.
Two surfaces: the **workbench app** (all 6 phases + overlays + landing) and a new **marketing
hero page**.

The handoff's `README.md` is the **authoritative pixel-level source of truth** (tokens, motion,
per-phase layout, data fixtures). This spec does **not** duplicate it — it defines how that design
grafts onto *this* codebase, the decisions made, and the contract for not breaking anything.

## Source of truth

- **Design:** `C:\Users\parus\Downloads\XenoLingustic\design_handoff_xenolinguist_redesign\`
  - `README.md` — full design system + per-surface spec (read per phase during build)
  - `prototypes/xenolinguist/styles.css` — the new design-system CSS (port this)
  - `prototypes/xenolinguist/components/*.jsx` — exact markup per phase
  - `prototypes/hero/{hero.css,Hero.jsx,Sections.jsx,HeroApp.jsx,first-contact.png}` — marketing page
  - `prototypes/xenolinguist/data.js` — Eridian fixtures (reference only; **not** imported to prod)
- **Target app:** `C:\Users\parus\Downloads\Xenolinguist\client\`

## Current state → target

| Aspect | Today | Target |
|---|---|---|
| Tokens | `@theme` with `Outfit`, `--color-surface`, `--color-accent` | New token set (Space Grotesk, `--bg-rise`, `--conf-*`, `--ai`) |
| Glass | "Apple-style" 4-layer (`blur(40px)`) | New `.glass`/`.glass-card`/`.glass-inner` + noise overlay |
| Sidebar | Fixed rail | Hover-expand 56→208px, glyph+name+num, active bar+glow |
| Header | `h-10` (40px), logo.svg + name + crumb | 56px, XenoMark crumb + AI button + status pills |
| Routing | `hasProfile` state toggles Landing/AppShell | react-router: `/` hero, `/app` workbench |
| Marketing page | none | New cinematic hero route |
| Fonts | Outfit + JetBrains Mono (Google Fonts link) | Space Grotesk + JetBrains Mono |

## Decisions (approved)

- **D1 — Token migration.** Rewrite `client/src/index.css`: new token values in `:root` *and*
  mapped into Tailwind `@theme` so existing utilities (`text-accent`, `border-border`,
  `animate-fade-in/slide-up`) keep resolving. Port all prototype `styles.css` custom classes.
  Keep both `--color-*` (old utility aliases) and new `--bg-*/--fg-*/--conf-*` vars during
  transition so no component visually breaks mid-migration.
- **D2 — Routing.** Use installed `react-router-dom@7`. `BrowserRouter` in `main.tsx`; `App`
  routes: `/` → `<HeroPage>`, `/app` → current Landing→Shell flow. "Start decoding/Open
  workbench" CTAs navigate to `/app`.
- **D3 — Fonts.** Swap `index.html` Google Fonts link `Outfit → Space Grotesk` (weights
  200,300,400,500,600,700); keep JetBrains Mono (300,400,500).
- **D4 — Vanta backdrop.** `npm i vanta p5`. `<VantaTopology>` wrapper component (init in
  `useEffect`, destroy on unmount), `backgroundColor 0x06090a`, `color 0x2eb86b`. Reused on hero
  + workbench landing. Bundled → preserves "runs offline."
- **D5 — Data layer.** **No changes.** All phase components keep their `useProfile`/`useOllama`/
  `useUndo`/context wiring and `services/api.ts` calls. Prototype hardcoded data is reference only.
- **D6 — Assets.** Copy `first-contact.png` → `client/public/`. Replace `logo.svg`/`favicon.svg`
  with the new XenoMark "resolved-signal reticle."
- **D7 — Tweaks panel.** Omitted (design-tool affordance only).

## New shared primitives (build once, in `client/src/components/common/`)

- `XenoMark({ size })` — brand reticle SVG (nav 18–22, sidebar 28, landing 56)
- `ConfRing({ value, size, stroke })` — SVG progress ring, confidence-colored, center number
- `MiniSpark({ values, color, w, h })` — line+area sparkline (dashboard trends)
- `VantaTopology` — Vanta wrapper (hero + landing)
- Confidence helpers: reuse CSS classes `.cbar.{conf}`, `.badge.{conf}`, `.dot.{conf}`,
  `.word-token.wt-{conf}` + `.expr-*`. `WaveformViz` lives with audio components.

## No-regression contract (verify each still works after restyle)

Command palette (⌘K) · keyboard shortcuts `1–6 / L / ⌘K / ⇧A / ⇧? / Ctrl+Z / Esc` · undo/redo ·
session log · toasts · onboarding tour (localStorage-gated) · AI chat streaming + context chips ·
auto-suggest · JSON import/export · sandbox mode + difficulty (phase prepend) · audio suite
(recorder, player, segmenter, waveform, language detector) · Ollama status + model routing ·
profile CRUD · parallel-mode sample entry.

## File map (current → action)

- `main.tsx` → wrap in `BrowserRouter`
- `App.tsx` → add routes (`/` hero, `/app` workbench)
- `index.html` → fonts + favicon
- `index.css` → token + class migration (D1)
- `layout/Sidebar.tsx` → hover-expand, glyph/name/num, active bar
- `layout/AppShell.tsx` → 56px header, new crumb + status pills; keep all overlay/shortcut wiring
- `layout/StatusBar.tsx` → new content (Ollama · DECODE % · CONF counts · log/shortcuts toggles)
- `layout/SessionLog.tsx` → glass slide-up, log-entry rows, milestone accent
- `layout/AIChat.tsx` → slide-over (420px), context chips, bubbles, streaming shimmer, quick-actions
- `layout/CommandPalette.tsx` → cmd-overlay, NAV/TOOL/HELP kind badges, kbd hints
- `layout/{ShortcutsHelp,ToastContainer,OnboardingTour,ContextMenu}.tsx` → restyle to tokens
- `landing/LandingScreen.tsx` → Vanta + ParticleField + wordmark + 2 CTA cards + saved-profiles list
- `landing/ProfileSetup.tsx` → restyle to glass/tokens
- `phase6-dashboard/Dashboard.tsx` → field-log layout (ConfRing 47%, distribution, trends, stat
  tiles, discovery timeline, next milestones, AI field notes) — **build first**
- `phase3-vocabulary/VocabularyBuilder.tsx` → POS chips, cards/table toggle, ConfRing, inspector
- `phase5-translation/TranslationEngine.tsx` → 3-pane, hoverable tokens, expr-* modes, inspector
- `phase4-grammar/GrammarAnalyzer.tsx` → add-rule + conf slider, rule cards, inspector, AI proposals
- `phase2-numbers/NumberDecoder.tsx` → base card + bar chart, mappings grid, operators, notes
- `phase1-samples/{SampleInput,SampleDecodeView}.tsx` → capture form + recorder sub-panel + list
- `audio/*` → restyle; `WaveformCanvas`/`WaveformViz` to new bar style
- `sandbox/{SandboxSetup,SandboxController}.tsx` → restyle; keep generation flow

## New files

- `components/common/{XenoMark,ConfRing,MiniSpark,VantaTopology}.tsx`
- `components/marketing/HeroPage.tsx` (+ `DecodeMoment`, section subcomponents, `hero.css`/module)
- `public/first-contact.png`, updated `public/logo.svg` + `favicon.svg`

## Build order (phased — each is a writing-plans checkpoint)

1. **Foundation:** fonts, `index.css` token+class migration, common primitives, favicon/logo.
2. **Routing scaffold:** BrowserRouter, `/` placeholder, `/app` workbench (verify app still loads).
3. **Shell:** Sidebar, Header, StatusBar, SessionLog.
4. **Dashboard** (richest — validates the system).
5. **Vocabulary → Translation → Grammar → Numbers → Samples** (+ audio).
6. **Overlays:** AI Chat, Command Palette (+ ShortcutsHelp, toasts, tour, context menu).
7. **Landing** (Vanta + ParticleField + profile cards).
8. **Marketing hero page** (`/` route — DecodeMoment, six-phase ribbon, mini-decoder, features,
   privacy, final CTA, footer).
9. **Polish + verify:** pixel pass, run dev server, preview screenshots, walk the no-regression
   contract.

## Risks / notes

- **Vanta + React 19/Vite:** older lib; init/cleanup carefully, guard against double-mount in
  StrictMode. Fallback: CDN script if the npm build misbehaves.
- **Tailwind v4 `@theme` + custom CSS coexistence:** keep custom classes outside `@theme`; only
  tokens go in `@theme`. Verify utilities still compile after token rename.
- **Read tooling:** main-project files truncate on first Read (claude-mem); use Grep/offset to get
  full content before editing.
- **Server / `profiles.json`:** unchanged by this work. Anthropic-reference scrub (brief §11.7) is
  **out of scope** for this redesign unless surfaced in UI copy.
- **Density + confidence-expression modes:** ship `.expr-color` default; expose density toggle as
  the design intends (enhancement, not regression).

## Out of scope

Marketing-page A/B copy, server/API changes, the proprietary prompt-template privatization,
mobile-responsive pass (app is desktop-first per brief), and the Anthropic-reference scrub.
