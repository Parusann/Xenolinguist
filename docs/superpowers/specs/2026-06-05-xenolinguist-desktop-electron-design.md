# Xenolinguist Desktop (Electron) — Design Spec

- **Date:** 2026-06-05
- **Status:** Approved design, ready for implementation plan
- **Packaging:** Electron (downloadable, fully-local desktop app)
- **Supersedes:** `2026-06-05-xenolinguist-web-deploy-design.md` (the Fly.io + Cloudflare-tunnel web-hosting approach). That spec is retained for reference on the `deploy/web-fly` branch but is no longer the direction. Its reusable ideas — Express serving the SPA, the `DATA_DIR` storage refactor, and the AI provider abstraction — are carried forward here.

## 1. Goal

Ship Xenolinguist as a **downloadable desktop application that runs entirely on the user's own machine** — no hosting, no tunnel, no cloud dependency. This matches the app's local-first identity ("nothing leaves your machine," local Ollama) and removes every hard problem the web deploy introduced (tunnel, CF-Access, Claude-for-availability, persistent volume, CORS). It also unlocks desktop-only capabilities (offline-by-default, system tray, global hotkeys) that a future voice/phonetics spec will build on.

## 2. Current state (recap)

- Monorepo, npm workspaces: `client` (Vite 8 / React 19), `server` (Express 4, ESM, TypeScript), `shared`.
- `server/src/app.ts` is API-only today (`/api/health`, `/api/ollama`, `/api/profiles`, `/api/ai`, `/api/audio`), CORS pinned to `localhost:5173`, 50 MB JSON limit.
- `services/ai-service.ts` uses the `ollama` npm client against `OLLAMA_BASE_URL` (default `127.0.0.1:11434`).
- Storage is file-based under `server/data/` (profiles JSON + audio `.webm`), paths currently hardcoded from `import.meta.dirname`.
- Client calls relative `/api` everywhere and already renders an Ollama connection-status UI.
- The designer redesign is merged to `main`; the client builds green.

## 3. Chosen approach — Electron shell over the existing app

One Electron app. The **main process boots the existing Express server** on a local loopback port; the server **also serves the built client (`client/dist`) as a static SPA**; a `BrowserWindow` loads that localhost URL, so the renderer is the unmodified React app. Because the client uses a **relative `/api` base**, this needs **near-zero client change** and reuses the "Express-serves-the-SPA" static-serving step originally designed for the (now-retired) web deploy.

### Architecture

```
Electron main process
 ├─ forks the compiled server (server/dist/index.js) as a child/utilityProcess
 │    ├─ PORT=0  → OS picks a free port, bound to 127.0.0.1 only
 │    ├─ DATA_DIR = app.getPath('userData')/data
 │    └─ serves  /api/*  AND  client/dist (SPA fallback for non-/api GET)
 ├─ BrowserWindow → http://127.0.0.1:<port>     (renderer = the React app)
 ├─ Ollama lifecycle (detect / assist-install / first-run model pull)
 ├─ tray + global shortcuts + auto-update
 └─ (future seam) voice sidecars: espeak-ng, Python phonetic model
```

## 4. Components

### 4.1 Electron shell (main + preload)
- New `electron/main.ts` (app lifecycle, window, server boot, Ollama manager, tray, updater) and a **minimal `electron/preload.ts`** exposing only safe values (app version, user-data path) over a `contextBridge` channel.
- Single-instance lock; standard window state (size/position) persistence.

### 4.2 Server process model & ports
- Main `fork`s `server/dist/index.js` (or Electron `utilityProcess.fork`) with env `PORT=0`, `DATA_DIR=<userData>/data`, `NODE_ENV=production`. The server reports its bound port back to main (stdout/IPC), which constructs the `BrowserWindow` URL.
- Server binds to **127.0.0.1** only. The server process is terminated on app quit.
- The existing `server/src/index.ts` needs a tiny change: read the actual bound port from `server.address()` and emit it (since `PORT=0`).

### 4.3 Static SPA serving (reused from the deploy design)
- `server/src/app.ts` gains `express.static(CLIENT_DIST)` + an SPA catch-all returning `index.html` for non-`/api` GETs. `CLIENT_DIST` resolves to the packaged client in production and is skipped in dev (Vite serves it).
- CORS becomes a no-op in the packaged app (single origin: the localhost server serves both UI and API). The dev `localhost:5173` origin stays for `npm run dev`.

### 4.4 Storage
- Introduce a `paths.ts` resolving the data root from `DATA_DIR`; refactor `profile-store.ts` and `audio.ts` to use it instead of hardcoded `import.meta.dirname` paths. (Same refactor the deploy spec called for.)
- Production `DATA_DIR = app.getPath('userData')/data` (e.g. `%APPDATA%/Xenolinguist/data`, `~/Library/Application Support/Xenolinguist/data`). Profiles + audio persist across app updates. Dev keeps `server/data`.

