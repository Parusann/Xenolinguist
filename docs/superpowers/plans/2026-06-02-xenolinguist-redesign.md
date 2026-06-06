# Xenolinguist Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the entire design handoff (marketing hero page + redesigned workbench) into the existing app at pixel-perfect fidelity with zero feature regressions.

**Architecture:** Port the new design-system CSS into `index.css` (tokens mapped into Tailwind v4 `@theme` so existing utilities keep resolving), build a small set of shared primitives, then restyle each existing component in place — preserving all data wiring (`useProfile`/`useOllama`/`useUndo`/contexts) and behavior. Add a new `/` marketing route via the already-installed react-router. Restyles reference the prototype JSX/CSS as the source markup; integration deltas wire real data.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Tailwind CSS v4, react-router-dom 7, Vanta.js + p5 (new), Space Grotesk + JetBrains Mono.

---

## How to execute this plan

- **Source of truth for pixels:** the handoff at
  `C:\Users\parus\Downloads\XenoLingustic\design_handoff_xenolinguist_redesign\` — its `README.md`
  (per-phase spec) and `prototypes/` (exact markup + CSS). Read the relevant prototype file at the
  start of each restyle task.
- **Fidelity rule:** where the prototype and an existing feature conflict, keep BOTH — match the
  mockup's markup/classes but retain the component's data wiring and behavior.
- **Verification (replaces unit tests — repo has no test runner; adding one is out of scope):**
  each task ends by running, from `client/`:
  - `npm run build` → expect tsc + vite build success (no type errors)
  - `npm run lint` → expect clean
  - dev server loads the affected route with **no console errors** (use preview tools:
    `preview_start`, `preview_console_logs`, `preview_snapshot`, `preview_screenshot`)
  - the **no-regression checklist** items the task touched still work (manually exercise them)
- **No-regression checklist (global):** command palette (⌘K) · shortcuts `1–6 / L / ⌘K / ⇧A / ⇧? /
  Ctrl+Z / Esc` · undo/redo · session log · toasts · onboarding tour · AI chat streaming +
  context chips · auto-suggest · JSON import/export · sandbox mode + difficulty · audio
  (recorder/player/segmenter/waveform/detector) · Ollama status + model routing · profile CRUD ·
  parallel-mode sample entry.
- **Commits:** one per task (or per logical sub-step). Branch: `redesign/design-handoff` (already
  created). Commit message convention: `redesign(<area>): <what>`.
- **Reading main-project files:** first Read may truncate (claude-mem); use Grep with `.*` or
  `Read` offset/limit to get full content before editing.

---

## File structure

**New files**
- `client/src/components/common/XenoMark.tsx` — brand reticle SVG
- `client/src/components/common/ConfRing.tsx` — circular confidence indicator
- `client/src/components/common/MiniSpark.tsx` — sparkline
- `client/src/components/common/VantaTopology.tsx` — Vanta backdrop wrapper
- `client/src/components/marketing/HeroPage.tsx` — marketing route root
- `client/src/components/marketing/DecodeMoment.tsx` — live decoder animation
- `client/src/components/marketing/sections.tsx` — below-fold marketing sections
- `client/src/marketing.css` (or co-located) — hero-specific CSS ported from `hero/hero.css`
- `client/public/first-contact.png` — hero image asset

**Modified files**
- `client/index.html` · `client/src/index.css` · `client/src/main.tsx` · `client/src/App.tsx`
- `client/src/components/layout/{Sidebar,AppShell,StatusBar,SessionLog,AIChat,CommandPalette,ShortcutsHelp,ToastContainer,OnboardingTour,ContextMenu}.tsx`
- `client/src/components/landing/{LandingScreen,ProfileSetup}.tsx`
- `client/src/components/phase1-samples/{SampleInput,SampleDecodeView}.tsx`
- `client/src/components/phase2-numbers/NumberDecoder.tsx`
- `client/src/components/phase3-vocabulary/VocabularyBuilder.tsx`
- `client/src/components/phase4-grammar/GrammarAnalyzer.tsx`
- `client/src/components/phase5-translation/TranslationEngine.tsx`
- `client/src/components/phase6-dashboard/Dashboard.tsx`
- `client/src/components/audio/{AudioRecorder,AudioPlayer,AudioSegmenter,WaveformCanvas,LanguageDetector}.tsx`
- `client/src/components/sandbox/{SandboxSetup,SandboxController}.tsx`
- `client/public/{logo.svg,favicon.svg}`

---

# Phase 1 — Foundation

The keystone. Everything downstream depends on the tokens + primitives. Do not skip verification
here — a wrong token cascades everywhere.

### Task 1: Add Vanta + p5 dependencies

**Files:** Modify `client/package.json` (via npm)

- [ ] **Step 1: Install**

Run from `client/`:
```bash
npm install vanta@^0.5.24 p5@^1.9.4
```

- [ ] **Step 2: Verify** — `npm run build` succeeds; `vanta` and `p5` appear in `package.json` dependencies.

- [ ] **Step 3: Commit**
```bash
git add client/package.json client/package-lock.json
git commit -m "redesign(deps): add vanta + p5 for topology backdrop"
```

### Task 2: Fonts + favicon/logo

**Files:** Modify `client/index.html`; Replace `client/public/logo.svg`, `client/public/favicon.svg`

- [ ] **Step 1: Swap the Google Fonts link** in `client/index.html` `<head>` — replace the existing
`<link href="...Outfit...">` line with:
```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500&family=Space+Grotesk:wght@200;300;400;500;600;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Update `logo.svg` + `favicon.svg`** to the XenoMark reticle. Take the SVG paths from
`prototypes/xenolinguist/components/Shell.jsx` → `XenoMark` (outer dotted ring, inner solid green
ring, scan line, bright dot + 3 fading echoes). Save a standalone-sized version (24×24 viewBox) to
both files, stroke/fill using `#00E676`.

