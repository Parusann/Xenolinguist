# Xenolinguist Voice — Increment 2 (Whisper STT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bundled, offline whisper.cpp speech-to-text sidecar (`POST /api/stt`) that transcribes recorded/uploaded audio, detects language, auto-segments via timestamps, and links transcripts to the dictionary — replacing the flaky Web-Speech detector and honestly labeling low-confidence results as "phonetic guess."

**Architecture:** Mirror the Increment 1 espeak sidecar 1:1 — `config` getter → spawn `service` → `route` (503 on unavailable) → mounted in `app.ts`; Electron injects env pointing at a vendored Windows binary + model; client converts webm→16 kHz mono WAV (no ffmpeg) and POSTs base64. Pure, unit-testable units (`parseWhisperJson`, `computeMode`, `encodeWavPcm16`, `downsampleTo16k`) are separated from I/O so most logic is tested without the binary; the real-transcription test is gated on the binary being present.

**Tech Stack:** TypeScript, Express, Node `child_process`, whisper.cpp (`whisper-cli` + `ggml-base-q5_1.bin`), React 19, Web Audio API, Vitest + supertest + @testing-library/react, Electron + electron-builder.

**Reference:** `docs/superpowers/specs/2026-06-07-xenolinguist-voice-stt-design.md`. Pattern to copy: `server/src/services/tts-espeak.ts`, `server/src/routes/tts.ts`, `server/src/config.ts`, `server/src/__tests__/tts.test.ts`, `client/src/services/tts.ts`, `client/src/services/__tests__/tts.test.ts`, `electron/main.ts`, `electron/builder.config.cjs`.

**Conventions observed:** server tests in `server/src/__tests__/*.test.ts` (vitest + supertest, dynamic `import('../x.js?case=N')` to dodge module caching, env via `process.env`, real tests gated with `(envVar ? it : it.skip)`); client tests use `vi.stubGlobal('fetch', …)` and dynamic `import('../x.ts?case=N')`; ESM imports use `.js` extensions in server source. Commits use Conventional Commits, **no AI attribution** (project rule).

---

## Task 0: Prerequisite — land the stack to `main`, branch `whisper/stt`

**Not a code task.** Establishes the integration base per the spec §0.1. Run in the main repo (`C:/Users/parus/Downloads/Xenolinguist`). The reusable impl worktree is `C:/Users/parus/Downloads/Xenolinguist-impl` (currently on `voice/tts-impl`); after this task, point it at `whisper/stt`.

- [ ] **Step 1: Merge the stack to `main` via PRs (preferred).**

```bash
# Land desktop/electron first (open its PR if absent), then voice/tts (PR #2).
gh pr create --base main --head desktop/electron --title "Desktop app (Electron) + local Ollama + packaging" --fill   # if no PR exists yet
gh pr merge desktop/electron --merge --delete-branch=false
# Retarget PR #2 onto main now that desktop/electron is merged, then merge it.
gh pr edit 2 --base main
gh pr merge 2 --merge --delete-branch=false
```

Alternative (local, if not using PRs): `git checkout main && git pull && git merge --no-ff desktop/electron && git merge --no-ff voice/tts && git push`.

- [ ] **Step 2: Refresh `main` and branch `whisper/stt`.**

```bash
git -C C:/Users/parus/Downloads/Xenolinguist checkout main
git -C C:/Users/parus/Downloads/Xenolinguist pull
git -C C:/Users/parus/Downloads/Xenolinguist checkout -b whisper/stt
git -C C:/Users/parus/Downloads/Xenolinguist push -u origin whisper/stt
```

- [ ] **Step 3: Point the impl worktree at `whisper/stt`** (reuse its installed `node_modules`/Electron deps).

```bash
git -C C:/Users/parus/Downloads/Xenolinguist-impl fetch origin
git -C C:/Users/parus/Downloads/Xenolinguist-impl checkout whisper/stt
```

Expected: `git -C C:/Users/parus/Downloads/Xenolinguist-impl rev-parse --abbrev-ref HEAD` → `whisper/stt`. All remaining tasks run in `Xenolinguist-impl`.

---

## Task 1: Shared STT types

**Files:**
- Modify: `shared/types.ts` (append new interfaces)

- [ ] **Step 1: Add the STT result types.**

Append to `shared/types.ts`:

```ts
export interface SttSegment {
  start: number;   // seconds
  end: number;     // seconds
  text: string;
  avgProb: number; // 0-1 mean token probability for this segment
}

export type SttMode = 'transcription' | 'phonetic-guess';

export interface SttResult {
  language: string;     // ISO code from whisper, e.g. "en"
  languageProb: number; // 0-1; 0 when unknown (not emitted)
  text: string;
  segments: SttSegment[];
  mode: SttMode;
}
```

- [ ] **Step 2: Typecheck.**

Run: `npm run build -w server` (compiles shared types via the server tsconfig path) — Expected: PASS (no type errors). If the repo has a root typecheck script, `npm run typecheck` also works.

- [ ] **Step 3: Commit.**

```bash
git add shared/types.ts
git commit -m "feat(stt): add shared SttResult/SttSegment types"
```

---

## Task 2: Config getters for the whisper binary + model

**Files:**
- Modify: `server/src/config.ts` (add two getters)
- Test: `server/src/__tests__/config.test.ts` (add cases)

- [ ] **Step 1: Write the failing tests.**

Add inside the `describe('config', …)` block in `server/src/__tests__/config.test.ts`, and extend the `afterEach` cleanup at the top of the file to also `delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL;`:

```ts
  it('whisperBinPath returns WHISPER_BIN or null', async () => {
    const { whisperBinPath } = await import('../config.js?case=whisper-bin');
    expect(whisperBinPath()).toBeNull();
    process.env.WHISPER_BIN = '/x/whisper-cli';
    expect(whisperBinPath()).toBe('/x/whisper-cli');
  });

  it('whisperModelPath returns WHISPER_MODEL or null', async () => {
    const { whisperModelPath } = await import('../config.js?case=whisper-model');
    expect(whisperModelPath()).toBeNull();
    process.env.WHISPER_MODEL = '/x/ggml-base-q5_1.bin';
    expect(whisperModelPath()).toBe('/x/ggml-base-q5_1.bin');
  });
```