### 4.5 Ollama lifecycle
- On launch the main process detects Ollama at `127.0.0.1:11434`.
- If missing: offer **assisted install** via `electron-ollama` (detect existing / install if absent / ship binaries), rather than bundling Ollama's full footprint into the installer.
- On first run, pull the **default model `gemma4:e4b`** (the lightweight Gemma variant) with a progress UI. *Implementation note:* confirm the exact Ollama registry tag at build time (the lightweight Gemma model is published under a specific tag, e.g. the `e4b` variant) so `ollama pull` resolves; expose it via config so it's a one-line change.
- An in-app **model picker** lets the user switch/download other models; the chosen model is persisted in the profile/app settings (the current code hardcodes `qwen3:14b` in `ai-service.ts` — this becomes config-driven, defaulting to `gemma4:e4b`).
- If Ollama is unreachable, the existing "AI offline" UI degrades gracefully. **Claude remains an optional provider** (for users without a capable GPU); it is not required for availability since everything is local.

### 4.6 Packaging & distribution
- `electron-builder` targets: **Windows NSIS**, **macOS dmg** (+ notarization), **Linux AppImage/deb**.
- Build bundles `client/dist`, `server/dist`, `shared` (compiled), and production `node_modules` as app resources.
- **Auto-update via `electron-updater` against GitHub Releases** (already the project's host); a simple download page links the latest release.
- **Code-signing certificates are a prerequisite the maintainer provides** (Apple Developer ID for notarization; a Windows code-signing cert). Unsigned builds are usable for local testing with OS warnings; signing is required before public distribution.

### 4.7 Repo structure & build flow
- Add an `electron/` area (main + preload + electron-builder config), wired as part of the workspace.
- Scripts: `electron:dev` (run Vite dev + electron pointing at it, or the localhost server), `build` (client + server as today), `dist` (electron-builder package). The server build must also emit compiled `shared/*.js` (server imports `shared` via relative `.js` paths) — verify early.

### 4.8 Security
- `contextIsolation: true`, `nodeIntegration: false` in the renderer (it is a normal web client hitting the localhost API — no Node needed in the renderer).
- Minimal preload surface. Loopback-only server. Optional per-session API token (main injects it; preload exposes it) as hardening against other local processes hitting the port.

## 5. Data flow

```
user → BrowserWindow (React) → fetch /api/* → localhost Express (in app)
                                              ├─ profiles/audio → userData/data
                                              └─ /api/ai → Ollama (127.0.0.1:11434) [or optional Claude]
```

## 6. Config / settings

| Key | Source | Purpose |
|---|---|---|
| `PORT` | env (`0` in prod) | OS-assigned free loopback port |
| `DATA_DIR` | env | data root (`userData/data` in prod) |
| `NODE_ENV` | env | `production` in the packaged app |
| `CLIENT_DIST` | env/derived | packaged SPA path for static serving |
| default model | app setting | `gemma4:e4b`, user-overridable via picker |
| `AI_PROVIDER` | app setting | `ollama` (default) or optional `anthropic` |

## 7. Out of scope (next spec)

Voice/phonetics — local phonetic/IPA recognition (Allosaurus), browser + espeak-ng TTS, and system-wide hotkey dictation — is a **follow-on spec**. The main-process design here intentionally leaves a clean seam for managing those sidecars (espeak-ng binary, a Python phonetic model). Also deferred: making Claude a first-class optional provider (minor), and any model-management UI beyond a basic picker.

## 8. Testing / verification

- `electron:dev` launches the app; all six phases load; profiles CRUD works.
- Packaged installer runs on a clean machine (per OS); profiles + audio persist in `userData` across an app update.
- Server boots on a free loopback port; renderer loads it; quitting the app stops the server process.
- Ollama detection works: present → chat works; absent → assisted-install path; first-run pulls `gemma4:e4b`; unreachable → graceful "AI offline".
- `npm run build` green (incl. compiled `shared/*.js`); `electron-builder` produces installers for at least one target.

## 9. Risks & decisions

- **`shared` build wiring** — the server imports `shared` via relative `.js`; the build must emit compiled `shared/*.js` or runtime imports break. Verify first (carried from the deploy spec).
- **Model tag** — `gemma4:e4b` must match an actual Ollama registry tag; confirm at build time and keep it config-driven.
- **Code-signing/notarization** — real prerequisite for public distribution (certs + Apple notarization); plan for it before a public release. Unsigned is fine for local testing.
- **Installer size** — dominated by Electron/Chromium (~150–200 MB) plus any bundled assets; acceptable for a downloadable local tool, and Ollama/models install separately rather than bloating the installer.
- **First-run model download** — `gemma4:e4b` is light, but the first pull still needs network + disk; surface clear progress and an offline-tolerant UI.

## 10. Decisions (locked)

- Packaging: **Electron** (Tauri is a possible later "lean it out" migration).
- Ollama: **detect + assisted install** (not fully bundled); default model **`gemma4:e4b`** with an in-app picker.
- Distribution/auto-update: **GitHub Releases + electron-updater**.
- Server runs **in a forked process inside Electron**, serving SPA + API on a 127.0.0.1 free port.
