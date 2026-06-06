# Xenolinguist — Redesign Brief

> Hand this document to a designer (or to Claude Design) to revamp the visual + interaction layer
> without losing the product's identity, data model, or power-user behaviors.

---

## 1. What the app is

Xenolinguist is a **single-user, full-stack web workbench for decoding an unknown language from
zero**. Inspired by the first-contact scenes in *Project Hail Mary*, it walks you through the same
methodology a real xenolinguist would use: collect samples → crack the number system → build a
dictionary → infer grammar → translate live → review progress.

- **Audience:** conlang hobbyists, sci-fi worldbuilders, linguistics nerds, and anyone who wants to
  feel like Ryland Grace working out Eridian.
- **Privacy posture:** AI runs locally via **Ollama** — language data never leaves the machine.
- **Surface:** desktop-first web app (1280×800 baseline, scales up). Not currently optimized for mobile.

A **Sandbox** mode generates a fully synthetic conlang via the LLM so the user can practice
decoding from scratch with a known answer key.

---

## 2. The six-phase workflow (the spine of the UX)

| # | Phase | Icon | What happens here |
|---|---|---|---|
| 1 | **Samples** | `{}` | Paste / type / record raw alien text. Tag source, add phonetic notes, optionally attach audio. |
| 2 | **Numbers** | `#` | Map number words 1–20+, detect the base, define operators (plus, times, etc.). Always first — numbers are the Rosetta Stone. |
| 3 | **Vocabulary** | `Aa` | Build the dictionary. Each entry: alien word, English meaning, part of speech, **confidence 0–100**, context, examples, notes. AI can suggest mappings. |
| 4 | **Grammar** | `⟨⟩` | Document word-order rules, morphology, structural patterns. Each rule carries evidence + confidence. |
| 5 | **Translation** | `⇄` | Live word-by-word translation. Each word is colored by confidence; click to inspect/correct. AI can do full-sentence passes. |
| 6 | **Dashboard** | `◈` | Decoding progress %, animated stats, import/export profile, discovery timeline. |

**Navigation:** left rail sidebar (52px collapsed → 192px on hover), keys **1–6** jump between
phases. A Sandbox phase prepends when `profile.is_sandbox`.

---

## 3. App shell anatomy

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER  [logo] [profile name]  ›  [phase icon] [phase label]      │  ← glass, breadcrumb + status
│         …                                  [AI] [● model] [stats] │
├──┬───────────────────────────────────────────────────────────────┤
│  │                                                                │
│ S│                                                                │
│ I│            MAIN  — current phase view (animate-phase-enter)    │
│ D│            full-width, no max-w cap, p-5                       │
│ E│                                                                │
│ B│                                                                │
│ A│                                                                │
│ R│                                                                │
│  │                                                                │
├──┴───────────────────────────────────────────────────────────────┤
│ SESSION LOG (slide-up, h-48, toggleable with L)                   │
├───────────────────────────────────────────────────────────────────┤
│ STATUS BAR                                                        │
└───────────────────────────────────────────────────────────────────┘

Overlays: CommandPalette (⌘K), ShortcutsHelp (?), AIChat (Shift+A),
          ToastContainer, OnboardingTour (first-run, gated by localStorage).
```

---

## 4. Component inventory

All under `client/src/components/`:

- **layout/** — `AppShell`, `Sidebar`, `StatusBar`, `CommandPalette`, `AIChat`, `ContextMenu`,
  `OnboardingTour`, `ToastContainer`, `ShortcutsHelp`, `SessionLog`
- **landing/** — `LandingScreen` (with `ParticleField` canvas), `ProfileSetup`
- **phase1-samples/** — `SampleInput`, `SampleDecodeView`
- **phase2-numbers/** — `NumberDecoder`
- **phase3-vocabulary/** — `VocabularyBuilder`
- **phase4-grammar/** — `GrammarAnalyzer`
- **phase5-translation/** — `TranslationEngine`
- **phase6-dashboard/** — `Dashboard`
- **sandbox/** — `SandboxSetup`, `SandboxController`
- **audio/** — `AudioRecorder`, `AudioPlayer`, `AudioSegmenter`, `WaveformCanvas`, `LanguageDetector`

**Hooks:** `useAI`, `useAutoSuggest`, `useKeyboardShortcuts`, `useUndoRedo`
**Stores (React Context):** `profile-context`, `ollama-context`, `session-log-context`,
`toast-context`, `undo-context`

---

## 5. Data model (don't break these shapes)

```ts
LanguageProfile {
  id, name, description, phonetic_notes,
  created_at, updated_at,
  is_sandbox: boolean,
  sandbox_difficulty?: SandboxDifficulty,
  dictionary: DictionaryEntry[],
  grammar_rules: GrammarRule[],
  number_system: NumberSystem,
  samples: Sample[],
  audio_clips: AudioClip[],
}

