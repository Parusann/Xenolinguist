# Xenolinguist Voice — Increment 1 (Local TTS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users *hear* a decoded/constructed language — play any word, sentence, or sandbox conlang line as audio — using a free, fully-local stack: browser `speechSynthesis` as the instant baseline plus a bundled **espeak-ng** sidecar for a deterministic voice, with automatic fallback so playback always works.

**Architecture:** A new `POST /api/tts` route in the existing Express server (which runs inside the Electron-forked process) spawns the bundled espeak-ng to render WAV; the client's `tts.speak()` tries that and falls back to `window.speechSynthesis` on any failure (incl. dev where espeak isn't present). A reusable `SpeakButton` is dropped into Vocabulary, Translation, and Sandbox.

**Tech Stack:** Express 4 (ESM/TS) + `child_process`, espeak-ng (bundled binary), React 19/Vite, vitest + supertest (server), vitest + jsdom + @testing-library (client), electron-builder `extraResources`.

**Spec:** `docs/superpowers/specs/2026-06-06-xenolinguist-voice-tts-design.md`

---

## File Structure

**Created**
- `server/src/services/tts-espeak.ts` — espeak-ng invocation + `TtsUnavailableError`
- `server/src/routes/tts.ts` — `POST /api/tts`
- `server/src/__tests__/tts.test.ts` — server TTS tests
- `client/vitest.config.ts`, `client/src/test-setup.ts` — client test harness
- `client/src/services/tts.ts` — browser + faithful TTS client, with fallback
- `client/src/services/__tests__/tts.test.ts`
- `client/src/components/audio/SpeakButton.tsx` + `…/SpeakButton.test.tsx`
- `vendor/espeak-ng/win/` — vendored Windows espeak-ng (binary + `espeak-ng-data/`)

**Modified**
- `server/src/config.ts` — add `espeakPath()`
- `server/src/app.ts` — mount `/api/tts`
- `client/package.json` — client test deps + `test` script
- `client/src/components/phase3-vocabulary/VocabularyBuilder.tsx` — add `SpeakButton`
- `client/src/components/phase5-translation/TranslationEngine.tsx` — add `SpeakButton`
- `client/src/components/sandbox/SandboxController.tsx` — add `SpeakButton`
- `electron/main.ts` — set `ESPEAK_PATH` when forking the server
- `electron/builder.config.cjs` — bundle espeak-ng via `extraResources`
- `.gitignore` — (none required; vendored espeak files are committed)

---

## Task 1: `config.espeakPath()` (TDD)

**Files:**
- Modify: `server/src/config.ts`
- Modify: `server/src/__tests__/config.test.ts`

- [ ] **Step 1: Add a failing test to `server/src/__tests__/config.test.ts`**

Add this `it` block inside the existing `describe('config', …)` and add `delete process.env.ESPEAK_PATH;` to the existing `afterEach`:

```ts
  it('espeakPath returns ESPEAK_PATH or null', async () => {
    const { espeakPath } = await import('../config.js?tts=1');
    expect(espeakPath()).toBeNull();
    process.env.ESPEAK_PATH = '/x/espeak-ng';
    expect(espeakPath()).toBe('/x/espeak-ng');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- config`
Expected: FAIL — `espeakPath` is not exported.

- [ ] **Step 3: Add to `server/src/config.ts`**

```ts
/** Absolute path to the bundled espeak-ng binary, or null (browser TTS only). */
export function espeakPath(): string | null {
  return process.env.ESPEAK_PATH || null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w server -- config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts server/src/__tests__/config.test.ts
git commit -m "feat(server): add espeakPath() config getter"
```

---

## Task 2: `tts-espeak.ts` synthesis service (TDD)

**Files:**
- Create: `server/src/services/tts-espeak.ts`
- Create: `server/src/__tests__/tts.test.ts`

