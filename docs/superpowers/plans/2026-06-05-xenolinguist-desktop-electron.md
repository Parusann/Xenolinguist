# Xenolinguist Desktop (Electron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Xenolinguist from a web app into a downloadable, fully-local Electron desktop app whose Electron main process runs the existing Express server (serving the React SPA + the `/api` routes) on a loopback port, with local Ollama and offline-tolerant behavior.

**Architecture:** Electron `main` boots a **utilityProcess-forked, esbuild-bundled** copy of the existing server (`PORT=0`, `DATA_DIR=<userData>/data`, `CLIENT_DIST=<resources>/client/dist`). The server serves both the built client and `/api`, reports its bound port to `main` over the parent port, and `main` points a `BrowserWindow` at `http://127.0.0.1:<port>`. In dev, `main` instead loads the Vite dev server (`http://localhost:5173`, which already proxies `/api` → `:3001`). Storage moves to the OS user-data dir. Ollama is detected/installed on first run with `gemma4:e4b` as the default model. Packaging is `electron-builder`; updates via `electron-updater` + GitHub Releases.

**Tech Stack:** Electron, electron-builder, electron-updater, electron-ollama, esbuild, Express 4 (ESM/TS), Vite/React 19, vitest + supertest (server tests).

**Spec:** `docs/superpowers/specs/2026-06-05-xenolinguist-desktop-electron-design.md`

---

## File Structure

**Created**
- `electron/main.ts` — Electron main process (window, server lifecycle, Ollama, tray, updater wiring)
- `electron/preload.ts` — minimal `contextBridge` surface
- `electron/server-entry.ts` — production server entry: starts the server, posts the bound port to `main`
- `electron/tsconfig.json` — typecheck config for the electron sources
- `electron/builder.config.cjs` — electron-builder configuration
- `scripts/bundle.mjs` — esbuild bundle of the server + electron sources (with a `.js`→`.ts` resolver)
- `server/src/config.ts` — env-driven config (`DATA_DIR`, `PORT`, `CLIENT_DIST`, default model)
- `server/src/__tests__/config.test.ts`, `…/storage.test.ts`, `…/app.test.ts`, `…/server.test.ts`, `…/ai-service.test.ts`
- `server/vitest.config.ts`

**Modified**
- `server/src/index.ts` — export `startServer()`, auto-listen only when run directly
- `server/src/app.ts` — serve `CLIENT_DIST` SPA + fallback (production only)
- `server/src/services/profile-store.ts` — resolve data dir from `config`
- `server/src/routes/audio.ts` — resolve audio dir from `config`
- `server/src/services/ai-service.ts` — default model from `config` (`gemma4:e4b`)
- `server/package.json` — add `test` script + dev deps (vitest, supertest)
- `package.json` (root) — Electron `main`, scripts, deps, electron-builder hook
- `.gitignore` — ignore `electron/dist`, `release/`

---

## Task 1: Server test harness

**Files:**
- Create: `server/vitest.config.ts`
- Create: `server/src/__tests__/health.test.ts`
- Modify: `server/package.json`

- [ ] **Step 1: Add test deps and script to `server/package.json`**

Add to `devDependencies`: `"vitest": "^2.1.0"`, `"supertest": "^7.0.0"`, `"@types/supertest": "^6.0.2"`. Add to `scripts`: `"test": "vitest run"`, `"test:watch": "vitest"`.

Run: `npm install -w server vitest supertest @types/supertest --save-dev`

- [ ] **Step 2: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Write the failing smoke test `server/src/__tests__/health.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

- [ ] **Step 4: Run it**

Run: `npm test -w server`
Expected: PASS (the `/api/health` route already exists in `app.ts`). This confirms the harness works against the real Express app.

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/package-lock.json package-lock.json server/vitest.config.ts server/src/__tests__/health.test.ts
git commit -m "test(server): add vitest + supertest harness with health smoke test"
```

---

## Task 2: `config.ts` — env-driven paths and model (TDD)