DictionaryEntry { id, alien_word, english_meaning, part_of_speech,
                  confidence: 0-100, context, examples[], notes, created_at }

GrammarRule    { id, rule, evidence[], confidence: 0-100, created_at }

NumberSystem   { base: number|null, mappings: Record<number,string>,
                 operators: Record<string,string> }

Sample         { id, alien_text, english_translation|null, source,
                 phonetic_notes, decoded: boolean, audio_id|null, created_at }

AudioClip      { id, filename, duration, waveform: number[],
                 segments: AudioSegment[], created_at }

AudioSegment   { id, start, end, label, dictionary_entry_id|null }
```

**Confidence buckets** (use these colors consistently across every phase):
- **Confirmed** ≥ 76 — emerald / green
- **Probable** 41–75 — amber
- **Unknown** 0–40 — red/coral

**Parts of speech:** noun, verb, adjective, pronoun, number, connector, particle, unknown.

---

## 6. API surface (Express, mounted at `/api`)

- `GET    /profiles` — list saved profiles
- `POST   /profiles` — create
- `GET    /profiles/:id` — load
- `PUT    /profiles/:id` — save
- `DELETE /profiles/:id` — delete
- `POST   /ai/stream` — SSE token stream for chat / suggestions
- `GET    /ollama/status` — connection + model list
- `GET    /ollama/models` — full Ollama `/api/tags` passthrough
- `POST   /audio/upload` + `GET /audio/:filename` — clip storage

**Vite dev proxy:** `/api → http://localhost:3001`. Client at `:5173`, server at `:3001`.

---

## 7. Current design system (what exists today)

**Tokens** (defined in `client/src/index.css` via `@theme`):

```css
--font-sans: 'Outfit', sans-serif;
--font-mono: 'JetBrains Mono', monospace;
--color-deep: #030305;              /* page background */
--color-surface: rgba(10,10,16,0.75);
--color-surface-light: rgba(18,18,28,0.55);
--color-border: rgba(255,255,255,0.06);
--color-accent: #00E676;             /* primary green */
--color-accent-dim: #00A854;
```

**Four-layer frosted glass** (Apple-inspired, keep this if redesign stays in the same family):

| Layer | Class | Blur | Use |
|---|---|---|---|
| 0 | `.glass` | 40px sat 1.8 | header, sidebar, status bar |
| 1 | `.glass-card` | 24px sat 1.5 + noise overlay | content cards |
| 2 | `.glass-inner` | 12px | nested panels |
| 3 | `.glass-popover` | 48px sat 2.0 | modals, command palette |

**Signature touches:**
- Fractal-noise SVG overlay on cards (material authenticity)
- Brighter top border on glass elements (simulated light refraction)
- `.text-chrome` and `.text-chrome-accent` gradient text on headings
- `.glow-accent` / `.text-glow` for the green halo treatment
- Confidence badges: `.badge-confirmed` / `.badge-probable` / `.badge-unknown`
- Background grid + radial vignette behind everything
- Custom animations: `phaseEnter`, `slide-up`, `fade-in-up`, `scale-pop`, `breathe`, `shimmer`, `float`

**Landing screen:** full-screen canvas particle field — 160 ambient stars + 50 interactive
particles with mouse repulsion and connection lines between nearby pairs. Don't lose this; it's
the first impression.