- [ ] **Step 1: Write the failing test `server/src/__tests__/tts.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest';

afterEach(() => { delete process.env.ESPEAK_PATH; });

describe('tts-espeak.synthesize', () => {
  it('rejects with TtsUnavailableError when espeak is not configured', async () => {
    delete process.env.ESPEAK_PATH;
    const { synthesize, TtsUnavailableError } = await import('../services/tts-espeak.js?t=1');
    await expect(synthesize({ text: 'hello' })).rejects.toBeInstanceOf(TtsUnavailableError);
  });

  // Real synthesis only runs when an espeak-ng binary is wired up (skipped in CI otherwise).
  const hasEspeak = !!process.env.ESPEAK_PATH;
  (hasEspeak ? it : it.skip)('produces non-empty WAV bytes when espeak is available', async () => {
    const { synthesize } = await import('../services/tts-espeak.js?t=2');
    const wav = await synthesize({ text: 'hello' });
    expect(wav.length).toBeGreaterThan(44); // WAV header is 44 bytes
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- tts`
Expected: FAIL — module `../services/tts-espeak.js` not found.

- [ ] **Step 3: Implement `server/src/services/tts-espeak.ts`**

```ts
import { spawn } from 'child_process';
import { espeakPath } from '../config.js';

/** Thrown when espeak-ng is unavailable; the route maps this to HTTP 503. */
export class TtsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TtsUnavailableError';
  }
}

export interface TtsInput {
  text?: string;
  phonemes?: string;
  voice?: string;
}

/** Render speech to WAV bytes via the bundled espeak-ng. */
export function synthesize(input: TtsInput): Promise<Buffer> {
  const bin = espeakPath();
  if (!bin) {
    return Promise.reject(new TtsUnavailableError('espeak-ng not configured'));
  }

  // espeak reads inline [[...]] Kirshenbaum phonemes; phoneme-exact IPA is a future enhancement.
  const spoken = input.text ?? (input.phonemes ? `[[${input.phonemes}]]` : '');
  const voice = input.voice ?? 'en';
  const args = ['-v', voice, '--stdout', spoken];

  return new Promise<Buffer>((resolve, reject) => {
    const proc = spawn(bin, args);
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => chunks.push(Buffer.from(d)));
    proc.on('error', (err: NodeJS.ErrnoException) => {
      reject(new TtsUnavailableError(`espeak-ng spawn error: ${err.code ?? err.message}`));
    });
    proc.on('close', (code) => {
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks));
      else reject(new TtsUnavailableError(`espeak-ng exited with code ${code}`));
    });
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w server -- tts`
Expected: PASS (1 passed, 1 skipped).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/tts-espeak.ts server/src/__tests__/tts.test.ts
git commit -m "feat(server): espeak-ng synthesis service with TtsUnavailableError"
```

---

## Task 3: `POST /api/tts` route (TDD)

**Files:**
- Create: `server/src/routes/tts.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/__tests__/tts.test.ts`

- [ ] **Step 1: Add failing route tests to `server/src/__tests__/tts.test.ts`**

Add at the top with the other imports:

```ts
import request from 'supertest';
```

Add this `describe` block to the file:

```ts
describe('POST /api/tts', () => {
  it('returns 400 when neither text nor phonemes is given', async () => {
    const { createApp } = await import('../app.js?tts=1');
    const res = await request(createApp()).post('/api/tts').send({});
    expect(res.status).toBe(400);
  });

  it('returns 503 when espeak is unavailable', async () => {
    delete process.env.ESPEAK_PATH;
    const { createApp } = await import('../app.js?tts=2');
    const res = await request(createApp()).post('/api/tts').send({ text: 'hello' });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('tts-unavailable');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- tts`
Expected: FAIL — `/api/tts` returns 404 (route not mounted).

- [ ] **Step 3: Create `server/src/routes/tts.ts`**

```ts
import { Router } from 'express';
import { synthesize, TtsUnavailableError } from '../services/tts-espeak.js';

export const ttsRouter = Router();

ttsRouter.post('/', async (req, res) => {
  const { text, phonemes, voice } = req.body ?? {};
  if (!text && !phonemes) {
    return res.status(400).json({ error: 'text or phonemes required' });
  }
  try {
    const wav = await synthesize({ text, phonemes, voice });
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', wav.length);
    return res.send(wav);
  } catch (err) {
    if (err instanceof TtsUnavailableError) {
      return res.status(503).json({ error: 'tts-unavailable' });
    }
    return res.status(500).json({ error: 'tts-failed' });
  }
});
```

- [ ] **Step 4: Mount it in `server/src/app.ts`**

Add the import with the other route imports:

```ts
import { ttsRouter } from './routes/tts.js';
```

Add this line with the other `app.use('/api/...')` mounts, **before** the `app.use('/api', …)` 404 catch-all:

```ts
  app.use('/api/tts', ttsRouter);
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w server -- tts`
Expected: PASS (400 + 503 cases).

- [ ] **Step 6: Run the full server suite**

Run: `npm test -w server`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/tts.ts server/src/app.ts server/src/__tests__/tts.test.ts
git commit -m "feat(server): POST /api/tts (400/503/wav)"
```

---

## Task 4: Client test harness (vitest + jsdom)

**Files:**
- Modify: `client/package.json`
- Create: `client/vitest.config.ts`
- Create: `client/src/test-setup.ts`
- Create: `client/src/__tests__/smoke.test.ts`

- [ ] **Step 1: Add client test deps + script**

Run: `npm install -w client --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`
Then add to `client/package.json` `scripts`: `"test": "vitest run"`.

- [ ] **Step 2: Create `client/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      shared: path.resolve(__dirname, '../shared'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 3: Create `client/src/test-setup.ts`**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Create `client/src/__tests__/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('client test harness', () => {
  it('runs in jsdom', () => {
    expect(typeof window).toBe('object');
    expect(document.createElement('div')).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run to verify the harness works**

Run: `npm test -w client`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add client/package.json client/package-lock.json package-lock.json client/vitest.config.ts client/src/test-setup.ts client/src/__tests__/smoke.test.ts
git commit -m "test(client): add vitest + jsdom + testing-library harness"
```

---

## Task 5: Client `tts.ts` with browser fallback (TDD)

**Files:**
- Create: `client/src/services/tts.ts`
- Create: `client/src/services/__tests__/tts.test.ts`

- [ ] **Step 1: Write the failing test `client/src/services/__tests__/tts.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  const speakSpy = vi.fn();
  vi.stubGlobal('speechSynthesis', { speak: speakSpy, cancel: vi.fn() });
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; rate = 1; constructor(t: string) { this.text = t; } });
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('tts.speak', () => {
  it('falls back to browser speechSynthesis when /api/tts returns 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 } as Response)));
    const mod = await import('../tts.ts?case=1');
    await mod.speak('kwet');
    expect((window.speechSynthesis.speak as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w client -- tts`
Expected: FAIL — module `../tts.ts` not found.

- [ ] **Step 3: Create `client/src/services/tts.ts`**

```ts
const BASE = '/api';

let currentAudio: HTMLAudioElement | null = null;

/** Stop any in-progress speech or audio playback. */
export function cancel(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/** Speak via the browser's built-in voice (always-available fallback). */
export function speakBrowser(text: string, opts?: { rate?: number }): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (opts?.rate) u.rate = opts.rate;
  window.speechSynthesis.speak(u);
}

/** Speak via the bundled espeak-ng voice; fall back to the browser voice on any failure. */
export async function speak(
  text: string,
  opts?: { phonemes?: string; voice?: string; rate?: number },
): Promise<void> {
  cancel();
  try {
    const res = await fetch(`${BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, phonemes: opts?.phonemes, voice: opts?.voice }),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };
    await audio.play();
  } catch {
    speakBrowser(text, { rate: opts?.rate });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w client -- tts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/services/tts.ts client/src/services/__tests__/tts.test.ts
git commit -m "feat(client): tts service (espeak via /api/tts, browser fallback)"
```

---

## Task 6: `SpeakButton` component (TDD)

**Files:**
- Create: `client/src/components/audio/SpeakButton.tsx`
- Create: `client/src/components/audio/SpeakButton.test.tsx`

- [ ] **Step 1: Write the failing test `client/src/components/audio/SpeakButton.test.tsx`**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/services/tts', () => ({ speak: vi.fn().mockResolvedValue(undefined) }));
import { speak } from '@/services/tts';
import { SpeakButton } from './SpeakButton';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('SpeakButton', () => {
  it('calls speak with the text (and phonemes) on click', async () => {
    render(<SpeakButton text="kwet" phonemes="kw E t" />);
    await userEvent.click(screen.getByRole('button'));
    expect(speak).toHaveBeenCalledWith('kwet', { phonemes: 'kw E t' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w client -- SpeakButton`
Expected: FAIL — `./SpeakButton` not found.

- [ ] **Step 3: Create `client/src/components/audio/SpeakButton.tsx`**

```tsx
import { useState } from 'react';
import { speak } from '@/services/tts';

interface SpeakButtonProps {
  text: string;
  phonemes?: string;
  title?: string;
  className?: string;
}

export function SpeakButton({ text, phonemes, title = 'Hear it', className = '' }: SpeakButtonProps) {
  const [playing, setPlaying] = useState(false);

  const handleClick = async () => {
    setPlaying(true);
    try {
      await speak(text, { phonemes });
    } finally {
      setPlaying(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-label={title}
      disabled={!text}
      className={`tts-btn ${className}`}
    >
      {playing ? '◼' : '🔊'}
    </button>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w client -- SpeakButton`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/audio/SpeakButton.tsx client/src/components/audio/SpeakButton.test.tsx
git commit -m "feat(client): SpeakButton component"
```

---

## Task 7: Integrate `SpeakButton` into the phases

**Files:**
- Modify: `client/src/components/phase3-vocabulary/VocabularyBuilder.tsx`
- Modify: `client/src/components/phase5-translation/TranslationEngine.tsx`
- Modify: `client/src/components/sandbox/SandboxController.tsx`

No new tests (these are JSX wiring); verification is the typecheck/build.

- [ ] **Step 1: Vocabulary — hear the alien word**

Open `client/src/components/phase3-vocabulary/VocabularyBuilder.tsx`. Add the import:
```tsx
import { SpeakButton } from '@/components/audio/SpeakButton';
```
Find where each dictionary entry renders its alien word (the `alien_word` field). Render a `SpeakButton` next to it:
```tsx
<SpeakButton text={entry.alien_word} />
```
(Use the actual entry variable name in that file; the prop is the entry's `alien_word` string.)

- [ ] **Step 2: Translation — hear a token/sentence**

Open `client/src/components/phase5-translation/TranslationEngine.tsx`. Add the import:
```tsx
import { SpeakButton } from '@/components/audio/SpeakButton';
```
Find where the source/alien sentence (or per-token alien text) is rendered and add a `SpeakButton` whose `text` is the alien sentence string (or token):
```tsx
<SpeakButton text={alienText} title="Hear sentence" />
```
(Use the actual variable holding the alien input text in that component.)

- [ ] **Step 3: Sandbox — hear conlang words/sentences (with phonemes)**

Open `client/src/components/sandbox/SandboxController.tsx`. Add the import:
```tsx
import { SpeakButton } from '@/components/audio/SpeakButton';
```
Where a conlang word renders (the `word`/`v.alien` strings) add `<SpeakButton text={word} />`. Where a sample sentence renders (`s.alien`) add `<SpeakButton text={s.alien} phonemes={conlang.phoneme_set?.join(' ')} title="Hear sentence" />`. (Pass `phonemes` only where `conlang.phoneme_set` is in scope; for plain words `<SpeakButton text={word} />` is fine.)

- [ ] **Step 4: Verify the client builds**

Run: `npm run build -w client`
Expected: green build (the harmless WaveformCanvas dynamic-import warning is OK). Then `npm test -w client` — all client tests still pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/phase3-vocabulary/VocabularyBuilder.tsx client/src/components/phase5-translation/TranslationEngine.tsx client/src/components/sandbox/SandboxController.tsx
git commit -m "feat(client): add SpeakButton to vocabulary, translation, sandbox"
```

---

## Task 8: Vendor espeak-ng for Windows

**Files:**
- Create: `vendor/espeak-ng/win/` (espeak-ng.exe + `espeak-ng-data/`)

espeak-ng has no official portable zip, so extract the MSI without installing (`msiexec /a` makes an administrative file image — no admin/elevation needed).

- [ ] **Step 1: Download the espeak-ng Windows MSI**

Run (PowerShell):
```powershell
$dl = "$env:TEMP\espeak-dl"; New-Item -ItemType Directory -Force $dl | Out-Null
Invoke-WebRequest "https://github.com/espeak-ng/espeak-ng/releases/download/1.51/espeak-ng-X64.msi" -OutFile "$dl\espeak-ng.msi"
(Get-Item "$dl\espeak-ng.msi").Length
```
Expected: a multi-MB size printed. (If the 1.51 asset name differs, grab the latest release's `*X64.msi` from https://github.com/espeak-ng/espeak-ng/releases.)

- [ ] **Step 2: Extract it (no install) with `msiexec /a`**

Run (PowerShell):
```powershell
$dl = "$env:TEMP\espeak-dl"
Start-Process msiexec -Wait -ArgumentList "/a","$dl\espeak-ng.msi","/qn","TARGETDIR=$dl\extracted"
Get-ChildItem "$dl\extracted\eSpeak NG" | Select-Object Name
```
Expected: `espeak-ng.exe` and `espeak-ng-data` listed under `$env:TEMP\espeak-dl\extracted\eSpeak NG`. (`msiexec /a` makes an administrative *file image* — no elevation needed. If blocked, install the MSI on any Windows box and copy `C:\Program Files\eSpeak NG\` instead — you only need `espeak-ng.exe` + `espeak-ng-data/`.)

- [ ] **Step 3: Place the files under `vendor/espeak-ng/win/`**

Run (PowerShell, from the repo root):
```powershell
$src = "$env:TEMP\espeak-dl\extracted\eSpeak NG"
New-Item -ItemType Directory -Force "vendor\espeak-ng\win" | Out-Null
Copy-Item "$src\espeak-ng.exe" "vendor\espeak-ng\win\" -Force
Copy-Item "$src\espeak-ng-data" "vendor\espeak-ng\win\" -Recurse -Force
Get-ChildItem "vendor\espeak-ng\win"
```
Expected: `espeak-ng.exe` and `espeak-ng-data/` present under `vendor/espeak-ng/win/`.

- [ ] **Step 4: Verify it synthesizes a WAV**

Run (bash, from repo root):
```bash
./vendor/espeak-ng/win/espeak-ng.exe --stdout "hello" > /tmp/espeak-test.wav
ls -l /tmp/espeak-test.wav   # expect > 44 bytes
node -e "const b=require('fs').readFileSync('/tmp/espeak-test.wav'); console.log('WAV', b.length, b.slice(0,4).toString())"
```
Expected: prints `WAV <n>` with `n > 44` and the first 4 bytes `RIFF`.

- [ ] **Step 5: Verify the service works end-to-end against the real binary**

Run (bash, from repo root):
```bash
ESPEAK_PATH="$(pwd)/vendor/espeak-ng/win/espeak-ng.exe" npm test -w server -- tts
```
Expected: the previously-skipped "produces non-empty WAV bytes" test now runs and PASSES.

- [ ] **Step 6: Commit the vendored binary**

```bash
git add vendor/espeak-ng/win
git commit -m "build(voice): vendor espeak-ng (Windows) for bundled TTS"
```

---

## Task 9: Electron wiring + packaging

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/builder.config.cjs`

- [ ] **Step 1: Set `ESPEAK_PATH` when forking the server in `electron/main.ts`**

Add the import near the top:
```ts
import { existsSync } from 'fs';
```
Inside `startServerProcess()`, before the `utilityProcess.fork(...)` call, compute the espeak path and add it to the env only if present:
```ts
    const espeakBin = process.platform === 'win32'
      ? path.join(process.resourcesPath, 'espeak-ng', 'espeak-ng.exe')
      : path.join(process.resourcesPath, 'espeak-ng', 'espeak-ng');
    const espeakEnv = existsSync(espeakBin) ? { ESPEAK_PATH: espeakBin } : {};
```
Then merge `...espeakEnv` into the `env` object passed to `utilityProcess.fork` (alongside the existing `PORT`, `DATA_DIR`, `CLIENT_DIST`, `NODE_ENV`):
```ts
      env: { ...process.env, PORT: '0', DATA_DIR: dataDir, CLIENT_DIST: clientDist, NODE_ENV: 'production', ...espeakEnv },
```

- [ ] **Step 2: Bundle espeak-ng via `electron/builder.config.cjs`**

Add to the `extraResources` array (next to the existing `client/dist` entry):
```js
    { from: 'vendor/espeak-ng/win', to: 'espeak-ng' },
```
(When mac/linux espeak is vendored later, add platform-specific `extraResources` then.)

- [ ] **Step 3: Typecheck electron + verify the bundle**

Run: `npx tsc -p electron/tsconfig.json` (expect no errors), then `npm run bundle` (expect `bundled electron/dist`).

- [ ] **Step 4: Build the app and confirm espeak is bundled**

Run (bash, from repo root, with the winCodeSign cache workaround from `docs/desktop-release.md` already applied):
```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist 2>&1 | tail -5
ls release/win-unpacked/resources/espeak-ng/espeak-ng.exe && echo ESPEAK_BUNDLED_OK
```
Expected: `ESPEAK_BUNDLED_OK`. (If you only need a quick check without a full installer, `npx electron-builder --dir --config electron/builder.config.cjs` builds just `win-unpacked`.)

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/builder.config.cjs
git commit -m "feat(electron): bundle espeak-ng + wire ESPEAK_PATH for faithful TTS"
```

---

## Verification (whole increment)

- [ ] `npm test -w server` — green (config, tts 400/503, plus the gated WAV test when `ESPEAK_PATH` is set).
- [ ] `npm test -w client` — green (harness smoke, tts fallback, SpeakButton).
- [ ] `npm run build -w client` — green.
- [ ] `vendor/espeak-ng/win/espeak-ng.exe --stdout "x"` produces a `RIFF` WAV.
- [ ] Packaged app: `release/win-unpacked/resources/espeak-ng/espeak-ng.exe` present.
- [ ] Manual: launch the app, click a `SpeakButton` on a dictionary word → hear audio (espeak when bundled; browser voice otherwise).

---

## Notes for the implementer

- **espeak data files:** `espeak-ng-data/` MUST sit next to `espeak-ng.exe` (espeak finds its data relative to the binary). Vendor the whole directory, not just the exe.
- **Dev faithful TTS (optional):** set `ESPEAK_PATH=$(pwd)/vendor/espeak-ng/win/espeak-ng.exe` before `npm run dev -w server` to test the espeak path in dev; otherwise dev uses the browser fallback (expected).
- **Cross-platform:** only Windows espeak is vendored here; on mac/linux `ESPEAK_PATH` stays unset → browser TTS fallback. Add platform vendoring + `extraResources` when building for those OSes.
- **MSI extraction fallback:** if `msiexec /a` is unavailable, install espeak-ng via its MSI on any Windows box and copy `C:\Program Files\eSpeak NG\{espeak-ng.exe,espeak-ng-data}` into `vendor/espeak-ng/win/`. The feature still ships (browser TTS) even if vendoring slips.