- [ ] **Step 3: Verify** — dev server loads; favicon + header logo render as the reticle; no 404 for fonts in `preview_network`.

- [ ] **Step 4: Commit**
```bash
git add client/index.html client/public/logo.svg client/public/favicon.svg
git commit -m "redesign(brand): Space Grotesk font + XenoMark favicon/logo"
```

### Task 3: Migrate `index.css` to the new design system

**Files:** Modify `client/src/index.css`; Reference `prototypes/xenolinguist/styles.css`

This replaces the old Outfit/4-layer-glass system with the new tokens + custom classes, while
keeping Tailwind utilities used by components (`text-accent`, `bg-surface`, `border-border`,
`animate-fade-in/slide-up/breathe`) resolving.

- [ ] **Step 1: Inventory utilities components rely on.** Grep the client for Tailwind tokens that
must survive the migration:
```
Grep pattern: (text-accent|bg-accent|border-accent|bg-deep|bg-surface|border-border|animate-(fade-in|slide-up|breathe|scale-pop|float|shimmer)|text-chrome)
path: client/src  output_mode: count
```
Note every distinct token — the new `@theme` + CSS must provide each.

- [ ] **Step 2: Rewrite `index.css`.** Structure:
  1. `@import "tailwindcss";`
  2. `@theme { ... }` mapping Tailwind tokens to the NEW palette so existing utilities keep working:
```css
@theme {
  --font-sans: 'Space Grotesk', system-ui, sans-serif;
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;

  --color-deep: #030305;
  --color-base: #06070a;
  --color-surface: rgba(14, 16, 22, 0.62);
  --color-surface-light: rgba(20, 23, 30, 0.72);
  --color-border: rgba(255, 255, 255, 0.055);
  --color-accent: #00E676;
  --color-accent-dim: #00A854;

  /* animation tokens for animate-* utilities the app uses */
  --animate-fade-in: fadeIn 240ms ease-out;
  --animate-slide-up: slideUp 280ms cubic-bezier(0.2,0.8,0.2,1);
  --animate-breathe: breathe 3.8s ease-in-out infinite;
}
```
  3. Paste the **entire `:root` block and all custom classes** from
     `prototypes/xenolinguist/styles.css` (tokens, `.glass*`, `.kicker`, `.label`, `.h-display`,
     `.badge*`, `.dot*`, `.btn*`, `.input/.textarea`, `.sidebar*`, `.app-header`, `.crumb`,
     `.status-bar`, all `@keyframes`, `.phase-enter`, `.fade-in`, `.slide-up`, `.shimmer-text`,
     `.word-token` + `.expr-*`, scrollbars, `.cbar*`, `.cring-*`, density modes, `.popover`,
     `.side-panel`, `.cmd-overlay`, `.log-entry`, `.wave-mini`, `canvas.stars`).
  4. Keep any app-only keyframes the Step-1 grep surfaced that the prototype lacks (e.g.
     `scale-pop`, `float`) — copy them from the OLD `index.css` so those utilities still animate.