---

## 8. Power-user features (don't regress these)

- **Command palette** (⌘K) — fuzzy nav + actions
- **Keyboard shortcuts**: `1–6` phases · `L` log · `Shift+A` AI chat · `Shift+?` shortcuts ·
  `Ctrl+Z` undo · `Esc` close panels
- **Undo/redo** across mutations (`useUndoRedo` + `undo-context`)
- **Session log** — running transcript of actions, timestamps
- **Toasts** — non-blocking feedback
- **Onboarding tour** — first-run, dismissible, `data-tour` anchors on phase buttons
- **AI chat panel** — streaming, context-aware (sees current dictionary + grammar + samples)
- **Auto-suggest** — background AI analysis on new samples
- **Import/export** — JSON profile round-trip

---

## 9. User preferences (constraints for the redesign)

From owner's stated preferences:

1. **Aesthetic:** black glass with green accents (`#00E676`) — "outer space yet classy."
   The current direction is right; refine, don't replace.
2. **GitHub-bound:** all Anthropic / Claude references must be scrubbed from public-facing surfaces
   before the repo goes public.
3. **Proprietary bits stay private:** AI prompt templates (`shared/prompts.ts`) and analysis logic
   should be kept private (separate repo, env-gated, or `.gitignore`d). Treat them as the moat.
4. **Audio is a growth area:** owner wants stronger audio-driven decoding —
   identify words, phonemes, and sounds from recordings. The `audio/` components are scaffolded
   but the UX around them is the most under-baked. Prioritize this in the redesign.

---

## 10. Tech stack (so the designer knows what's available)

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript 5.8, Vite 8 |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`) + custom CSS in `index.css` |
| State | React Context + custom hooks (no Redux/Zustand) |
| Backend | Node.js, Express, TypeScript |
| AI | **Ollama** local LLMs (multi-model routing — heavy for analysis, light for suggestions) |
| Storage | File-based JSON profiles (`server/data/profiles/*.json`) |
| Audio | Web Audio API, Web Speech API, MediaRecorder |
| Monorepo | npm workspaces: `client/`, `server/`, `shared/` |

---

## 11. Suggested redesign priorities (designer's call to react to)

In rough order of impact:

1. **Audio-first decoding flow.** Currently audio is bolted onto Samples. Promote it to a
   first-class surface: waveform → segment → label → auto-link to dictionary entry. Phoneme view.
2. **Confidence as the visual primary.** Color is doing the work today; explore *spatial* and
   *typographic* expressions of confidence (e.g., letter weight, blur, opacity ramps).
3. **Translation phase polish.** Word-by-word coloring is the moneyshot of the app — make it
   feel cinematic. Hover state, inspect drawer, alternate-meaning carousel.
4. **Dashboard storytelling.** Today it's stats; could be a "field log" — timeline of discoveries,
   confidence trends over time, first-translated-sentence moment.
5. **Onboarding without a tour.** The 6-phase mental model should be teachable through the empty
   states themselves; the explicit tour should be a fallback.
6. **Density modes.** Power users want compact tables; new users want spacious cards.
   One toggle, persisted per profile.
7. **Scrub Anthropic references** anywhere they appear (UI, code comments, README) before public push.

---

## 12. Screenshots to study (already in `docs/screenshots/`)

`landing.png` · `New Profile.png` · `Samples.png` · `numbers.png` · `vocabulary.png` ·
`Grammar.png` · `translation.png` · `dashboard.png`

These show the **current** state — treat them as the "before" for the redesign.

---

## 13. What the designer should deliver

- Updated visual language (tokens, type scale, spacing scale, motion specs)
- High-fidelity mocks for: landing, profile setup, each of the 6 phases, AI chat, command palette,
  audio-decoding flow, dashboard
- Empty-state designs for every phase (currently underserved)
- Light/dark consideration — app is dark-only today; decide if that stays
- Component spec sheet covering: buttons, inputs, badges, cards, modals, toasts, tabs
- Updated logo / favicon if the wordmark changes

---

*Last updated: 2026-05-24 · Owner: Parusan Natheeswaran*