**Files:**
- Create: `server/src/config.ts`
- Create: `server/src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing test `server/src/__tests__/config.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';

afterEach(() => {
  delete process.env.DATA_DIR;
  delete process.env.OLLAMA_MODEL;
  delete process.env.CLIENT_DIST;
});

describe('config', () => {
  it('dataDir honors DATA_DIR env', async () => {
    process.env.DATA_DIR = path.join('/tmp', 'xeno-test');
    const { dataDir } = await import('../config.js?case=1');
    expect(dataDir()).toBe(path.resolve('/tmp', 'xeno-test'));
  });

  it('dataDir falls back to server/data when unset', async () => {
    const { dataDir } = await import('../config.js?case=2');
    expect(dataDir().replace(/\\/g, '/')).toMatch(/\/data$/);
  });

  it('defaultModel honors OLLAMA_MODEL, defaults to gemma4:e4b', async () => {
    const { defaultModel } = await import('../config.js?case=3');
    expect(defaultModel()).toBe('gemma4:e4b');
    process.env.OLLAMA_MODEL = 'llama3.1:8b';
    expect(defaultModel()).toBe('llama3.1:8b');
  });

  it('clientDist returns CLIENT_DIST or null', async () => {
    const { clientDist } = await import('../config.js?case=4');
    expect(clientDist()).toBeNull();
    process.env.CLIENT_DIST = '/app/client/dist';
    expect(clientDist()).toBe(path.resolve('/app/client/dist'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- config`
Expected: FAIL with "Cannot find module '../config.js'".

- [ ] **Step 3: Implement `server/src/config.ts`**

```ts
import path from 'path';

/** Root directory for persisted data (profiles JSON + audio blobs). */
export function dataDir(): string {
  const fromEnv = process.env.DATA_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  // Dev default: <repo>/server/data (this file compiles under server/).
  return path.resolve(import.meta.dirname, '../data');
}

/** Default Ollama model for new chats; user-overridable via OLLAMA_MODEL. */
export function defaultModel(): string {
  return process.env.OLLAMA_MODEL || 'gemma4:e4b';
}

/** Built SPA directory to serve in production, or null in dev (Vite serves). */
export function clientDist(): string | null {
  const fromEnv = process.env.CLIENT_DIST;
  return fromEnv ? path.resolve(fromEnv) : null;
}

/** Port to bind; 0 lets the OS pick a free port (used by the desktop build). */
export function port(): number {
  const raw = process.env.PORT;
  if (raw === undefined) return 3001;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 3001;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w server -- config`
Expected: PASS (4 tests). The `?case=N` query strings defeat ESM module caching so each test re-reads env.

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts server/src/__tests__/config.test.ts
git commit -m "feat(server): add env-driven config (DATA_DIR, model, CLIENT_DIST, PORT)"
```

---

## Task 3: Storage resolves from config (TDD)

**Files:**
- Modify: `server/src/services/profile-store.ts`
- Modify: `server/src/routes/audio.ts`
- Create: `server/src/__tests__/storage.test.ts`

- [ ] **Step 1: Write the failing test `server/src/__tests__/storage.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let tmp: string;

afterEach(async () => {
  delete process.env.DATA_DIR;
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

describe('ProfileStore honors DATA_DIR', () => {
  it('writes a created profile under DATA_DIR/profiles', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-store-'));
    process.env.DATA_DIR = tmp;
    const { ProfileStore } = await import('../services/profile-store.js?store=1');
    const store = new ProfileStore();
    const profile = await store.create({ name: 'Eridian' });
    const onDisk = await fs.readFile(path.join(tmp, 'profiles', `${profile.id}.json`), 'utf-8');
    expect(JSON.parse(onDisk).name).toBe('Eridian');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- storage`
Expected: FAIL — the store still writes under the hardcoded `server/data`, so the file is not found in `tmp`.

- [ ] **Step 3: Edit `server/src/services/profile-store.ts`**

Replace the top-of-file path constants:

```ts
// REMOVE these three lines:
// const DATA_DIR = path.resolve(import.meta.dirname, '../../data');
// const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
// const INDEX_FILE = path.join(DATA_DIR, 'profiles.json');
```

with config-resolved getters, and import config:

```ts
import { dataDir } from '../config.js';

function profilesDir() { return path.join(dataDir(), 'profiles'); }
function indexFile() { return path.join(dataDir(), 'profiles.json'); }
```

Then replace every use of `PROFILES_DIR` with `profilesDir()` and `INDEX_FILE` with `indexFile()` throughout the file (in `init`, `get`, `create`, `update`, `remove`).

- [ ] **Step 4: Edit `server/src/routes/audio.ts`**

Replace:

```ts
const AUDIO_DIR = join(import.meta.dirname, '../../data/audio')
```

with:

```ts
import { dataDir } from '../config.js'
function audioDir() { return join(dataDir(), 'audio') }
```

Then replace every `AUDIO_DIR` usage with `audioDir()` (in `ensureDir` and the three route handlers).

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w server -- storage`
Expected: PASS.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `npm test -w server`
Expected: PASS (health + config + storage).

- [ ] **Step 7: Commit**

```bash
git add server/src/services/profile-store.ts server/src/routes/audio.ts server/src/__tests__/storage.test.ts
git commit -m "feat(server): resolve profile + audio storage from config DATA_DIR"
```

---

## Task 4: Production SPA serving (TDD)

**Files:**
- Modify: `server/src/app.ts`
- Create: `server/src/__tests__/app.test.ts`

- [ ] **Step 1: Write the failing test `server/src/__tests__/app.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import request from 'supertest';

let dist: string;

beforeAll(async () => {
  dist = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-dist-'));
  await fs.writeFile(path.join(dist, 'index.html'), '<!doctype html><title>Xeno</title>');
  process.env.CLIENT_DIST = dist;
});

afterAll(async () => {
  delete process.env.CLIENT_DIST;
  await fs.rm(dist, { recursive: true, force: true });
});

describe('SPA serving when CLIENT_DIST is set', () => {
  it('serves index.html at /', async () => {
    const { createApp } = await import('../app.js?spa=1');
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Xeno');
  });

  it('still serves the API as JSON', async () => {
    const { createApp } = await import('../app.js?spa=2');
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('falls back to index.html for unknown non-/api GET (SPA routing)', async () => {
    const { createApp } = await import('../app.js?spa=3');
    const res = await request(createApp()).get('/app/some/client/route');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Xeno');
  });

  it('returns 404 JSON for unknown /api routes', async () => {
    const { createApp } = await import('../app.js?spa=4');
    const res = await request(createApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- app`
Expected: FAIL with "createApp is not a function" (app.ts currently exports a constructed `app`, not a factory, and has no static serving).

- [ ] **Step 3: Rewrite `server/src/app.ts`**

```ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import { ollamaRouter } from './routes/ollama.js';
import { profilesRouter } from './routes/profiles.js';
import { aiRouter } from './routes/ai.js';
import audioRouter from './routes/audio.js';
import { errorHandler } from './middleware/error-handler.js';
import { clientDist } from './config.js';

export function createApp() {
  const app = express();

  // Single origin in the desktop build; dev keeps the Vite origin.
  app.use(cors({ origin: 'http://localhost:5173' }));
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/ollama', ollamaRouter);
  app.use('/api/profiles', profilesRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/audio', audioRouter);

  // Unknown /api routes get a JSON 404 (never the SPA fallback).
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Production: serve the built SPA and fall back to index.html for client routes.
  const dist = clientDist();
  if (dist) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

// Back-compat for existing imports/tests that use a ready-made app.
export const app = createApp();
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w server -- app`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test -w server`
Expected: PASS (health, config, storage, app).

- [ ] **Step 6: Commit**

```bash
git add server/src/app.ts server/src/__tests__/app.test.ts
git commit -m "feat(server): serve built SPA + fallback when CLIENT_DIST is set"
```

---

## Task 5: `startServer()` on a free port (TDD)

**Files:**
- Modify: `server/src/index.ts`
- Create: `server/src/__tests__/server.test.ts`

- [ ] **Step 1: Write the failing test `server/src/__tests__/server.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest';

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (close) { await close(); close = null; }
  delete process.env.PORT;
});

describe('startServer', () => {
  it('listens on an OS-assigned free port and serves /api/health', async () => {
    process.env.PORT = '0';
    const { startServer } = await import('../index.js?srv=1');
    const handle = await startServer();
    close = handle.close;
    expect(handle.port).toBeGreaterThan(0);
    const res = await fetch(`http://127.0.0.1:${handle.port}/api/health`);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- server`
Expected: FAIL with "startServer is not exported".

- [ ] **Step 3: Rewrite `server/src/index.ts`**

```ts
import 'dotenv/config';
import type { AddressInfo } from 'net';
import { createApp } from './app.js';
import { port } from './config.js';

export interface ServerHandle {
  port: number;
  close: () => Promise<void>;
}

export function startServer(): Promise<ServerHandle> {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(port(), '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      console.log(`[server] Xenolinguist API on http://127.0.0.1:${addr.port}`);
      resolve({
        port: addr.port,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

// Auto-start when run directly (dev: `tsx watch src/index.ts`), not when imported.
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!);
if (isDirectRun || process.env.XENO_START === '1') {
  void startServer();
}
```

Note: in dev, `tsx watch src/index.ts` runs this file directly, so the server still auto-starts on port 3001 (the default when `PORT` is unset). Set `XENO_START=1` as a belt-and-suspenders flag in the dev script if the direct-run detection is unreliable on a given platform.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w server -- server`
Expected: PASS.

- [ ] **Step 5: Verify dev still boots**

Run: `npm run dev -w server`
Expected: logs `Xenolinguist API on http://127.0.0.1:3001`. Stop it with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts server/src/__tests__/server.test.ts
git commit -m "feat(server): export startServer() binding a free loopback port"
```

---

## Task 6: Config-driven default model (TDD)

**Files:**
- Modify: `server/src/services/ai-service.ts`
- Create: `server/src/__tests__/ai-service.test.ts`

- [ ] **Step 1: Write the failing test `server/src/__tests__/ai-service.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest';

afterEach(() => { delete process.env.OLLAMA_MODEL; });

describe('AIService default model', () => {
  it('defaults to gemma4:e4b', async () => {
    const { AIService } = await import('../services/ai-service.js?ai=1');
    expect(new AIService().model).toBe('gemma4:e4b');
  });

  it('honors OLLAMA_MODEL', async () => {
    process.env.OLLAMA_MODEL = 'llama3.1:8b';
    const { AIService } = await import('../services/ai-service.js?ai=2');
    expect(new AIService().model).toBe('llama3.1:8b');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- ai-service`
Expected: FAIL — `model` is private and hardcoded to `qwen3:14b`.

- [ ] **Step 3: Edit `server/src/services/ai-service.ts`**

Add the config import at the top:

```ts
import { defaultModel } from '../config.js';
```

Replace the field declaration:

```ts
// REMOVE: private defaultModel = 'qwen3:14b';
```

with a public, config-driven model field set in the constructor:

```ts
public readonly model: string;
```

and inside the constructor, after `this.ollama = ...`:

```ts
this.model = defaultModel();
```

Then replace the two `options.model || this.defaultModel` expressions in `chat()` and `stream()` with `options.model || this.model`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w server -- ai-service`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `npm test -w server` then `npm run build -w client`
Expected: server tests PASS; client build green (unrelated, confirms nothing broke).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/ai-service.ts server/src/__tests__/ai-service.test.ts
git commit -m "feat(server): make default model config-driven (gemma4:e4b)"
```

---

## Task 7: esbuild bundle of the server (deterministic build)

This solves the `shared`-compilation caveat by bundling `server` + `shared` into one CJS file with a known path, instead of relying on `tsc`'s nested multi-root emit.

**Files:**
- Create: `electron/server-entry.ts`
- Create: `scripts/build-server.mjs`
- Modify: `package.json` (root) — add esbuild dev dep + `build:server` script

- [ ] **Step 1: Create `electron/server-entry.ts`**

```ts
// Production server entry: started inside an Electron utilityProcess.
// Boots the Express server and reports the bound port to the main process.
import { startServer } from '../server/src/index.js';

const parentPort = (process as unknown as { parentPort?: { postMessage: (m: unknown) => void } }).parentPort;

startServer()
  .then((handle) => {
    if (parentPort) parentPort.postMessage({ type: 'server-ready', port: handle.port });
    else console.log(`[server] ready on ${handle.port}`);
  })
  .catch((err) => {
    if (parentPort) parentPort.postMessage({ type: 'server-error', message: String(err) });
    console.error('[server] failed to start', err);
    process.exit(1);
  });
```

- [ ] **Step 2: Add esbuild + create `scripts/bundle.mjs`**

Run: `npm install esbuild --save-dev` (root).

```js
// Bundles the server entry (+ shared) and, once they exist, the electron
// main/preload into self-contained CJS files under electron/dist.
import { build } from 'esbuild';
import { existsSync } from 'fs';
import path from 'path';

// Resolve TypeScript NodeNext ".js" import specifiers to their ".ts" sources
// (the codebase imports e.g. './app.js' which is actually app.ts).
const tsResolve = {
  name: 'ts-js-resolve',
  setup(b) {
    b.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.importer) return;
      const abs = path.resolve(path.dirname(args.importer), args.path.replace(/\.js$/, '.ts'));
      return existsSync(abs) ? { path: abs } : undefined;
    });
  },
};

const common = {
  bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  plugins: [tsResolve], logLevel: 'info',
};

// Server: fully self-contained (cors/express/ollama/uuid/dotenv are pure JS).
await build({ ...common, entryPoints: ['electron/server-entry.ts'], outfile: 'electron/dist/server.cjs' });

// Electron main/preload: only 'electron' is external (provided by the runtime).
if (existsSync('electron/main.ts')) {
  await build({
    ...common,
    entryPoints: ['electron/main.ts', 'electron/preload.ts'],
    outdir: 'electron/dist',
    outExtension: { '.js': '.cjs' },
    external: ['electron'],
  });
}

console.log('bundled electron/dist');
```

- [ ] **Step 3: Add the bundle script to root `package.json`**

Add to `scripts`: `"bundle": "node scripts/bundle.mjs"`.

- [ ] **Step 4: Build and verify the bundle runs**

Run: `npm run bundle` then `node -e "process.env.PORT='0'; require('./electron/dist/server.cjs');"`
Expected: prints `Xenolinguist API on http://127.0.0.1:<port>` then `[server] ready on <port>`. Press Ctrl+C. (This proves `shared` is bundled correctly via the `.js`→`.ts` resolver and the entry is a single deterministic file.)

- [ ] **Step 5: Ignore build output**

Add to `.gitignore`:

```
electron/dist/
release/
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/bundle.mjs electron/server-entry.ts .gitignore
git commit -m "build: bundle server + shared into electron/dist/server.cjs via esbuild"
```

---

## Task 8: Electron deps, preload, and typecheck config

**Files:**
- Modify: `package.json` (root)
- Create: `electron/preload.ts`
- Create: `electron/tsconfig.json`

- [ ] **Step 1: Install Electron toolchain (root)**

Run: `npm install electron electron-builder --save-dev` and `npm install electron-updater electron-ollama --save`

- [ ] **Step 2: Set the Electron entry + scripts in root `package.json`**

Add the top-level field `"main": "electron/dist/main.cjs"`. Add to `scripts`:

```json
"build:desktop": "npm run build -w client && npm run bundle",
"electron:dev": "concurrently -k -n vite,server,electron -c cyan,green,magenta \"npm run dev -w client\" \"npm run dev -w server\" \"node scripts/wait-and-launch.mjs\"",
"dist": "npm run build:desktop && electron-builder --config electron/builder.config.cjs"
```

(`bundle` was added in Task 7; `wait-and-launch.mjs` is added in Task 10. `concurrently` is already a root dev dependency.)

- [ ] **Step 3: Create `electron/tsconfig.json` (typecheck only)**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"]
  },
  "include": ["**/*.ts", "../server/src/**/*.ts", "../shared/**/*.ts"]
}
```

- [ ] **Step 4: Create `electron/preload.ts`**

```ts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('xeno', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron/tsconfig.json electron/preload.ts
git commit -m "build(electron): add electron toolchain, preload, and typecheck config"
```

---

## Task 9: Electron main process

**Files:**
- Create: `electron/main.ts`

- [ ] **Step 1: Create `electron/main.ts`**

```ts
import { app, BrowserWindow, utilityProcess, type UtilityProcess } from 'electron';
import path from 'path';

const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:5173';

let win: BrowserWindow | null = null;
let serverProc: UtilityProcess | null = null;

/** In production, fork the bundled server and resolve once it reports its port. */
function startServerProcess(): Promise<number> {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, 'server.cjs');
    const clientDist = path.join(process.resourcesPath, 'client', 'dist');
    const dataDir = path.join(app.getPath('userData'), 'data');

    serverProc = utilityProcess.fork(serverPath, [], {
      env: { ...process.env, PORT: '0', DATA_DIR: dataDir, CLIENT_DIST: clientDist, NODE_ENV: 'production' },
      stdio: 'pipe',
    });
    serverProc.stdout?.on('data', (d) => console.log('[server]', d.toString().trim()));
    serverProc.stderr?.on('data', (d) => console.error('[server]', d.toString().trim()));

    serverProc.on('message', (msg: { type?: string; port?: number; message?: string }) => {
      if (msg?.type === 'server-ready' && msg.port) resolve(msg.port);
      else if (msg?.type === 'server-error') reject(new Error(msg.message));
    });
    serverProc.on('exit', (code) => { if (code !== 0) reject(new Error(`server exited ${code}`)); });
  });
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const port = await startServerProcess();
    await win.loadURL(`http://127.0.0.1:${port}`);
  }

  win.on('closed', () => { win = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('quit', () => { serverProc?.kill(); });
}
```

- [ ] **Step 2: Typecheck the electron sources**

Run: `npx tsc -p electron/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat(electron): main process — fork server in prod, load Vite in dev"
```

---

## Task 10: Dev launcher + run the app in dev

**Files:**
- Create: `scripts/wait-and-launch.mjs`

- [ ] **Step 1: Create `scripts/wait-and-launch.mjs`**

```js
// Waits for the Vite dev server, builds the electron main/preload, then launches Electron.
import { setTimeout as sleep } from 'timers/promises';
import { spawn } from 'child_process';

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok || r.status === 200) return; } catch {}
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${url}`);
}

await waitFor('http://localhost:5173');
await new Promise((res, rej) => {
  const p = spawn('npm', ['run', 'bundle'], { stdio: 'inherit', shell: true });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error('bundle failed'))));
});
spawn('npx', ['electron', '.'], { stdio: 'inherit', shell: true });
```

- [ ] **Step 2: Launch the app in dev**

Run: `npm run electron:dev`
Expected: a desktop window opens showing the Xenolinguist hero/app loaded from `http://localhost:5173`; `/api` calls work through the Vite proxy. Close the window; Ctrl+C the terminal.

- [ ] **Step 3: Commit**

```bash
git add scripts/wait-and-launch.mjs
git commit -m "feat(electron): dev launcher (wait for Vite, build main, launch Electron)"
```

---

## Task 11: Ollama lifecycle (detect + first-run pull)

**Files:**
- Create: `electron/ollama.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Create `electron/ollama.ts`**

```ts
import { BrowserWindow } from 'electron';

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';

export async function isOllamaUp(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function hasModel(model = DEFAULT_MODEL): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).some((m) => m.name === model || m.name.startsWith(`${model}`));
  } catch {
    return false;
  }
}

/** Pull the default model, streaming progress to the renderer. Best-effort. */
export async function pullDefaultModel(win: BrowserWindow, model = DEFAULT_MODEL): Promise<void> {
  const res = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split('\n')) {
      if (!line.trim()) continue;
      try {
        const status = JSON.parse(line);
        win.webContents.send('ollama:pull-progress', status);
      } catch { /* ignore partial lines */ }
    }
  }
}
```

Note: this uses Ollama's HTTP API directly (no extra dependency) for detect + pull. `electron-ollama` is the fallback for *installing Ollama itself*; wire it in Step 3 only if you want auto-install rather than guiding the user to `https://ollama.com`.

- [ ] **Step 2: Call it from `electron/main.ts`**

In `createWindow()`, after the window has loaded (prod or dev), add a non-blocking bootstrap:

```ts
import { isOllamaUp, hasModel, pullDefaultModel } from './ollama.js';

// …after win.loadURL(...) in createWindow():
void (async () => {
  if (!win) return;
  if (await isOllamaUp()) {
    if (!(await hasModel())) {
      try { await pullDefaultModel(win); } catch (e) { console.error('[ollama] pull failed', e); }
    }
  } else {
    win.webContents.send('ollama:offline', { url: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434' });
  }
})();
```

- [ ] **Step 3: Typecheck + manual verify**

Run: `npx tsc -p electron/tsconfig.json` (expect no errors), then `npm run electron:dev`.
Expected: with Ollama running and `gemma4:e4b` absent, the model begins downloading (watch the terminal / a renderer console log for `ollama:pull-progress`); with Ollama stopped, the app still opens and the existing "AI offline" UI shows. Close the app.

- [ ] **Step 4: Commit**

```bash
git add electron/ollama.ts electron/main.ts
git commit -m "feat(electron): detect Ollama + pull gemma4:e4b on first run, offline-tolerant"
```

---

## Task 12: Packaging with electron-builder (unsigned installer)

**Files:**
- Create: `electron/builder.config.cjs`

- [ ] **Step 1: Create `electron/builder.config.cjs`**

```js
/** electron-builder configuration. */
module.exports = {
  appId: 'sh.xenolinguist.app',
  productName: 'Xenolinguist',
  directories: { output: 'release' },
  // Bundled main/preload/server live in electron/dist; the SPA ships as a resource.
  files: ['electron/dist/**/*', 'package.json'],
  extraResources: [{ from: 'client/dist', to: 'client/dist' }],
  asar: true,
  // The forked server bundle must be a real file on disk for utilityProcess.fork.
  asarUnpack: ['electron/dist/server.cjs'],
  win: { target: ['nsis'] },
  mac: { target: ['dmg'], category: 'public.app-category.education' },
  linux: { target: ['AppImage', 'deb'], category: 'Education' },
  publish: null, // set in Task 13 for GitHub Releases
};
```

- [ ] **Step 2: Build a packaged app for the current OS**

Run: `npm run dist`
Expected: `release/` contains an installer/bundle for your OS (e.g. `Xenolinguist Setup <ver>.exe`, a `.dmg`, or `.AppImage`). The build is **unsigned** — that is expected at this stage.

- [ ] **Step 3: Run the packaged app from a clean profile**

Install/launch the produced artifact. Expected: the app opens, all six phases load, a profile created in the app appears under the OS user-data dir (`%APPDATA%/Xenolinguist/data/profiles` on Windows, `~/Library/Application Support/Xenolinguist/data` on macOS). Audio record + playback works. Quit; confirm no orphan server process remains.

- [ ] **Step 4: Commit**

```bash
git add electron/builder.config.cjs
git commit -m "build(electron): electron-builder config producing unsigned installers"
```

---

## Task 13: Auto-update + signing prerequisites

**Files:**
- Modify: `electron/builder.config.cjs`
- Modify: `electron/main.ts`
- Create: `docs/desktop-release.md`

- [ ] **Step 1: Point publish at GitHub Releases**

In `electron/builder.config.cjs`, replace `publish: null` with:

```js
publish: { provider: 'github', owner: 'Parusann', repo: 'Xenolinguist' },
```

- [ ] **Step 2: Wire `electron-updater` into `electron/main.ts`**

Add near the top:

```ts
import electronUpdater from 'electron-updater';
```

and after the window loads in production only:

```ts
if (!isDev) {
  electronUpdater.autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error('[update]', e));
}
```

- [ ] **Step 3: Document the signing/release prerequisites in `docs/desktop-release.md`**

```markdown
# Desktop release

## One-time prerequisites (maintainer provides)
- macOS: Apple Developer ID Application cert + notarization creds
  (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).
- Windows: code-signing cert (`CSC_LINK`, `CSC_KEY_PASSWORD`).
- GitHub token with `repo` scope as `GH_TOKEN` for publishing.

## Cut a release
1. Bump `version` in `package.json`.
2. `npm run dist` locally to smoke-test the installer (unsigned is fine for local).
3. With the env vars above set: `npx electron-builder --config electron/builder.config.cjs --publish always`.
4. electron-builder uploads signed artifacts + `latest.yml` to a GitHub Release;
   installed apps auto-update on next launch via `electron-updater`.

Unsigned builds run locally but show OS "unidentified developer" warnings; signing is required before public distribution.
```

- [ ] **Step 4: Typecheck + verify the build still produces an installer**

Run: `npx tsc -p electron/tsconfig.json` then `npm run dist`
Expected: no type errors; `release/` still produced. (Publishing is only triggered with `--publish always` + credentials, so this step does not upload anything.)

- [ ] **Step 5: Commit**

```bash
git add electron/builder.config.cjs electron/main.ts docs/desktop-release.md
git commit -m "feat(electron): auto-update via GitHub Releases + document signing/release"
```

---

## Verification (whole feature)

- [ ] `npm test -w server` — all server unit tests pass (config, storage, app SPA serving, startServer, ai-service).
- [ ] `npm run build -w client` — client build green.
- [ ] `npm run electron:dev` — app launches in a desktop window from the Vite dev server; `/api` works.
- [ ] `npm run dist` — produces an installer in `release/` for the current OS.
- [ ] Installed app: all six phases load; profiles + audio persist under the OS user-data dir across an app restart; Ollama detection works (present → chat; absent → "AI offline"); first run pulls `gemma4:e4b`; quitting leaves no orphan server process.

---

## Notes for the implementer

- **`gemma4:e4b` tag:** confirm the exact Ollama registry tag resolves (`ollama pull gemma4:e4b`); if the registry name differs (e.g. the Gemma 3n `e4b` variant), update the single default in `server/src/config.ts` and `electron/ollama.ts`.
- **Dev direct-run detection** in `server/src/index.ts` is conservative; if the server fails to auto-start under `tsx watch` on some platform, add `XENO_START=1` to the server `dev` script in `server/package.json`.
- **`shared` build:** no separate `shared` compile is needed — esbuild bundles `shared` into `server.cjs` (Task 7). The legacy `npm run build -w server` (tsc) remains usable for typechecking but is not on the desktop build path.
- **esbuild `.js`→`.ts` resolution** is handled by the `ts-js-resolve` plugin in `scripts/bundle.mjs`; without it the codebase's NodeNext `.js` import specifiers would fail to resolve and the bundle would error.
- **If `electron-updater`/`electron-ollama` fail to bundle** (dynamic `require`s): keep them in `dependencies`, add `--external` for them in `scripts/bundle.mjs`, and add `"node_modules/**"` to the electron-builder `files` array so they ship.
- **Deferred from the spec (intentionally out of this plan):** the in-app **model picker** UI — the model is already config/env-driven (`OLLAMA_MODEL`, default `gemma4:e4b`) and `/api/ollama/models` already lists installed models, so a picker is a small follow-up; and **guided/auto Ollama install** — this plan detects Ollama and emits an `ollama:offline` event to the existing offline UI, so wiring `electron-ollama` auto-install or an "install Ollama" prompt is a follow-up.