- [ ] **Step 3: Verify build + lint + load.** From `client/`: `npm run build` and `npm run lint`
clean. `preview_start`, open `/app`, `preview_console_logs` shows no errors, `preview_snapshot`
shows the app rendering with the new dark theme. The app will look "half-migrated" (components not
yet restyled) — that is expected; the only failures to fix now are missing-utility errors.

- [ ] **Step 4: Commit**
```bash
git add client/src/index.css
git commit -m "redesign(tokens): port new design-system CSS into index.css"
```

### Task 4: `XenoMark` primitive

**Files:** Create `client/src/components/common/XenoMark.tsx`; Reference `prototypes/.../Shell.jsx` → `XenoMark`

- [ ] **Step 1: Port** the `XenoMark` SVG into a typed React component:
```tsx
export function XenoMark({ size = 28 }: { size?: number }) {
  // SVG body copied verbatim from prototypes/xenolinguist/components/Shell.jsx XenoMark,
  // with width/height={size} and JSX attribute casing (strokeWidth, strokeDasharray, etc.)
  return ( /* ...reticle svg... */ )
}
```

- [ ] **Step 2: Verify** — `npm run build` clean (no type errors).

- [ ] **Step 3: Commit** `git commit -am "redesign(common): XenoMark primitive"`

### Task 5: `ConfRing` primitive

**Files:** Create `client/src/components/common/ConfRing.tsx`

- [ ] **Step 1: Implement** the SVG confidence ring (used by Vocabulary, Dashboard):
```tsx
const bucket = (v: number) => (v >= 76 ? 'confirmed' : v >= 41 ? 'probable' : 'unknown')
const COLOR = { confirmed: 'var(--conf-confirmed)', probable: 'var(--conf-probable)', unknown: 'var(--conf-unknown)' }

export function ConfRing({ value, size = 36, stroke = 3 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100)
  const color = COLOR[bucket(value)]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
      <circle className="cring-track" cx={size/2} cy={size/2} r={r} strokeWidth={stroke} />
      <circle className="cring-bar" cx={size/2} cy={size/2} r={r} strokeWidth={stroke}
        stroke={color} strokeDasharray={c} strokeDashoffset={off} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        fontFamily="var(--font-mono)" fontSize={size * 0.3} fill={color}>{Math.round(value)}</text>
    </svg>
  )
}
```

- [ ] **Step 2: Verify** `npm run build` clean.
- [ ] **Step 3: Commit** `git commit -am "redesign(common): ConfRing primitive"`

### Task 6: `MiniSpark` primitive

**Files:** Create `client/src/components/common/MiniSpark.tsx`

- [ ] **Step 1: Implement** the sparkline (Dashboard trends):
```tsx
export function MiniSpark({ values, color = 'var(--accent)', w = 120, h = 28 }:
  { values: number[]; color?: string; w?: number; h?: number }) {
  if (!values.length) return null
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1
  const pts = values.map((v, i) => [ (i / (values.length - 1)) * w, h - ((v - min) / span) * h ])
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  const id = `sp${w}x${h}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.28" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
    </svg>
  )
}
```

- [ ] **Step 2: Verify** `npm run build` clean.
- [ ] **Step 3: Commit** `git commit -am "redesign(common): MiniSpark primitive"`

### Task 7: `VantaTopology` primitive

**Files:** Create `client/src/components/common/VantaTopology.tsx`

- [ ] **Step 1: Implement** the Vanta wrapper with safe init/cleanup (guards React 19 StrictMode double-mount):
```tsx
import { useEffect, useRef } from 'react'
import p5 from 'p5'
// @ts-expect-error - vanta ships no types
import TOPOLOGY from 'vanta/dist/vanta.topology.min'