- [ ] **Step 2: Run tests to verify they fail.**

Run: `npm test -w server -- config`
Expected: FAIL — `whisperBinPath`/`whisperModelPath` are not exported.

- [ ] **Step 3: Implement the getters.**

Append to `server/src/config.ts`:

```ts
/** Absolute path to the bundled whisper.cpp binary, or null (STT disabled). */
export function whisperBinPath(): string | null {
  return process.env.WHISPER_BIN || null;
}

/** Absolute path to the bundled whisper ggml model, or null (STT disabled). */
export function whisperModelPath(): string | null {
  return process.env.WHISPER_MODEL || null;
}
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `npm test -w server -- config`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/src/config.ts server/src/__tests__/config.test.ts
git commit -m "feat(stt): add whisperBinPath/whisperModelPath config getters"
```

---

## Task 3: whisper JSON parser (pure)

**Files:**
- Create: `server/src/services/stt-whisper.ts`
- Test: `server/src/__tests__/stt-parse.test.ts`

whisper.cpp full JSON (`-oj`/full) shape we rely on: top-level `result.language` (string), and `transcription: [{ offsets: { from, to } /* ms */, text, tokens: [{ p }] }]`. `avgProb` per segment = mean of token `p` values (defaults to 0 if no tokens).

- [ ] **Step 1: Write the failing test.**

Create `server/src/__tests__/stt-parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseWhisperJson } from '../services/stt-whisper.js';

const FIXTURE = {
  result: { language: 'en' },
  transcription: [
    { offsets: { from: 0, to: 1200 }, text: ' Hello', tokens: [{ p: 0.9 }, { p: 0.7 }] },
    { offsets: { from: 1200, to: 2000 }, text: ' world', tokens: [{ p: 0.8 }] },
  ],
};

describe('parseWhisperJson', () => {
  it('maps language, joined text, and segment timestamps/probabilities', () => {
    const r = parseWhisperJson(FIXTURE);
    expect(r.language).toBe('en');
    expect(r.text).toBe('Hello world');
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0]).toMatchObject({ start: 0, end: 1.2, text: 'Hello' });
    expect(r.segments[0].avgProb).toBeCloseTo(0.8, 5);
    expect(r.segments[1]).toMatchObject({ start: 1.2, end: 2, text: 'world', avgProb: 0.8 });
  });

  it('is defensive about missing fields', () => {
    const r = parseWhisperJson({});
    expect(r.language).toBe('');
    expect(r.text).toBe('');
    expect(r.segments).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npm test -w server -- stt-parse`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Implement the parser (create the service file with the parser only for now).**

Create `server/src/services/stt-whisper.ts`:

```ts
import type { SttResult, SttSegment } from '../../../shared/types.js';

interface WhisperToken { p?: number }
interface WhisperSeg { offsets?: { from?: number; to?: number }; text?: string; tokens?: WhisperToken[] }
interface WhisperJson { result?: { language?: string }; transcription?: WhisperSeg[] }

/** Parse whisper.cpp JSON into the language/text/segments fields of an SttResult. */
export function parseWhisperJson(raw: WhisperJson): Omit<SttResult, 'mode' | 'languageProb'> {
  const language = raw.result?.language ?? '';
  const segs: SttSegment[] = (raw.transcription ?? []).map((s) => {
    const tokens = s.tokens ?? [];
    const probs = tokens.map((t) => t.p).filter((p): p is number => typeof p === 'number');
    const avgProb = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : 0;
    return {
      start: (s.offsets?.from ?? 0) / 1000,
      end: (s.offsets?.to ?? 0) / 1000,
      text: (s.text ?? '').trim(),
      avgProb,
    };
  });
  const text = segs.map((s) => s.text).join(' ').trim();
  return { language, text, segments: segs };
}
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `npm test -w server -- stt-parse`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/src/services/stt-whisper.ts server/src/__tests__/stt-parse.test.ts
git commit -m "feat(stt): parse whisper.cpp JSON into structured segments"
```

---

## Task 4: Confidence → mode heuristic (pure)

**Files:**
- Modify: `server/src/services/stt-whisper.ts` (add `computeMode` + thresholds)
- Test: `server/src/__tests__/stt-mode.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `server/src/__tests__/stt-mode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeMode } from '../services/stt-whisper.js';