export function VantaTopology({ opacity = 0.85, style }: { opacity?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const fx = useRef<{ destroy: () => void } | null>(null)
  useEffect(() => {
    if (!ref.current || fx.current) return
    fx.current = TOPOLOGY({
      el: ref.current, p5,
      mouseControls: false, touchControls: false, gyroControls: false,
      minHeight: 200, minWidth: 200, scale: 1.0, scaleMobile: 1.0,
      backgroundColor: 0x06090a, color: 0x2eb86b,
    })
    return () => { fx.current?.destroy(); fx.current = null }
  }, [])
  return <div ref={ref} style={{ position: 'absolute', inset: 0, ...style }}
    // canvas opacity per spec
    className="vanta-bg" data-opacity={opacity} />
}
```
Add to `index.css`: `.vanta-bg > canvas { opacity: var(--vanta-op, 0.85); }` and set
`--vanta-op` inline where needed (landing 0.95, hero 0.85).

- [ ] **Step 2: Verify** — temporarily mount in `App.tsx` `/app`, confirm the topology renders and
`preview_console_logs` is clean; confirm unmount (navigate away) does not leak (no duplicate
canvases). Remove the temporary mount.

- [ ] **Step 3: Commit** `git commit -am "redesign(common): VantaTopology backdrop wrapper"`

---

# Phase 2 — Routing scaffold

### Task 8: Add react-router with `/` and `/app`

**Files:** Modify `client/src/main.tsx`, `client/src/App.tsx`

- [ ] **Step 1: Wrap with `BrowserRouter`** in `main.tsx`:
```tsx
import { BrowserRouter } from 'react-router-dom'
// ...
root.render(<BrowserRouter><App /></BrowserRouter>)
```

- [ ] **Step 2: Add routes** in `App.tsx`. Keep providers; the workbench keeps its
`hasProfile`→Landing/Shell logic, now mounted at `/app`. `/` renders a placeholder `<HeroPage>`
(real content in Phase 8). Preserve all existing providers exactly.
```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
// /         -> <HeroPage/>
// /app      -> providers + (hasProfile ? <AppShell/> : <LandingScreen/>)
// *         -> <Navigate to="/" replace/>
```
Create a minimal `HeroPage.tsx` stub that renders a centered "xenolinguist" + a `Link to="/app"`
button (full build in Phase 8).

- [ ] **Step 3: Verify** — `/` shows the stub, "Open workbench" navigates to `/app`, the app loads
(landing or shell), all shortcuts still register on `/app`. `npm run build` + `lint` clean.

- [ ] **Step 4: Commit** `git commit -am "redesign(routing): react-router with / (hero) and /app (workbench)"`

---

# Phase 3 — App shell

Reference `prototypes/xenolinguist/components/Shell.jsx` for all four. Preserve every overlay,
shortcut, and data binding already in `AppShell.tsx`.

### Task 9: Sidebar (hover-expand)

**Files:** Modify `client/src/components/layout/Sidebar.tsx`; Reference `Shell.jsx` → `Sidebar`

- [ ] **Step 1: Restyle** to the `.sidebar`/`.sidebar-item` system: 56px collapsed → 208px on hover
(CSS `:hover` on `.sidebar` adds `.expanded` width, or track hover state). Each item: glyph (22px
col) + name (fades in) + phase number (right, fades in). Active item: `.active` (accent tint + left
glow bar). Mark block at top (XenoMark 28px + wordmark fading in). Footer: `⌘K` Command row that
opens the command palette. **Preserve** the existing `phases`/`activePhase`/`onPhaseChange` props
and sandbox-phase handling.

- [ ] **Step 2: Verify** — hover expands smoothly; clicking items switches phases; `1–6` still
navigates; active state matches the mockup screenshot (`preview_screenshot` vs `Xenolinguist
Workbench.html`). Console clean.

- [ ] **Step 3: Commit** `git commit -am "redesign(shell): hover-expand sidebar"`

### Task 10: Header (56px) + crumb + status pills

**Files:** Modify `client/src/components/layout/AppShell.tsx`; Reference `Shell.jsx` → `Header`

- [ ] **Step 1: Restyle the `<header>`** from `h-10` to the `.app-header` (56px) spec: left crumb =
XenoMark(18) + profile name + `/` + current phase glyph + phase name (all `.crumb`). Right: AI Chat
button (`● AI  ⇧A` pattern, purple dot) wired to the existing `setChatOpen`. Far right: status pills
`● <model>` + `N words` + `N samples` + `N clips` from `useProfile`/`useOllama` (keep current data
sources). **Do not touch** the overlay mounts, `renderPhase`, shortcut wiring, or sandbox logic
below the header.

- [ ] **Step 2: Verify** — crumb reflects active phase; AI button toggles chat; pills show live
counts; Ollama dot reflects `connected`. Console clean; build + lint pass.

- [ ] **Step 3: Commit** `git commit -am "redesign(shell): 56px header with crumb + status pills"`

### Task 11: StatusBar

**Files:** Modify `client/src/components/layout/StatusBar.tsx`; Reference `Shell.jsx` → `StatusBar`

- [ ] **Step 1: Restyle** to `.status-bar` (28px): `● Ollama connected` · `DECODE <n>%` (accent) ·
`CONF · X confirmed / Y probable / Z unknown` · spacer · `[ L ] Session log` (calls existing
`onToggleLog`) · `[ ? ] Shortcuts` (calls existing `onShowShortcuts`). Derive decode % and
confidence counts from `useProfile` dictionary buckets (≥76 / 41–75 / ≤40). Keep the existing
`logOpen`/`onToggleLog`/`onShowShortcuts` props.

- [ ] **Step 2: Verify** — counts match the dictionary; `L` and the click both toggle the log;
`?` opens shortcuts. Build + lint + console clean.

- [ ] **Step 3: Commit** `git commit -am "redesign(shell): status bar with decode % + confidence counts"`

### Task 12: SessionLog panel

**Files:** Modify `client/src/components/layout/SessionLog.tsx`; Reference README "Session log"

- [ ] **Step 1: Restyle** the slide-up panel to glass + `.log-entry` rows (80px timestamp · kind
marker · body), milestone rows in accent. Keep the data source from `session-log-context` and the
`onClose` prop.

- [ ] **Step 2: Verify** — `L` slides it up with real log entries; milestones render accent;
animation matches. Console clean.

- [ ] **Step 3: Commit** `git commit -am "redesign(shell): session log panel"`

**Phase 3 checkpoint:** Walk the shell portion of the no-regression checklist (shortcuts, log, chat
toggle, sandbox phase prepend if `is_sandbox`). Fix before continuing.

---

# Phase 4 — Dashboard (build first; validates the system)

### Task 13: Dashboard "Field Log"

**Files:** Modify `client/src/components/phase6-dashboard/Dashboard.tsx`;
Reference `prototypes/.../DashboardPhase.jsx` + README "Phase 6".

- [ ] **Step 1: Read** the current `Dashboard.tsx` (note every `useProfile` field + import/export
handlers it uses) and the prototype `DashboardPhase.jsx`.

- [ ] **Step 2: Rebuild** the layout to the field-log spec, wiring REAL data:
  - Header: "Field *Log*" + kicker; Import / Export JSON / CSV buttons → keep existing handlers.
  - Hero row: `ConfRing` at 140px showing real decode %; massive 84px number (`text-glow`); the
    "+12% / projected" line (compute from timeline if available, else static copy); 4 mini stats
    (Vocab/Grammar/Numbers/Samples %) from real counts.
  - Confidence Distribution tile: confirmed/probable/unknown counts + `.cbar`s from real buckets.
  - 30-Day Trends tile: `MiniSpark` rows (use real history if tracked, else derive from timeline).
  - 4 stat tiles (WORDS/GRAMMAR/SAMPLES/NUMBERS) from real counts.
  - Discovery Timeline: render real `session-log`/`timeline` data with milestone styling.
  - Next Milestones + AI Field Notes (purple) tiles.
  - **Preserve** import/export wiring exactly.

- [ ] **Step 3: Verify** — `preview_screenshot` of `/app` Dashboard vs the prototype HTML; numbers
match the loaded profile; export still downloads JSON; import still works. Build + lint + console clean.

- [ ] **Step 4: Commit** `git commit -am "redesign(dashboard): field-log layout"`

---

# Phase 5 — Remaining phases

For each: read the current component (preserve its hooks/handlers) + the matching prototype +
README section, then restyle markup to the new classes. End each with the standard verify + commit.

### Task 14: Vocabulary
**Files:** Modify `phase3-vocabulary/VocabularyBuilder.tsx`; Reference `VocabularyPhase.jsx` + README "Phase 3".
- [ ] **Step 1:** POS filter chips with counts; Cards/Table toggle (segmented control); cards with
  POS badge + `ConfRing` + confidence-colored word; right-column Inspector (selected word: big word,
  `ConfRing` 52, meaning, POS/conf badges, context/examples/notes, AI-suggestion subcard, Promote/
  Demote/Delete). Wire to real dictionary CRUD + AI-suggest handlers already in the component.
- [ ] **Step 2:** Verify (screenshot vs prototype; add/edit/promote/demote/delete still work; AI
  Suggest still calls `useAI`/`useAutoSuggest`). Build + lint + console clean.
- [ ] **Step 3:** `git commit -am "redesign(vocabulary): cards/table + inspector"`

### Task 15: Translation (the moneyshot)
**Files:** Modify `phase5-translation/TranslationEngine.tsx`; Reference `TranslationPhase.jsx` + README "Phase 5".
- [ ] **Step 1:** 3-pane (Source / Translation / Inspector) layout; hoverable `.word-token.wt-*`
  rendering with `.expr-color` default (parent toggle for the other `.expr-*` modes); Token Inspector
  (candidates with conf bars, note, source samples, Lock in/Edit); direction toggle. Wire to the
  real translation/AI full-pass handlers; keep token data from real dictionary lookups.
- [ ] **Step 2:** Verify (hover inspects; AI full translation still streams; direction toggle works).
- [ ] **Step 3:** `git commit -am "redesign(translation): 3-pane cinematic engine"`

### Task 16: Grammar
**Files:** Modify `phase4-grammar/GrammarAnalyzer.tsx`; Reference `GrammarPhase.jsx` + README "Phase 4".
- [ ] **Step 1:** Add-rule card (description + evidence textareas + confidence slider with bucket-
  colored track); rule list cards (evidence chips + conf bar); Rule Inspector; AI Proposed Rules
  (purple, Adopt/Dismiss). Wire to real grammar CRUD + AI analyze.
- [ ] **Step 2:** Verify (add/edit rule, slider sets confidence, AI analyze still runs).
- [ ] **Step 3:** `git commit -am "redesign(grammar): rule builder + inspector"`

### Task 17: Numbers
**Files:** Modify `phase2-numbers/NumberDecoder.tsx`; Reference `NumbersPhase.jsx` + README "Phase 2".
- [ ] **Step 1:** Detected Base card (huge `baseN` + bar chart of candidates); Mappings grid (tiles
  with status + base-digit ticks); Operators card; Pattern Notes with confidence dots. Wire to real
  `number_system` data + Detect Base handler.
- [ ] **Step 2:** Verify (mappings reflect real data; Detect Base still runs).
- [ ] **Step 3:** `git commit -am "redesign(numbers): base system + mappings grid"`

### Task 18: Samples (+ recorder sub-panel)
**Files:** Modify `phase1-samples/{SampleInput,SampleDecodeView}.tsx`; Reference `SamplesPhase.jsx` + README "Phase 1".
- [ ] **Step 1:** Two-column: capture form (textarea, parallel-mode 2nd textarea, source dropdown,
  phonetic notes, action row with Add/Recorder toggle/Upload/AI Auto-decode) + samples list (filters,
  search, sample cards with ID/status/source/audio badges, alien text, decoded meaning, phonetic +
  mini waveform). Recorder sub-panel: timer + waveform viz + Record/Auto-segment/Detect phonemes.
  **Preserve** parallel mode, real sample CRUD, audio attach, AI auto-decode wiring.
- [ ] **Step 2:** Verify (add sample, toggle parallel, open recorder, upload audio, AI auto-decode).
- [ ] **Step 3:** `git commit -am "redesign(samples): capture form + recorder + list"`

### Task 19: Audio components
**Files:** Modify `audio/{AudioRecorder,AudioPlayer,AudioSegmenter,WaveformCanvas,LanguageDetector}.tsx`.
- [ ] **Step 1:** Restyle to tokens/glass; `WaveformCanvas` to the new bar style (`.wave-mini` /
  64px recorder waveform). Keep all Web Audio / MediaRecorder / segment-link logic intact.
- [ ] **Step 2:** Verify (record → waveform animates; play; segment; language detect — all still function).
- [ ] **Step 3:** `git commit -am "redesign(audio): restyle waveform + audio panels"`

### Task 20: Sandbox
**Files:** Modify `sandbox/{SandboxSetup,SandboxController}.tsx`.
- [ ] **Step 1:** Restyle to tokens/glass + purple AI accent; keep the conlang generation flow,
  difficulty selection, and answer-key reveal.
- [ ] **Step 2:** Verify (generate a sandbox language; phase prepends; controller works).
- [ ] **Step 3:** `git commit -am "redesign(sandbox): restyle setup + controller"`

**Phase 5 checkpoint:** Full no-regression pass across all six phases.

---

# Phase 6 — Overlays

Reference `prototypes/xenolinguist/components/Overlays.jsx` + README "Overlays".

### Task 21: AI Chat slide-over
**Files:** Modify `client/src/components/layout/AIChat.tsx`.
- [ ] **Step 1:** Restyle to `.side-panel` (420px): header (purple dot + "Decoder AI" + model +
  close); context chips row (words/rules/samples/base from real profile); message thread (user =
  right green bubble, AI = left dark glass with "DECODER AI" label); streaming shimmer "thinking…";
  quick-action chips + input row. **Preserve** the existing streaming (`useAI` SSE) and context-
  building logic exactly.
- [ ] **Step 2:** Verify (open with ⇧A; send a message; tokens stream; quick actions work; close).
- [ ] **Step 3:** `git commit -am "redesign(overlays): AI chat slide-over"`

### Task 22: Command Palette
**Files:** Modify `client/src/components/layout/CommandPalette.tsx`.
- [ ] **Step 1:** Restyle to `.cmd-overlay` + `.cmd-box`: search input + ESC hint; rows with
  NAV(green)/TOOL(purple)/HELP(mute) kind badges + label + kbd hint; footer hints. **Preserve** the
  fuzzy filter + all command actions (nav 1–6, open chat, add word/rule, export/import, tour, shortcuts).
- [ ] **Step 2:** Verify (⌘K opens; typing filters; ↑↓ + ↵ execute; ESC closes; each command runs).
- [ ] **Step 3:** `git commit -am "redesign(overlays): command palette"`

### Task 23: ShortcutsHelp + ToastContainer + OnboardingTour + ContextMenu
**Files:** Modify those four in `client/src/components/layout/`.
- [ ] **Step 1:** Restyle each to tokens/glass (`.popover` for shortcuts + context menu; toast cards;
  tour tooltips on `data-tour` anchors). Keep all behavior (tour localStorage gate, toast queue,
  context-menu actions, shortcut list from `registered`).
- [ ] **Step 2:** Verify (?, toast on an action, first-run tour, right-click menu).
- [ ] **Step 3:** `git commit -am "redesign(overlays): shortcuts, toasts, tour, context menu"`

---

# Phase 7 — Workbench Landing

### Task 24: LandingScreen
**Files:** Modify `client/src/components/landing/LandingScreen.tsx`; Reference `Landing.jsx` + README "Landing screen".
- [ ] **Step 1:** Three layers: `VantaTopology` (opacity 0.95) + existing `ParticleField` canvas +
  vignette/grid overlay. Centered 520px column: XenoMark(56) + "xenolinguist" wordmark + kicker +
  version/Ollama-connected stamp; two CTA cards (New Language / Sandbox); Saved Profiles list (mono
  rows: dot + name + word count + progress bar + %). **Preserve** the real profile-load/create flow
  (`useProfile`, `services/api.ts`) and the ParticleField.
- [ ] **Step 2:** Verify (profiles list from API; clicking a profile enters `/app` shell; New
  Language + Sandbox flows work; particles + topology render). Console clean.
- [ ] **Step 3:** `git commit -am "redesign(landing): vanta + profile selector"`

### Task 25: ProfileSetup
**Files:** Modify `client/src/components/landing/ProfileSetup.tsx`.
- [ ] **Step 1:** Restyle the create-profile form to glass/tokens; keep all fields + submit wiring.
- [ ] **Step 2:** Verify (create a profile end-to-end).
- [ ] **Step 3:** `git commit -am "redesign(landing): profile setup form"`

---

# Phase 8 — Marketing hero page

Reference `prototypes/hero/{Hero.jsx,Sections.jsx,HeroApp.jsx,hero.css}` + README "Hero page".

### Task 26: Hero page scaffold + nav + background
**Files:** Modify `client/src/components/marketing/HeroPage.tsx`; Create `client/src/marketing.css`; add `client/public/first-contact.png`.
- [ ] **Step 1:** Copy `first-contact.png` into `client/public/`. Port `hero.css` into
  `marketing.css` (import it from `HeroPage`). Build the fixed top nav (mark + wordmark + OLLAMA·
  LOCAL-ONLY pill + links + "Open workbench →" → `Link to="/app"`). Mount `VantaTopology`
  (opacity 0.85) as the below-fold backdrop; add the `.scroll-veil` seam.
- [ ] **Step 2:** Verify (`/` shows nav + image hero + topology below; "Open workbench" routes to `/app`).
- [ ] **Step 3:** `git commit -am "redesign(hero): page scaffold, nav, backgrounds"`

### Task 27: DecodeMoment animation
**Files:** Create `client/src/components/marketing/DecodeMoment.tsx`; Reference `Hero.jsx` → `DecodeMoment` + README "Live decoder animation".
- [ ] **Step 1:** Port the 4-phrase word-by-word decoder state machine: per-token states
  `is-alien → is-scanning → is-decoded.conf-*`, the `.scanmark` underline, the per-token 720ms
  cadence + 2200ms hold + fade + advance, and the clickable `SampleRail` pips. Use the hardcoded
  `PHRASES` from the README (this is demo content, correct to inline here).
- [ ] **Step 2:** Verify (animation cycles smoothly; tokens decode with color + tick; rail pips jump
  phrases; no console errors; timers cleaned up on unmount).
- [ ] **Step 3:** `git commit -am "redesign(hero): live decoder animation"`

### Task 28: Hero stage content
**Files:** Modify `client/src/components/marketing/HeroPage.tsx`.
- [ ] **Step 1:** Eyebrow/kicker, the "Decode / the unknown." headline (green-glow `em`), the
  `DecodeMoment` mount, source line + sample-pip rail, sub copy, CTA row ("Start decoding →" → /app,
  "Try the sandbox"), footer meta row, reticle + caption overlays. Match the README spec.
- [ ] **Step 2:** Verify (`preview_screenshot` of `/` vs `Xenolinguist Hero.html` top).
- [ ] **Step 3:** `git commit -am "redesign(hero): hero stage content"`

### Task 29: Method ribbon + interactive mini-decoder
**Files:** Create/extend `client/src/components/marketing/sections.tsx`.
- [ ] **Step 1:** Six-phase ribbon (6 cards: phase #, glyph, name, description, stamp — data from
  README table). Mini-decoder: source textarea prefilled with the README sample + right pane that
  tokenizes input and looks up `DEMO_DICT` (inline the README's 16-entry dict), rendering each token
  in its confidence color (or `[?]` red), with token counts + average confidence. Pure client logic.
- [ ] **Step 2:** Verify (typing in the source updates the translation + counts live).
- [ ] **Step 3:** `git commit -am "redesign(hero): method ribbon + mini-decoder"`

### Task 30: Features / Privacy / Final CTA / Footer
**Files:** Extend `client/src/components/marketing/sections.tsx`.
- [ ] **Step 1:** Features grid (4 cards), Privacy block (big quote + 3 stat columns + radial glow),
  Final CTA ("Make first *contact.*" + 2 buttons), Footer (mark + version + links). Match README.
- [ ] **Step 2:** Verify (full-page scroll `preview_screenshot` vs prototype; links/CTAs route correctly).
- [ ] **Step 3:** `git commit -am "redesign(hero): features, privacy, CTA, footer"`

---

# Phase 9 — Polish & verification

### Task 31: Pixel pass + full no-regression walkthrough
**Files:** Any touched up as needed.
- [ ] **Step 1:** Side-by-side `preview_screenshot` of every surface vs its prototype HTML
  (`Xenolinguist Hero.html`, `Xenolinguist Workbench.html`). Note diffs (spacing, color, type,
  motion) and fix. Use `preview_resize` at the 1280×800 baseline.
- [ ] **Step 2:** Execute the **entire** global no-regression checklist on `/app`, ticking each item.
- [ ] **Step 3:** `npm run build` + `npm run lint` clean; `preview_console_logs` + `preview_network`
  clean across routes.
- [ ] **Step 4:** Commit any fixes `git commit -am "redesign(polish): pixel pass + regression fixes"`

### Task 32: Finalize
- [ ] **Step 1:** Update `README.md` screenshots section if screenshots are regenerated (optional).
- [ ] **Step 2:** Summarize the diff; use superpowers:finishing-a-development-branch to choose
  merge/PR. (Do not merge to `main` without the user's go-ahead.)

---

## Self-review notes (author)

- **Spec coverage:** every spec file-map entry maps to a task (Foundation T1–7; routing T8; shell
  T9–12; dashboard T13; phases T14–20; overlays T21–23; landing T24–25; hero T26–30; polish T31–32).
  No-regression contract is enforced as a per-phase checkpoint + Task 31.
- **Verification:** unit tests intentionally omitted (no runner in repo; visual redesign) — replaced
  by build+lint+preview+regression walkthrough, stated up front.
- **Type consistency:** `ConfRing({value,size,stroke})`, `MiniSpark({values,color,w,h})`,
  `XenoMark({size})`, `VantaTopology({opacity,style})`, `bucket()` thresholds (≥76 / 41–75 / ≤40)
  used consistently across tasks.
- **Decision alignment:** matches approved spec — Tailwind `@theme` mapping (D1), react-router (D2),
  font swap (D3), Vanta-via-npm (D4), no data-layer changes (D5), asset handling (D6), no tweaks (D7).