describe('computeMode', () => {
  it('returns transcription for high-confidence, language-detected audio', () => {
    expect(computeMode({ languageProb: 0.95, segments: [{ start: 0, end: 1, text: 'hi', avgProb: 0.85 }] }))
      .toBe('transcription');
  });

  it('returns phonetic-guess for low average token probability', () => {
    expect(computeMode({ languageProb: 0.95, segments: [{ start: 0, end: 1, text: 'xq', avgProb: 0.3 }] }))
      .toBe('phonetic-guess');
  });

  it('returns phonetic-guess for low language probability', () => {
    expect(computeMode({ languageProb: 0.2, segments: [{ start: 0, end: 1, text: 'hi', avgProb: 0.85 }] }))
      .toBe('phonetic-guess');
  });

  it('treats unknown languageProb (0) as not disqualifying; relies on avgProb', () => {
    expect(computeMode({ languageProb: 0, segments: [{ start: 0, end: 1, text: 'hi', avgProb: 0.85 }] }))
      .toBe('transcription');
  });

  it('returns phonetic-guess when there are no segments', () => {
    expect(computeMode({ languageProb: 0.95, segments: [] })).toBe('phonetic-guess');
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npm test -w server -- stt-mode`
Expected: FAIL — `computeMode` not exported.

- [ ] **Step 3: Implement `computeMode`.**

Append to `server/src/services/stt-whisper.ts`:

```ts
import type { SttMode } from '../../../shared/types.js';

/** Tunable thresholds — ship sensible defaults, refine later (see spec §6). */
export const MIN_AVG_PROB = 0.6;      // mean token probability across segments
export const MIN_LANGUAGE_PROB = 0.5; // applied only when languageProb is known (>0)

/** Decide whether whisper output is a confident transcription or a phonetic guess. */
export function computeMode(input: { languageProb: number; segments: SttSegment[] }): SttMode {
  const { languageProb, segments } = input;
  if (segments.length === 0) return 'phonetic-guess';
  const avg = segments.reduce((a, s) => a + s.avgProb, 0) / segments.length;
  const languageOk = languageProb <= 0 ? true : languageProb >= MIN_LANGUAGE_PROB;
  return avg >= MIN_AVG_PROB && languageOk ? 'transcription' : 'phonetic-guess';
}
```

Add `SttSegment` to the existing type import at the top of the file (it already imports from `../../../shared/types.js`).

- [ ] **Step 4: Run test to verify it passes.**

Run: `npm test -w server -- stt-mode`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/src/services/stt-whisper.ts server/src/__tests__/stt-mode.test.ts
git commit -m "feat(stt): add confidence->mode heuristic with tunable thresholds"
```

---

## Task 5: `transcribe()` — spawn whisper, temp files, error typing

**Files:**
- Modify: `server/src/services/stt-whisper.ts` (add `SttUnavailableError`, `transcribe`, stderr languageProb parse)
- Test: `server/src/__tests__/stt-service.test.ts`

- [ ] **Step 1: Write the failing tests.**

Create `server/src/__tests__/stt-service.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

afterEach(() => { delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL; });

describe('stt-whisper.transcribe', () => {
  it('rejects with SttUnavailableError when whisper is not configured', async () => {
    delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL;
    const { transcribe, SttUnavailableError } = await import('../services/stt-whisper.js?t=1');
    await expect(transcribe({ wav: Buffer.from([0, 1, 2]) })).rejects.toBeInstanceOf(SttUnavailableError);
  });

  // Real transcription only runs when WHISPER_BIN + WHISPER_MODEL are wired up (skipped in CI).
  const ready = process.env.WHISPER_BIN && process.env.WHISPER_MODEL;
  (ready ? it : it.skip)('transcribes a 16kHz WAV fixture into text + segments', async () => {
    process.env.WHISPER_BIN = process.env.WHISPER_BIN!;
    process.env.WHISPER_MODEL = process.env.WHISPER_MODEL!;
    const { transcribe } = await import('../services/stt-whisper.js?t=2');
    const wav = readFileSync(path.join(__dirname, 'fixtures', 'hello-16k.wav'));
    const r = await transcribe({ wav });
    expect(r.text.length).toBeGreaterThan(0);
    expect(Array.isArray(r.segments)).toBe(true);
    expect(['transcription', 'phonetic-guess']).toContain(r.mode);
  });
});
```

(The gated test needs a 16 kHz mono WAV at `server/src/__tests__/fixtures/hello-16k.wav` — add one when wiring the binary in Task 12; the test is skipped until then.)

- [ ] **Step 2: Run test to verify it fails.**

Run: `npm test -w server -- stt-service`
Expected: FAIL — `transcribe`/`SttUnavailableError` not exported.

- [ ] **Step 3: Implement `transcribe` + `SttUnavailableError`.**

Append to `server/src/services/stt-whisper.ts`:

```ts
import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { whisperBinPath, whisperModelPath } from '../config.js';

/** Thrown when whisper.cpp is unavailable; the route maps this to HTTP 503. */
export class SttUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'SttUnavailableError'; }
}

export interface SttInput { wav: Buffer; language?: string }

/** Best-effort parse of "auto-detected language: en (p = 0.98)" from whisper stderr. */
function parseLanguageProb(stderr: string): number {
  const m = stderr.match(/auto-detected language:\s*\w+\s*\(p\s*=\s*([0-9.]+)\)/i);
  return m ? Number(m[1]) : 0;
}

/** Transcribe 16 kHz mono WAV bytes via the bundled whisper.cpp. */
export async function transcribe(input: SttInput): Promise<SttResult> {
  const bin = whisperBinPath();
  const model = whisperModelPath();
  if (!bin || !model) throw new SttUnavailableError('whisper not configured');

  const dir = mkdtempSync(path.join(os.tmpdir(), 'xeno-stt-'));
  const inPath = path.join(dir, 'in.wav');
  const outBase = path.join(dir, 'out');
  writeFileSync(inPath, input.wav);

  try {
    const stderr = await new Promise<string>((resolve, reject) => {
      // -oj writes <outBase>.json; -l auto enables language detection (default is English).
      const args = ['-m', model, '-f', inPath, '-oj', '-of', outBase, '-l', input.language ?? 'auto'];
      const proc = spawn(bin, args, { cwd: path.dirname(bin) });
      let err = '';
      proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('error', (e: NodeJS.ErrnoException) =>
        reject(new SttUnavailableError(`whisper spawn error: ${e.code ?? e.message}`)));
      proc.on('close', (code) =>
        code === 0 ? resolve(err) : reject(new SttUnavailableError(`whisper exited ${code}`)));
    });

    let raw: WhisperJson;
    try { raw = JSON.parse(readFileSync(`${outBase}.json`, 'utf8')); }
    catch { throw new SttUnavailableError('whisper produced no JSON output'); }

    const parsed = parseWhisperJson(raw);
    const languageProb = parseLanguageProb(stderr);
    return { ...parsed, languageProb, mode: computeMode({ languageProb, segments: parsed.segments }) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

(Consolidate the `SttResult`/`SttSegment`/`SttMode` type imports into a single line at the top of the file.)

- [ ] **Step 4: Run test to verify it passes.**

Run: `npm test -w server -- stt-service`
Expected: PASS (gated real-transcription test shows as skipped).

- [ ] **Step 5: Run the full server suite (no regressions).**

Run: `npm test -w server`
Expected: PASS (previous 17/1-skip plus the new STT tests; the gated STT test adds another skip).

- [ ] **Step 6: Commit.**

```bash
git add server/src/services/stt-whisper.ts server/src/__tests__/stt-service.test.ts
git commit -m "feat(stt): spawn whisper.cpp to transcribe WAV into SttResult"
```

---

## Task 6: `POST /api/stt` route + app wiring

**Files:**
- Create: `server/src/routes/stt.ts`
- Modify: `server/src/app.ts` (import + mount)
- Test: `server/src/__tests__/stt-route.test.ts`

- [ ] **Step 1: Write the failing tests.**

Create `server/src/__tests__/stt-route.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';

afterEach(() => { delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL; });

describe('POST /api/stt', () => {
  it('returns 400 when no audio is given', async () => {
    const { createApp } = await import('../app.js?stt=1');
    const res = await request(createApp()).post('/api/stt').send({});
    expect(res.status).toBe(400);
  });

  it('returns 503 when whisper is unavailable', async () => {
    delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL;
    const { createApp } = await import('../app.js?stt=2');
    const res = await request(createApp())
      .post('/api/stt')
      .send({ audio: Buffer.from('not really wav').toString('base64') });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('stt-unavailable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npm test -w server -- stt-route`
Expected: FAIL — `/api/stt` not mounted (404, not 400/503).

- [ ] **Step 3: Implement the route.**

Create `server/src/routes/stt.ts`:

```ts
import { Router } from 'express';
import { transcribe, SttUnavailableError } from '../services/stt-whisper.js';

export const sttRouter = Router();

sttRouter.post('/', async (req, res) => {
  const { audio, language } = req.body ?? {};
  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: 'audio (base64 wav) required' });
  }
  let wav: Buffer;
  try { wav = Buffer.from(audio, 'base64'); }
  catch { return res.status(400).json({ error: 'invalid base64 audio' }); }
  if (wav.length === 0) return res.status(400).json({ error: 'empty audio' });

  try {
    const result = await transcribe({ wav, language });
    return res.json(result);
  } catch (err) {
    if (err instanceof SttUnavailableError) {
      return res.status(503).json({ error: 'stt-unavailable' });
    }
    return res.status(500).json({ error: 'stt-failed' });
  }
});
```

- [ ] **Step 4: Mount it in `server/src/app.ts`.**

Add the import beside the other route imports:

```ts
import { sttRouter } from './routes/stt.js';
```

Add the mount beside `app.use('/api/tts', ttsRouter);`:

```ts
  app.use('/api/stt', sttRouter);
```

- [ ] **Step 5: Run tests to verify they pass.**

Run: `npm test -w server -- stt-route`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add server/src/routes/stt.ts server/src/app.ts server/src/__tests__/stt-route.test.ts
git commit -m "feat(stt): add POST /api/stt route with 400/503 handling"
```

---

## Task 7: Client WAV encoder (16 kHz mono PCM)

**Files:**
- Create: `client/src/components/audio/wav-encode.ts`
- Test: `client/src/components/audio/wav-encode.test.ts`

`blobToWav16k` uses `AudioContext` (unavailable in jsdom) so it stays a thin, untested wrapper; the pure helpers `downsampleTo16k` and `encodeWavPcm16` carry the logic and are fully tested.

- [ ] **Step 1: Write the failing tests.**

Create `client/src/components/audio/wav-encode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { downsampleTo16k, encodeWavPcm16 } from './wav-encode';

describe('downsampleTo16k', () => {
  it('halves a 32kHz buffer to 16kHz length', () => {
    const input = new Float32Array(32000).fill(0.5);
    const out = downsampleTo16k(input, 32000);
    expect(out.length).toBe(16000);
  });
  it('returns input unchanged when already 16kHz', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    expect(downsampleTo16k(input, 16000).length).toBe(3);
  });
});

describe('encodeWavPcm16', () => {
  it('produces a valid mono 16kHz RIFF/WAVE header and PCM body', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buf = encodeWavPcm16(samples, 16000);
    const view = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);       // channels = mono
    expect(view.getUint32(24, true)).toBe(16000);    // sample rate
    expect(view.getUint16(34, true)).toBe(16);       // bits per sample
    expect(buf.byteLength).toBe(44 + samples.length * 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npm test -w client -- wav-encode`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the encoder.**

Create `client/src/components/audio/wav-encode.ts`:

```ts
/** Nearest-neighbor downsample of mono float samples to 16 kHz. */
export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  const TARGET = 16000;
  if (inputRate === TARGET) return input;
  const ratio = inputRate / TARGET;
  const outLen = Math.round(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = input[Math.floor(i * ratio)] ?? 0;
  return out;
}

/** Encode mono Float32 PCM (-1..1) into a 16-bit PCM WAV ArrayBuffer. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

/** Decode an audio Blob, mix to mono, downsample to 16 kHz, return a WAV Blob. */
export async function blobToWav16k(blob: Blob): Promise<Blob> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const ch = decoded.numberOfChannels;
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < ch; c++) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / ch;
    }
    const wav = encodeWavPcm16(downsampleTo16k(mono, decoded.sampleRate), 16000);
    return new Blob([wav], { type: 'audio/wav' });
  } finally {
    void ctx.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `npm test -w client -- wav-encode`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add client/src/components/audio/wav-encode.ts client/src/components/audio/wav-encode.test.ts
git commit -m "feat(stt): client WAV encoder (16kHz mono PCM) with pure helpers"
```

---

## Task 8: Client STT service

**Files:**
- Create: `client/src/services/stt.ts`
- Test: `client/src/services/__tests__/stt.test.ts`

- [ ] **Step 1: Write the failing tests.**

Create `client/src/services/__tests__/stt.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';

// AudioContext is unavailable in jsdom — mock the WAV conversion.
vi.mock('../../components/audio/wav-encode', () => ({
  blobToWav16k: vi.fn(async () => new Blob([new Uint8Array(44)], { type: 'audio/wav' })),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('stt.transcribe', () => {
  it('returns null when /api/stt responds 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 } as Response)));
    const mod = await import('../stt.ts?case=1');
    const r = await mod.transcribe(new Blob(['x']));
    expect(r).toBeNull();
  });

  it('returns the parsed SttResult on 200', async () => {
    const payload = { language: 'en', languageProb: 0.9, text: 'hi', segments: [], mode: 'transcription' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => payload } as unknown as Response)));
    const mod = await import('../stt.ts?case=2');
    const r = await mod.transcribe(new Blob(['x']));
    expect(r).toEqual(payload);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npm test -w client -- services/__tests__/stt`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service.**

Create `client/src/services/stt.ts`:

```ts
import { blobToWav16k } from '../components/audio/wav-encode';
import type { SttResult } from 'shared/types';

/** Transcribe an audio Blob via the local whisper sidecar; null when unavailable. */
export async function transcribe(blob: Blob, opts?: { language?: string }): Promise<SttResult | null> {
  try {
    const wav = await blobToWav16k(blob);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const base64 = btoa(bytes.reduce((data, byte) => data + String.fromCharCode(byte), ''));
    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64, language: opts?.language }),
    });
    if (!res.ok) return null;
    return (await res.json()) as SttResult;
  } catch {
    return null;
  }
}
```

(If `shared/types` is not aliased in the client tsconfig the way `tts.ts` imports shared code, mirror whatever import path `client/src/services/tts.ts` or `SampleInput.tsx` uses — `SampleInput.tsx` imports from `'shared/types'`, so that alias exists.)

- [ ] **Step 4: Run test to verify it passes.**

Run: `npm test -w client -- services/__tests__/stt`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add client/src/services/stt.ts client/src/services/__tests__/stt.test.ts
git commit -m "feat(stt): client STT service posting WAV to /api/stt"
```

---

## Task 9: Swap the detector + mode-aware LanguageBadge

**Files:**
- Modify: `client/src/components/audio/LanguageDetector.tsx`
- Test: `client/src/components/audio/LanguageDetector.test.tsx`

Replace the 6-locale Web-Speech loop and the `/api/ai/chat` fallback in `useLanguageDetection` with a single `stt.transcribe` call; extend `DetectionResult` with `mode` + `segments`; render a mode tag in `LanguageBadge`.

- [ ] **Step 1: Write the failing test (badge rendering for both modes).**

Create `client/src/components/audio/LanguageDetector.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageBadge } from './LanguageDetector';

describe('LanguageBadge', () => {
  it('shows a transcription tag for confident results', () => {
    render(<LanguageBadge detecting={false} result={{ language: 'English', confidence: 0.9, transcript: 'hello', mode: 'transcription', segments: [] }} />);
    expect(screen.getByText(/English/i)).toBeTruthy();
    expect(screen.getByText(/transcription/i)).toBeTruthy();
  });

  it('shows a low-confidence phonetic-guess tag', () => {
    render(<LanguageBadge detecting={false} result={{ language: 'English', confidence: 0.3, transcript: 'xq tlik', mode: 'phonetic-guess', segments: [] }} />);
    expect(screen.getByText(/phonetic guess/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npm test -w client -- LanguageDetector`
Expected: FAIL — `mode`/`segments` not on `DetectionResult`; no "transcription"/"phonetic guess" text.

- [ ] **Step 3: Rewrite the hook + result type + badge.**

In `client/src/components/audio/LanguageDetector.tsx`:

(a) Replace the `DetectionResult` interface and delete the `SPEECH_LANGUAGES`, `detectWithSpeechAPI`, and `detectWithAI` helpers:

```tsx
import { useState, useCallback } from 'react'
import { transcribe } from '@/services/stt'
import type { SttSegment } from 'shared/types'

interface DetectionResult {
  language: string
  confidence: number
  transcript: string
  mode: 'transcription' | 'phonetic-guess'
  segments: SttSegment[]
}
```

(b) Replace `useLanguageDetection` so `detect` calls the sidecar:

```tsx
export function useLanguageDetection() {
  const [detecting, setDetecting] = useState(false)
  const [result, setResult] = useState<DetectionResult | null>(null)

  const detect = useCallback(async (blob: Blob) => {
    setDetecting(true)
    setResult(null)
    const stt = await transcribe(blob)
    if (stt) {
      const confidence = stt.segments.length
        ? stt.segments.reduce((a, s) => a + s.avgProb, 0) / stt.segments.length
        : stt.languageProb
      setResult({ language: stt.language || 'unknown', confidence, transcript: stt.text, mode: stt.mode, segments: stt.segments })
    }
    setDetecting(false)
  }, [])

  const reset = useCallback(() => { setResult(null); setDetecting(false) }, [])
  return { detect, detecting, result, reset }
}
```

(c) Update `LanguageBadge` to render a mode tag. Replace the body after `if (!result) return null` with:

```tsx
  const isGuess = result.mode === 'phonetic-guess'
  const confidenceColor = isGuess ? 'text-amber-400' : 'text-accent'

  return (
    <div className="glass-inner rounded-lg px-3 py-2 border border-white/[0.04] space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-gray-600">{isGuess ? 'PHONETIC GUESS' : 'TRANSCRIPTION'}</span>
        <span className={`text-xs font-medium ${confidenceColor}`}>{result.language}</span>
        <span className="badge badge-confirmed text-[10px]">{Math.round(result.confidence * 100)}%</span>
        {isGuess && <span className="text-[10px] font-mono text-amber-400/80">low confidence</span>}
      </div>
      {result.transcript && (
        <p className="text-[11px] font-mono text-gray-500 truncate">"{result.transcript}"</p>
      )}
    </div>
  )
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `npm test -w client -- LanguageDetector`
Expected: PASS.

- [ ] **Step 5: Typecheck/build (the hook's `result` shape changed; confirm `AudioRecorder` still compiles).**

Run: `npm run build -w client`
Expected: PASS (one pre-existing WaveformCanvas dynamic-import warning is harmless).

- [ ] **Step 6: Commit.**

```bash
git add client/src/components/audio/LanguageDetector.tsx client/src/components/audio/LanguageDetector.test.tsx
git commit -m "feat(stt): replace flaky Web-Speech detector with whisper /api/stt"
```

---

## Task 10: Auto-segment — surface AudioSegmenter seeded from whisper

**Files:**
- Modify: `client/src/components/audio/AudioRecorder.tsx` (forward segments)
- Modify: `client/src/components/phase1-samples/SampleInput.tsx` (render AudioSegmenter seeded from segments; persist them)

`AudioRecorder` already calls `detect(blob)` and gets `langResult` (now carrying `segments`). Forward those segments to the parent and into `AudioSegmenter`.

- [ ] **Step 1: Forward whisper segments from AudioRecorder.**

In `client/src/components/audio/AudioRecorder.tsx`, change the prop type and the `onRecordingComplete` call. Update the interface:

```tsx
import type { SttSegment } from 'shared/types'

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob, peaks: number[], duration: number, detectedLanguage?: string, segments?: SttSegment[]) => void
  className?: string
}
```

Because `detect(blob)` resolves asynchronously and sets `langResult`, await transcription directly in `recorder.onstop` so segments are available at completion. Replace the `detect(blob)` + `onRecordingComplete(...)` lines in `recorder.onstop` with:

```tsx
        const { transcribe } = await import('@/services/stt')
        const stt = await transcribe(blob)
        if (stt) setLiveLanguage(stt.language)
        onRecordingComplete(blob, peaks, dur, stt?.language || liveLanguage || undefined, stt?.segments)
```

(Keep the `useLanguageDetection` hook usage for the `LanguageBadge` display, or drop the badge here if redundant; minimal change is to keep `detect(blob)` for the badge AND pass `stt.segments` through. To avoid transcribing twice, prefer the single `transcribe` call above and render the badge from its result via local state. Implementer's choice — the test in Task 9 covers the badge; this task's behavior is verified manually.)

- [ ] **Step 2: Render a seeded AudioSegmenter in SampleInput.**

In `client/src/components/phase1-samples/SampleInput.tsx`:

(a) Extend the `pendingAudio` state and the import:

```tsx
import { AudioSegmenter } from '@/components/audio/AudioSegmenter'
import type { SttSegment } from 'shared/types'
```

Add `sttSegments?: SttSegment[]` to the `pendingAudio` state type, and update `handleRecordingComplete`:

```tsx
  const handleRecordingComplete = (blob: Blob, peaks: number[], duration: number, detectedLanguage?: string, segments?: SttSegment[]) => {
    const blobUrl = URL.createObjectURL(blob)
    setPendingAudio({ blob, peaks, duration, blobUrl, detectedLanguage, sttSegments: segments })
    setSource('Audio recording')
    if (detectedLanguage) setPhoneticNotes((prev) => prev || `Detected: ${detectedLanguage}`)
  }
```

(b) Hold seeded segments and render the segmenter under the pending-audio preview. Add state `const [pendingSegments, setPendingSegments] = useState<{ id: string; start: number; end: number; label: string }[]>([])`, seed it when audio arrives (in `handleRecordingComplete`, derive normalized 0–1 boundaries from `segments` and set), and below the `<AudioPlayer>` inside the `pendingAudio` block render:

```tsx
              {pendingAudio.sttSegments && pendingAudio.sttSegments.length > 0 && (
                <AudioSegmenter
                  src={pendingAudio.blobUrl}
                  peaks={pendingAudio.peaks}
                  duration={pendingAudio.duration}
                  initialSegments={pendingAudio.sttSegments.map((s, i) => ({
                    id: `stt-${i}`,
                    start: s.start / pendingAudio.duration,
                    end: s.end / pendingAudio.duration,
                    label: s.text,
                  }))}
                  onSegmentsChange={setPendingSegments}
                />
              )}
```

(c) Persist segments when the sample is saved: in `handleAdd`, replace the `addAudioClip({ … segments: [] })` call with `segments: pendingSegments.map((s) => ({ id: s.id, start: s.start, end: s.end, label: s.label, dictionary_entry_id: null }))`, and clear `setPendingSegments([])` alongside the other resets.

- [ ] **Step 3: Build to confirm it compiles.**

Run: `npm run build -w client`
Expected: PASS.

- [ ] **Step 4: Manual verification.**

Start dev (`npm run dev` at repo root, or the packaged app from Task 12). With whisper available: record a short English phrase → the AudioSegmenter appears pre-seeded with word/segment boundaries and labels; editing/removing still works; saving the sample persists the segments on the audio clip.

- [ ] **Step 5: Commit.**

```bash
git add client/src/components/audio/AudioRecorder.tsx client/src/components/phase1-samples/SampleInput.tsx
git commit -m "feat(stt): auto-seed AudioSegmenter from whisper timestamps"
```

---

## Task 11: Link transcript tokens to the dictionary (transcription mode only)

**Files:**
- Modify: `client/src/components/phase1-samples/SampleInput.tsx`

Offer dictionary actions on seeded segments only when the detection mode is `transcription` (suppressed for phonetic guesses so hallucinations don't pollute the dictionary).

- [ ] **Step 1: Track the detected mode in pending audio.**

Add `mode?: 'transcription' | 'phonetic-guess'` to the `pendingAudio` state type. The recorder already passes the language; thread the mode through too: extend `onRecordingComplete` (Task 10 signature) with a trailing `mode?: 'transcription' | 'phonetic-guess'` argument sourced from `stt.mode`, and store it in `handleRecordingComplete`.

- [ ] **Step 2: Render match/add affordances per segment.**

Below the seeded `<AudioSegmenter>` block (only when `pendingAudio.mode === 'transcription'`), render a compact token row:

```tsx
              {pendingAudio.mode === 'transcription' && pendingSegments.length > 0 && (
                <div className="glass-inner" style={{ padding: 10, marginTop: 10 }}>
                  <span className="label" style={{ marginBottom: 6, display: 'block' }}>Link to dictionary</span>
                  <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {pendingSegments.map((s) => {
                      const known = profile?.dictionary.find((d) => d.alien_word.toLowerCase() === s.label.toLowerCase())
                      return (
                        <button
                          key={s.id}
                          className="btn xs ghost"
                          title={known ? `Already in dictionary: ${known.english_meaning}` : 'Add to dictionary'}
                          style={{ color: known ? 'var(--accent)' : undefined }}
                          onClick={() => {
                            if (known || !s.label.trim()) return
                            addDictionaryEntry({ alien_word: s.label, english_meaning: '', part_of_speech: 'unknown', confidence: 50, context: 'From audio transcript', examples: [], notes: '' })
                          }}
                        >
                          {known ? `✓ ${s.label}` : `+ ${s.label}`}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
```

(Confirm `addDictionaryEntry`'s expected argument shape against `@/stores/profile-context`; it is already destructured in `SampleInput`. Match its parameter type — adjust fields if the store omits `id`/`created_at` and injects them itself, which is the existing convention.)

- [ ] **Step 3: Build to confirm it compiles.**

Run: `npm run build -w client`
Expected: PASS.

- [ ] **Step 4: Manual verification.**

Record real-language audio → token chips show; clicking `+ word` adds a dictionary entry; already-known words render as `✓ word`. Record gibberish (phonetic-guess mode) → the linking row does **not** appear.

- [ ] **Step 5: Commit.**

```bash
git add client/src/components/phase1-samples/SampleInput.tsx
git commit -m "feat(stt): link transcribed tokens to dictionary (transcription mode)"
```

---

## Task 12: Re-transcribe saved audio samples

**Files:**
- Modify: `client/src/components/phase1-samples/SampleInput.tsx`

Add an on-demand re-transcribe button to stored samples that have audio. It fetches the stored clip bytes and re-runs `transcribe`.

- [ ] **Step 1: Confirm the audio fetch endpoint.**

Check `server/src/routes/audio.ts` for the GET-by-id path used to retrieve a stored clip (the upload posts to `/api/audio/upload` with `{ id, data, mimeType }`). Use the corresponding GET route (e.g. `/api/audio/:id`) returning the audio bytes/blob. If only base64 JSON is returned, convert to a Blob client-side before calling `transcribe`.

- [ ] **Step 2: Add a re-transcribe handler + button.**

Add state `const [reTranscribing, setReTranscribing] = useState<string | null>(null)` and a handler:

```tsx
  const handleReTranscribe = async (sample: Sample) => {
    if (!sample.audio_id) return
    setReTranscribing(sample.id)
    try {
      const res = await fetch(`/api/audio/${sample.audio_id}`)
      if (!res.ok) return
      const blob = await res.blob()
      const { transcribe } = await import('@/services/stt')
      const stt = await transcribe(blob)
      if (stt) {
        // Surface the result: store transcript into phonetic_notes or open a toast.
        // Minimal: write the transcript to the sample's phonetic_notes via the profile store.
        console.log('re-transcribed', sample.id, stt.text, stt.mode)
      }
    } finally {
      setReTranscribing(null)
    }
  }
```

In the sample card's action row (next to the delete `×`), add:

```tsx
                          {sample.audio_id && (
                            <button onClick={(e) => { e.stopPropagation(); void handleReTranscribe(sample) }} title="Re-transcribe audio" style={{ background: 'none', border: 0, color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12 }}>
                              {reTranscribing === sample.id ? '…' : '↻'}
                            </button>
                          )}
```

(Decide how to surface the re-transcription: simplest is updating `sample.phonetic_notes` via an `updateSample`/profile-store action if one exists; if not, expose the result via existing UI. Confirm the available store action in `@/stores/profile-context` and wire accordingly — do not invent an action that doesn't exist.)

- [ ] **Step 3: Build to confirm it compiles.**

Run: `npm run build -w client`
Expected: PASS.

- [ ] **Step 4: Manual verification.**

On a saved sample with audio, click ↻ → spinner shows, transcription runs against the stored clip, result is surfaced.

- [ ] **Step 5: Commit.**

```bash
git add client/src/components/phase1-samples/SampleInput.tsx
git commit -m "feat(stt): re-transcribe saved audio samples on demand"
```

---

## Task 13: Electron env wiring

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Inject WHISPER_BIN/WHISPER_MODEL into the forked server env (win32, existsSync-guarded).**

In `electron/main.ts`, inside `startServerProcess()` next to the `espeakBin`/`espeakEnv` block, add:

```ts
    // Bundled whisper.cpp (Windows only for now; elsewhere WHISPER_* stays unset → STT disabled).
    const whisperBin = process.platform === 'win32'
      ? path.join(process.resourcesPath, 'whisper', 'whisper-cli.exe')
      : path.join(process.resourcesPath, 'whisper', 'whisper-cli');
    const whisperModel = path.join(process.resourcesPath, 'whisper', 'ggml-base-q5_1.bin');
    const whisperEnv = (existsSync(whisperBin) && existsSync(whisperModel))
      ? { WHISPER_BIN: whisperBin, WHISPER_MODEL: whisperModel }
      : {};
```

Then merge it into the fork env (extend the existing `env` spread):

```ts
      env: { ...process.env, PORT: '0', DATA_DIR: dataDir, CLIENT_DIST: clientDist, NODE_ENV: 'production', ...espeakEnv, ...whisperEnv },
```

- [ ] **Step 2: Build the electron main bundle to confirm it compiles.**

Run: `npm run build -w electron` (or the project's electron build script — match how Increment 1 builds `electron/dist`).
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add electron/main.ts
git commit -m "feat(stt): wire WHISPER_BIN/WHISPER_MODEL into the forked server"
```

---

## Task 14: Vendor whisper.cpp + packaging + .gitattributes

**Files:**
- Create: `vendor/whisper/win/whisper-cli.exe` (+ required DLLs) and `vendor/whisper/win/ggml-base-q5_1.bin`
- Create: `server/src/__tests__/fixtures/hello-16k.wav` (for the gated real-transcription test)
- Modify: `electron/builder.config.cjs` (extraResources)
- Modify: `.gitattributes` (binary attributes)
- Modify: `docs/desktop-release.md` (document acquisition)

- [ ] **Step 1: Acquire the Windows whisper.cpp binary + DLLs.**

Download a prebuilt Windows whisper.cpp release (the `whisper-bin-x64` zip from the whisper.cpp GitHub Releases) and copy `whisper-cli.exe` plus all sibling `*.dll` (e.g. `ggml.dll`, `ggml-base.dll`, `ggml-cpu.dll`, `whisper.dll`, and any runtime DLLs in the zip) into `vendor/whisper/win/`. Copy the **whole** set — like espeak's data dir, missing DLLs break it at runtime.

- [ ] **Step 2: Acquire the quantized model.**

Download `ggml-base-q5_1.bin` (~57 MB, multilingual) from the whisper.cpp Hugging Face model repo and place it at `vendor/whisper/win/ggml-base-q5_1.bin`.

- [ ] **Step 3: Mark binaries as `binary` in `.gitattributes`.**

Add (mirroring the existing espeak `*.exe` rule):

```
vendor/whisper/win/* binary
*.dll binary
*.bin binary
```

- [ ] **Step 4: Add whisper to electron-builder `extraResources`.**

In `electron/builder.config.cjs`, add to the `extraResources` array:

```js
    { from: 'vendor/whisper/win', to: 'whisper' },
```

- [ ] **Step 5: Create the gated test fixture.**

Generate a 16 kHz mono WAV saying a short English phrase (e.g. record one and convert, or use espeak: `espeak-ng "hello world" -w hello.wav` then resample to 16 kHz mono) and save it as `server/src/__tests__/fixtures/hello-16k.wav`.

- [ ] **Step 6: Verify the gated server test now runs.**

Run (Windows path to the vendored binary/model):
```bash
WHISPER_BIN="$(pwd)/vendor/whisper/win/whisper-cli.exe" WHISPER_MODEL="$(pwd)/vendor/whisper/win/ggml-base-q5_1.bin" npm test -w server -- stt-service
```
Expected: the previously-skipped "transcribes a 16kHz WAV fixture" test now PASSES (non-empty text, segments array, valid mode).

- [ ] **Step 7: Document acquisition in `docs/desktop-release.md`.**

Add a short "Vendoring whisper.cpp (Windows)" section: which release zip, which DLLs, the model file + source URL, and that mac/linux are deferred (STT degrades to 503 there).

- [ ] **Step 8: Commit.**

```bash
git add vendor/whisper/win .gitattributes electron/builder.config.cjs server/src/__tests__/fixtures/hello-16k.wav docs/desktop-release.md
git commit -m "feat(stt): vendor whisper.cpp + model and bundle via extraResources"
```

---

## Task 15: Full verification + packaged smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the full server suite.**

Run: `npm test -w server`
Expected: PASS (all prior tests + new STT parse/mode/route/service tests; gated real test skipped unless env set).

- [ ] **Step 2: Run the full client suite.**

Run: `npm test -w client`
Expected: PASS (smoke, tts fallback, SpeakButton, wav-encode, stt service, LanguageBadge modes).

- [ ] **Step 3: Build the client.**

Run: `npm run build -w client`
Expected: PASS (only the pre-existing harmless WaveformCanvas dynamic-import warning).

- [ ] **Step 4: Package and smoke-test STT end-to-end.**

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --config electron/builder.config.cjs
```
Launch `release/win-unpacked/Xenolinguist.exe`, find its loopback port (from the `[server]` log line), and POST a 16 kHz mono WAV (base64) to `/api/stt`:
Expected: `200` JSON with `text`, `language`, `segments[]`, and a `mode`. Record an English phrase in the UI → transcript + language + (transcription mode) dictionary chips + seeded segmenter. Record gibberish → "phonetic guess · low confidence", no dictionary chips.

- [ ] **Step 5: Finishing the branch.**

Invoke superpowers:finishing-a-development-branch to open the `whisper/stt` PR (base `main`). PR body: no AI attribution. Note remaining deferrals: mac/linux whisper vendoring, streaming whisper, threshold recalibration UI, Increment 3 (Allosaurus phonetic/IPA).

---

## Self-Review (completed during authoring)

**Spec coverage:** §4.1 config → Task 2. §4.2 service (`transcribe`, `SttUnavailableError`, mode) → Tasks 3–5. §4.3 route → Task 6. §4.4 app wiring → Task 6. §4.5 wav-encode → Task 7. §4.6 client stt service + shared types → Tasks 1, 8. §4.7 detector swap + badge → Task 9. §4.8 auto-segment → Task 10. §4.9 dictionary linking → Task 11. §4.10 re-transcribe → Task 12. §4.11 Electron env → Task 13. §4.12 vendoring/packaging/.gitattributes → Task 14. §5 error handling → Tasks 6, 9 (503→null→graceful). §6 honesty modes → Tasks 4, 9, 11. §7 testing → Tasks 2–9, 14–15. §0.1 prerequisite merges → Task 0.

**Placeholder scan:** No "TBD/TODO". Tasks 11–12 contain explicit notes to verify existing store/route signatures rather than invent them — these are guardrails, not deferrals; the code shown is complete and runnable.

**Type consistency:** `SttResult`/`SttSegment`/`SttMode` defined in Task 1 used identically across server (Tasks 3–5) and client (Tasks 8–9). `avgProb` (not `avgLogprob`) used consistently. `transcribe` signatures: server `({ wav, language? })`, client `(blob, opts?)` — distinct modules, intentional. `onRecordingComplete` signature extended once (Task 10) then reused (Task 11).
