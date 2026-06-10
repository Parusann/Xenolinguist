# Xenolinguist Voice — Increment 3 (Phonetic/IPA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bundled, offline, language-independent phoneme recognizer (`POST /api/ipa`) that turns any recorded audio into an IPA/phone string, stores it on the sample, shows it, and feeds it to the AI partner — the honest phonetic path for alien/constructed speech.

**Architecture:** In-process in the Node server via **Transformers.js** (`@huggingface/transformers`, MIT) running a **bundled local wav2vec2 eSpeak-phoneme ONNX model** (no Python at runtime). Client reuses `blobToWav16k` (16 kHz mono WAV) → `POST /api/ipa`; runs automatically in parallel with whisper STT. Mirrors the Increment-2 config-getter → service → route → client-service → capture-wiring shape. A feasibility spike (Task 1) locks the model + the ONNX backend before the rest is built.

**Tech Stack:** TypeScript, Express, `@huggingface/transformers` (ONNX via onnxruntime-web/node), React 19, Vitest + supertest, Electron + electron-builder. Dev-time only (Task 1, not shipped): HuggingFace `optimum` for the ONNX export fallback.

**Reference:** spec `docs/superpowers/specs/2026-06-07-xenolinguist-voice-phonetic-ipa-design.md`. Patterns to copy from Increment 2: `server/src/config.ts` (`whisperModelPath`), `server/src/services/stt-whisper.ts` (`SttUnavailableError`, lazy resource), `server/src/routes/stt.ts`, `client/src/services/stt.ts`, `client/src/components/audio/wav-encode.ts`, `electron/main.ts` (WHISPER_MODEL wiring), `electron/builder.config.cjs`, `scripts/verify-stt.mjs`.

**Conventions:** server tests in `server/src/__tests__/*.test.ts` (vitest + supertest, dynamic `import('../x.js?case=N')`, env via `process.env`, real tests gated); client tests use `vi.stubGlobal('fetch')` + `vi.mock`; server ESM imports use `.js`; shared imported via `../../../shared/x.js` (server) / `'shared/x'` (client). `npm test -w server` for server (NOT `tsc` build — it fails on baseline test query-imports); `npm run build -w client` is the real client typecheck. Commits: Conventional Commits, **NO AI attribution** (hard project rule).

---

## Task 0: Prerequisite — land PR #4, branch `phonetic/ipa`

**Not a code task.** Establishes the base per spec §0.1.

- [ ] **Step 1: Merge `whisper/stt` (PR #4) into `main`.**
```bash
gh pr merge 4 -R Parusann/Xenolinguist --merge
```
(PR #4 carries Increment 2 + the default-model fix + the demo language.)

- [ ] **Step 2: Refresh `main` and branch `phonetic/ipa`.**
```bash
git -C C:/Users/parus/Downloads/Xenolinguist checkout main
git -C C:/Users/parus/Downloads/Xenolinguist pull
git -C C:/Users/parus/Downloads/Xenolinguist checkout -b phonetic/ipa
git -C C:/Users/parus/Downloads/Xenolinguist push -u origin phonetic/ipa
```

- [ ] **Step 3: Point the impl worktree at `phonetic/ipa`.**
```bash
git -C C:/Users/parus/Downloads/Xenolinguist-impl fetch origin
git -C C:/Users/parus/Downloads/Xenolinguist-impl checkout phonetic/ipa
```
Expected: worktree HEAD on `phonetic/ipa`. All remaining tasks run in `Xenolinguist-impl`. **Orchestrator-led (downloads + a go/no-go decision).**

---

## Task 1: Feasibility spike — lock the model, backend, and a verifier

**Goal:** Prove a usable wav2vec2 eSpeak-phoneme ONNX model loads OFFLINE via Transformers.js in plain Node and emits sensible IPA on the existing fixture, then vendor it. **This is a go/no-go gate; run it before building Tasks 2+.**

**Files:**
- Create: `scripts/verify-ipa.mjs`
- Create: `vendor/ipa-model/` (the vendored ONNX model + config/tokenizer/preprocessor)
- Create: `docs/ipa-model-notes.md` (record the chosen model id, file set, backend, and bundle size)

- [ ] **Step 1: Install Transformers.js in the workspace.**
```bash
cd C:/Users/parus/Downloads/Xenolinguist-impl
npm install @huggingface/transformers -w server
```
Expected: added to `server/package.json` deps.

- [ ] **Step 2: Acquire the model (primary path).** Try a ready ONNX conversion first. With Transformers.js able to fetch+cache, run a one-off Node script that loads a candidate and transcribes the fixture (temporarily allowing remote download into a local cache dir):
```bash
node -e "import('@huggingface/transformers').then(async ({pipeline,env})=>{env.cacheDir='./vendor/ipa-model-cache';const p=await pipeline('automatic-speech-recognition','Xenova/wav2vec2-lv-60-espeak-cv-ft');console.log('loaded');})" 2>&1 | tail -5
```
If that model id 404s, try `onnx-community/wav2vec2-lv-60-espeak-cv-ft`. Record whichever loads.

- [ ] **Step 3: Fallback if no ready ONNX exists — convert the confirmed base model.** `facebook/wav2vec2-lv-60-espeak-cv-ft` is confirmed to exist. Export it to ONNX at dev-time (Python is a one-time *converter* here; it is NOT shipped — the app runs the resulting ONNX via Transformers.js):
```bash
python -m pip install --quiet "optimum[exporters]" onnx
python -m optimum.exporters.onnx --model facebook/wav2vec2-lv-60-espeak-cv-ft --task automatic-speech-recognition vendor/ipa-model/wav2vec2-espeak/
```
Expected: an ONNX model + `config.json` + `tokenizer*`/`preprocessor_config.json` under `vendor/ipa-model/wav2vec2-espeak/`. (If `optimum` lacks a Transformers.js-compatible layout, also copy the HF `tokenizer.json`/`vocab.json` so Transformers.js can build the CTC decoder.)

- [ ] **Step 4: Settle the vendored layout.** Ensure the final offline layout is `vendor/ipa-model/<MODEL_ID>/` where `<MODEL_ID>` is a folder name (record it as `MODEL_ID` in `docs/ipa-model-notes.md`; later tasks use this exact name). Transformers.js loads it via `env.localModelPath = <abs vendor/ipa-model>` + model id `<MODEL_ID>`. Remove the temporary `vendor/ipa-model-cache`.

- [ ] **Step 5: Write the standalone verifier.** Create `scripts/verify-ipa.mjs`:
```js
// Standalone check that the vendored phoneme model transcribes the fixture to IPA,
// offline, in plain Node (mirrors the production server path). Run: node scripts/verify-ipa.mjs
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_DIR = path.join(ROOT, 'vendor', 'ipa-model');
const MODEL_ID = 'wav2vec2-espeak'; // <-- the folder under vendor/ipa-model (record in docs/ipa-model-notes.md)
const WAV = path.join(ROOT, 'server', 'src', '__tests__', 'fixtures', 'hello-16k.wav');

function wavToFloat32(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12, dataOff = -1, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), sz = dv.getUint32(off + 4, true);
    if (id === 'data') { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz & 1);
  }
  if (dataOff < 0) throw new Error('no data chunk');
  const n = Math.floor(dataLen / 2), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(dataOff + i * 2, true) / 32768;
  return out;
}

if (!existsSync(path.join(MODEL_DIR, MODEL_ID))) { console.error('MISSING model dir:', path.join(MODEL_DIR, MODEL_ID)); process.exit(1); }
const { pipeline, env } = await import('@huggingface/transformers');
env.allowRemoteModels = false;
env.localModelPath = MODEL_DIR;
const pipe = await pipeline('automatic-speech-recognition', MODEL_ID);
const out = await pipe(wavToFloat32(readFileSync(WAV)));
const ipa = (out.text ?? '').trim();
console.log('IPA:', ipa);
if (!ipa) { console.error('FAIL: empty IPA'); process.exit(1); }
console.log('OK: bundled phoneme model produced IPA.');
```

- [ ] **Step 6: Run the verifier (the gate).**
```bash
node scripts/verify-ipa.mjs
```
Expected: prints a non-empty IPA/phone string for "hello world the quick brown fox…" (e.g. `h ə l oʊ w ɜː l d …`). **If it fails to load/bundle or emits garbage on clear English, STOP and escalate** — the engine approach needs revisiting before continuing.

- [ ] **Step 7: Record the decision + check size.**
```bash
du -sh vendor/ipa-model/<MODEL_ID>
```
Write `docs/ipa-model-notes.md`: the `MODEL_ID`, source (ready ONNX vs optimum-converted from `facebook/wav2vec2-lv-60-espeak-cv-ft`), file list, on-disk size, and the ONNX backend Transformers.js used (note whether `onnxruntime-node` native `.node` files appear under `node_modules` — they affect packaging in Task 10).

- [ ] **Step 8: Mark model files binary + commit.** Append to `.gitattributes`:
```
vendor/ipa-model/** binary
*.onnx binary
```
```bash
git add scripts/verify-ipa.mjs vendor/ipa-model .gitattributes docs/ipa-model-notes.md server/package.json package-lock.json
git commit -m "feat(ipa): vendor wav2vec2 phoneme ONNX model + standalone verifier"
```

---

## Task 2: Shared `Sample.ipa` type

**Files:** Modify `shared/types.ts`

- [ ] **Step 1: Add the field.** In `shared/types.ts`, add to the `Sample` interface (after `audio_id`):
```ts
  ipa: string | null;
```

- [ ] **Step 2: Default it in the seed + any constructors.** In `shared/demo-language.ts`, add `ipa: null,` to each sample object (keeps the type total). (`createDefaultProfile` has no samples, so no change there.)

- [ ] **Step 3: Verify.** Run: `npm run build -w client` — Expected: PASS (client imports `Sample`; tsc confirms the new field doesn't break consumers; existing code treats `ipa` as optional-by-value `null`).

- [ ] **Step 4: Commit.**
```bash
git add shared/types.ts shared/demo-language.ts
git commit -m "feat(ipa): add Sample.ipa field"
```

---

## Task 3: Config getter `ipaModelDir`

**Files:** Modify `server/src/config.ts`; Test: `server/src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing test.** Add to the `afterEach` cleanup `delete process.env.IPA_MODEL_DIR;`, and inside `describe('config', …)`:
```ts
  it('ipaModelDir returns IPA_MODEL_DIR or null', async () => {
    const { ipaModelDir } = await import('../config.js?case=ipa');
    expect(ipaModelDir()).toBeNull();
    process.env.IPA_MODEL_DIR = '/x/ipa-model';
    expect(ipaModelDir()).toBe('/x/ipa-model');
  });
```

- [ ] **Step 2: Run to verify FAIL.** Run: `npm test -w server -- config` — Expected: FAIL (`ipaModelDir` not exported).

- [ ] **Step 3: Implement.** Append to `server/src/config.ts`:
```ts
/** Absolute path to the bundled IPA phoneme model dir, or null (IPA disabled). */
export function ipaModelDir(): string | null {
  return process.env.IPA_MODEL_DIR || null;
}
```

- [ ] **Step 4: Run to verify PASS.** Run: `npm test -w server -- config` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add server/src/config.ts server/src/__tests__/config.test.ts
git commit -m "feat(ipa): add ipaModelDir config getter"
```

---

## Task 4: Phoneme service (`ipa-phones.ts`)

**Files:** Create `server/src/services/ipa-phones.ts`; Test: `server/src/__tests__/ipa-service.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `server/src/__tests__/ipa-service.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';

afterEach(() => { delete process.env.IPA_MODEL_DIR; });

describe('ipa-phones.transcribePhones', () => {
  it('rejects with IpaUnavailableError when the model dir is not configured', async () => {
    delete process.env.IPA_MODEL_DIR;
    const { transcribePhones, IpaUnavailableError } = await import('../services/ipa-phones.js?t=1');
    await expect(transcribePhones({ wav: Buffer.from([0, 1, 2]) })).rejects.toBeInstanceOf(IpaUnavailableError);
  });

  // Real inference only runs with IPA_E2E + a vendored model (vitest can't reliably host the
  // ONNX runtime on Windows; verify with `node scripts/verify-ipa.mjs`).
  const ready = process.env.IPA_MODEL_DIR && process.env.IPA_E2E;
  (ready ? it : it.skip)('produces an IPA string for the fixture', async () => {
    const { readFileSync } = await import('fs');
    const path = (await import('path')).default;
    const { transcribePhones } = await import('../services/ipa-phones.js?t=2');
    const wav = readFileSync(path.join(__dirname, 'fixtures', 'hello-16k.wav'));
    const r = await transcribePhones({ wav });
    expect(typeof r.ipa).toBe('string');
    expect(r.ipa.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.** Run: `npm test -w server -- ipa-service` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `server/src/services/ipa-phones.ts`:
```ts
import path from 'path';
import { ipaModelDir } from '../config.js';

/** Thrown when the IPA model is unavailable; the route maps this to HTTP 503. */
export class IpaUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'IpaUnavailableError'; }
}

// The folder name under the model dir (set by the Task 1 spike; see docs/ipa-model-notes.md).
const MODEL_ID = 'wav2vec2-espeak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipePromise: Promise<any> | null = null;

function getPipeline() {
  const dir = ipaModelDir();
  if (!dir) return Promise.reject(new IpaUnavailableError('ipa model not configured'));
  if (!pipePromise) {
    pipePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowRemoteModels = false;
      env.localModelPath = dir;
      return pipeline('automatic-speech-recognition', MODEL_ID);
    })().catch((err) => { pipePromise = null; throw new IpaUnavailableError(`ipa model load failed: ${err?.message ?? err}`); });
  }
  return pipePromise;
}

/** Parse a 16-bit PCM WAV buffer into mono Float32 samples in [-1, 1]. */
function wavToFloat32(buf: Buffer): Float32Array {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12, dataOff = -1, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = dv.getUint32(off + 4, true);
    if (id === 'data') { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz & 1);
  }
  if (dataOff < 0) throw new IpaUnavailableError('invalid wav: no data chunk');
  const n = Math.floor(dataLen / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(dataOff + i * 2, true) / 32768;
  return out;
}

export interface IpaInput { wav: Buffer }

/** Transcribe 16 kHz mono WAV bytes into a language-independent IPA/phone string. */
export async function transcribePhones(input: IpaInput): Promise<{ ipa: string }> {
  const pipe = await getPipeline();
  let audio: Float32Array;
  try { audio = wavToFloat32(input.wav); }
  catch (err) { if (err instanceof IpaUnavailableError) throw err; throw new IpaUnavailableError('wav parse failed'); }
  try {
    const out = await pipe(audio);
    return { ipa: (out?.text ?? '').trim() };
  } catch (err) {
    throw new IpaUnavailableError(`ipa inference failed: ${(err as Error)?.message ?? err}`);
  }
}
```
(Note: this mirrors `stt-whisper.ts`'s lazy-resource + typed-error shape. The `MODEL_ID` constant comes from Task 1 — keep it in sync with `scripts/verify-ipa.mjs` and `docs/ipa-model-notes.md`.)

- [ ] **Step 4: Run to verify PASS.** Run: `npm test -w server -- ipa-service` — Expected: PASS (unavailable test passes; real test SKIPPED).

- [ ] **Step 5: Full server suite.** Run: `npm test -w server` — Expected: all pass (gated IPA test skipped).

- [ ] **Step 6: Commit.**
```bash
git add server/src/services/ipa-phones.ts server/src/__tests__/ipa-service.test.ts
git commit -m "feat(ipa): phoneme recognition service via Transformers.js"
```

---

## Task 5: `POST /api/ipa` route + app wiring

**Files:** Create `server/src/routes/ipa.ts`; Modify `server/src/app.ts`; Test: `server/src/__tests__/ipa-route.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `server/src/__tests__/ipa-route.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';

afterEach(() => { delete process.env.IPA_MODEL_DIR; });

describe('POST /api/ipa', () => {
  it('returns 400 when no audio is given', async () => {
    const { createApp } = await import('../app.js?ipa=1');
    const res = await request(createApp()).post('/api/ipa').send({});
    expect(res.status).toBe(400);
  });

  it('returns 503 when the model is unavailable', async () => {
    delete process.env.IPA_MODEL_DIR;
    const { createApp } = await import('../app.js?ipa=2');
    const res = await request(createApp()).post('/api/ipa').send({ audio: Buffer.from('x').toString('base64') });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ipa-unavailable');
  });
});
```

- [ ] **Step 2: Run to verify FAIL.** Run: `npm test -w server -- ipa-route` — Expected: FAIL (404, route not mounted).

- [ ] **Step 3: Implement the route.** Create `server/src/routes/ipa.ts`:
```ts
import { Router } from 'express';
import { transcribePhones, IpaUnavailableError } from '../services/ipa-phones.js';

export const ipaRouter = Router();

ipaRouter.post('/', async (req, res) => {
  const { audio } = req.body ?? {};
  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: 'audio (base64 wav) required' });
  }
  let wav: Buffer;
  try { wav = Buffer.from(audio, 'base64'); }
  catch { return res.status(400).json({ error: 'invalid base64 audio' }); }
  if (wav.length === 0) return res.status(400).json({ error: 'empty audio' });

  try {
    const result = await transcribePhones({ wav });
    return res.json(result);
  } catch (err) {
    if (err instanceof IpaUnavailableError) return res.status(503).json({ error: 'ipa-unavailable' });
    return res.status(500).json({ error: 'ipa-failed' });
  }
});
```

- [ ] **Step 4: Mount it.** In `server/src/app.ts`, add beside the other route imports `import { ipaRouter } from './routes/ipa.js';` and beside the mounts `app.use('/api/ipa', ipaRouter);`.

- [ ] **Step 5: Run to verify PASS.** Run: `npm test -w server -- ipa-route` — Expected: PASS. Then `npm test -w server` — Expected: all pass.

- [ ] **Step 6: Commit.**
```bash
git add server/src/routes/ipa.ts server/src/app.ts server/src/__tests__/ipa-route.test.ts
git commit -m "feat(ipa): add POST /api/ipa route with 400/503 handling"
```

---

## Task 6: Client IPA service

**Files:** Create `client/src/services/ipa.ts`; Test: `client/src/services/__tests__/ipa.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `client/src/services/__tests__/ipa.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../components/audio/wav-encode', () => ({
  blobToWav16k: vi.fn(async () => new Blob([new Uint8Array(44)], { type: 'audio/wav' })),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ipa.transcribePhones', () => {
  it('returns null when /api/ipa responds 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 } as Response)));
    const mod = await import('../ipa.ts?case=1');
    expect(await mod.transcribePhones(new Blob(['x']))).toBeNull();
  });

  it('returns the IPA string on 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ipa: 'h ə l oʊ' }) } as unknown as Response)));
    const mod = await import('../ipa.ts?case=2');
    expect(await mod.transcribePhones(new Blob(['x']))).toBe('h ə l oʊ');
  });
});
```

- [ ] **Step 2: Run to verify FAIL.** Run: `npm test -w client -- services/__tests__/ipa` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `client/src/services/ipa.ts`:
```ts
import { blobToWav16k } from '../components/audio/wav-encode';

/** Transcribe an audio Blob to a language-independent IPA string; null when unavailable. */
export async function transcribePhones(blob: Blob): Promise<string | null> {
  try {
    const wav = await blobToWav16k(blob);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const base64 = btoa(bytes.reduce((data, byte) => data + String.fromCharCode(byte), ''));
    const res = await fetch('/api/ipa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64 }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ipa?: string };
    return data.ipa ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify PASS.** Run: `npm test -w client -- services/__tests__/ipa` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add client/src/services/ipa.ts client/src/services/__tests__/ipa.test.ts
git commit -m "feat(ipa): client IPA service posting WAV to /api/ipa"
```

---

## Task 7: Capture wiring (parallel with whisper) + IPA badge

**Files:** Modify `client/src/components/audio/AudioRecorder.tsx`, `client/src/components/audio/LanguageDetector.tsx`, `client/src/components/phase1-samples/SampleInput.tsx`

- [ ] **Step 1: Run IPA in parallel in the recorder.** In `AudioRecorder.tsx`'s `recorder.onstop`, where it currently does `const det = await detect(blob)` then calls `onRecordingComplete(...)`, add a parallel IPA call and forward it. Extend the prop type:
```tsx
// add to imports
import { transcribePhones as transcribeIpa } from '@/services/ipa'
// extend AudioRecorderProps.onRecordingComplete signature with a trailing arg:
//   ipa?: string
```
Replace the onstop completion with:
```tsx
        const [det, ipa] = await Promise.all([detect(blob), transcribeIpa(blob)])
        onRecordingComplete(blob, peaks, dur, det?.language || liveLanguage || undefined, det?.segments, det?.mode, ipa ?? undefined)
```
(Update the `AudioRecorderProps.onRecordingComplete` type to add `ipa?: string` as the final parameter.)

- [ ] **Step 2: Thread `ipa` into SampleInput + persist.** In `SampleInput.tsx`: add `ipa?: string` to the `pendingAudio` state and the `handleRecordingComplete` signature (store `ipa`); in `handleAdd`, pass `ipa: pendingAudio?.ipa ?? null` into `addSample({ … })`. (`addSample` already spreads the sample; `Sample.ipa` exists from Task 2.)

- [ ] **Step 3: Render an IPA chip.** In `LanguageDetector.tsx`, extend `DetectionResult`-adjacent display: the simplest is a dedicated small component. Add to `SampleInput.tsx`, below the pending-audio badge area, when `pendingAudio?.ipa`:
```tsx
              {pendingAudio?.ipa && (
                <div className="glass-inner" style={{ padding: 10, marginTop: 10 }}>
                  <span className="label" style={{ marginBottom: 4, display: 'block' }}>IPA · phones</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-1)' }}>{pendingAudio.ipa}</span>
                </div>
              )}
```

- [ ] **Step 4: Verify.** Run: `npm run build -w client` — Expected: PASS (only the pre-existing WaveformCanvas dynamic-import warning). Run: `npm test -w client` — Expected: PASS.

- [ ] **Step 5: Manual.** With a vendored model + a desktop run: record speech → an IPA string appears under the recorder; saving the sample persists `ipa`.

- [ ] **Step 6: Commit.**
```bash
git add client/src/components/audio/AudioRecorder.tsx client/src/components/phase1-samples/SampleInput.tsx client/src/components/audio/LanguageDetector.tsx
git commit -m "feat(ipa): capture phones in parallel with whisper and show IPA"
```

---

## Task 8: Feed IPA to the AI partner

**Files:** Modify `shared/prompts.ts`, `shared/types.ts` (AITask); Test: `server/src/__tests__/prompts.test.ts` (new) or a shared test under `server/src/__tests__`

- [ ] **Step 1: Write the failing test.** Create `server/src/__tests__/prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatSamplesForPrompt, SYSTEM_PROMPTS } from '../../../shared/prompts.js';

describe('formatSamplesForPrompt with IPA', () => {
  it('includes the IPA when present', () => {
    const out = formatSamplesForPrompt([{ alien_text: 'nesh', english_translation: 'star', ipa: 'n ɛ ʃ' }]);
    expect(out).toContain('n ɛ ʃ');
  });
  it('omits IPA when absent', () => {
    const out = formatSamplesForPrompt([{ alien_text: 'nesh', english_translation: null }]);
    expect(out).not.toContain('[ipa');
  });
});

describe('phoneticAnalysis prompt', () => {
  it('exists', () => { expect(SYSTEM_PROMPTS.phoneticAnalysis).toBeTruthy(); });
});
```

- [ ] **Step 2: Run to verify FAIL.** Run: `npm test -w server -- prompts` — Expected: FAIL.

- [ ] **Step 3: Implement.** In `shared/prompts.ts`, update `formatSamplesForPrompt` to accept optional `ipa` and append it:
```ts
export function formatSamplesForPrompt(samples: { alien_text: string; english_translation: string | null; ipa?: string | null }[]): string {
  return samples
    .map(s => {
      const base = s.english_translation ? `"${s.alien_text}" = "${s.english_translation}"` : `"${s.alien_text}"`;
      return s.ipa ? `${base} [ipa: ${s.ipa}]` : base;
    })
    .join('\n');
}
```
Add to `SYSTEM_PROMPTS`:
```ts
  phoneticAnalysis: `You are a phonetician analyzing an unknown language from its IPA phonetic transcriptions. Given the samples (with [ipa: …] phone strings), identify the phoneme inventory, recurring phone clusters and syllable shapes, and propose sound-to-meaning hypotheses where phones recur with consistent context. Be rigorous; separate observation from speculation and rate confidence 0-100.

Format:
- PHONEME INVENTORY: distinct phones observed
- CLUSTERS / SYLLABLES: recurring patterns
- HYPOTHESES: phone-pattern -> possible meaning (confidence%)
- NOTES: caveats (IPA is an approximation from audio)`,
```
In `shared/types.ts`, add `'phoneticAnalysis'` to the `AITask` union.

- [ ] **Step 4: Run to verify PASS.** Run: `npm test -w server -- prompts` — Expected: PASS. Run `npm run build -w client` — Expected: PASS (AITask union change typechecks; `TASK_WEIGHTS` in `ollama-context.tsx` must include the new task — add `phoneticAnalysis: 'heavy'` there or tsc will error on the `Record<AITask, ModelWeight>`).

- [ ] **Step 5: Wire the task button.** In `SampleInput.tsx` (near the existing `handleAnalyze`/AI Auto-decode control), add a "Phonetic analysis" action that calls `runTask('phoneticAnalysis', prompt)` where `prompt` is built from `formatSamplesForPrompt(profile.samples)` (samples now carry `ipa`). Mirror the existing `handleAnalyze` flow. Run `npm run build -w client` — Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add shared/prompts.ts shared/types.ts server/src/__tests__/prompts.test.ts client/src/components/phase1-samples/SampleInput.tsx client/src/stores/ollama-context.tsx
git commit -m "feat(ipa): feed IPA to the AI partner + phonetic-analysis task"
```

---

## Task 9: Show IPA in the decode view

**Files:** Modify `client/src/components/phase1-samples/SampleDecodeView.tsx`

- [ ] **Step 1: Display the sample's IPA.** Read `SampleDecodeView.tsx`; where it renders the sample's text/phonetic_notes, add (when `sample.ipa`):
```tsx
{sample.ipa && (
  <div className="glass-inner" style={{ padding: 10, marginTop: 8 }}>
    <span className="label" style={{ marginBottom: 4, display: 'block' }}>IPA · phones</span>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-1)' }}>{sample.ipa}</span>
  </div>
)}
```
(Match the file's existing prop name for the sample; integrate, don't blind-paste.)

- [ ] **Step 2: Verify.** Run: `npm run build -w client` — Expected: PASS.

- [ ] **Step 3: Commit.**
```bash
git add client/src/components/phase1-samples/SampleDecodeView.tsx
git commit -m "feat(ipa): show IPA in the sample decode view"
```

---

## Task 10: Electron env + packaging

**Files:** Modify `electron/main.ts`, `electron/builder.config.cjs`; possibly `scripts/bundle.mjs` (per Task 1 backend decision)

- [ ] **Step 1: Inject IPA_MODEL_DIR.** In `electron/main.ts`'s `startServerProcess()`, beside the whisper block, add:
```ts
    const ipaModel = path.join(process.resourcesPath, 'ipa-model');
    const ipaEnv = existsSync(ipaModel) ? { IPA_MODEL_DIR: ipaModel } : {};
```
and add `...ipaEnv` to the fork `env` spread.

- [ ] **Step 2: Bundle the model.** In `electron/builder.config.cjs` `extraResources`, add `{ from: 'vendor/ipa-model', to: 'ipa-model' }`.

- [ ] **Step 3: Handle the ONNX backend (per Task 1).** If Task 1 recorded that Transformers.js used native `onnxruntime-node` (`.node` files), ensure `@huggingface/transformers` + `onnxruntime-node` are NOT inlined by esbuild in `scripts/bundle.mjs` — add them to the server bundle's `external` list and `asarUnpack` the needed native files in `builder.config.cjs`. If it used the WASM backend, ensure the `.wasm`/`.mjs` runtime files are reachable (Transformers.js resolves them from its package; confirm they're packaged). Use the verifier (`node scripts/verify-ipa.mjs`) against the packaged layout to confirm.

- [ ] **Step 4: Build + verify packaging.** Run:
```bash
npm run build:desktop
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --config electron/builder.config.cjs
```
Confirm `release/win-unpacked/resources/ipa-model/` exists with the model files.

- [ ] **Step 5: Commit.**
```bash
git add electron/main.ts electron/builder.config.cjs scripts/bundle.mjs
git commit -m "feat(ipa): wire IPA_MODEL_DIR + bundle the phoneme model"
```

---

## Task 11: Full verification + finish branch

- [ ] **Step 1: Server suite.** Run: `npm test -w server` — Expected: all pass (gated IPA test skipped).
- [ ] **Step 2: Client suite.** Run: `npm test -w client` — Expected: all pass (incl. new `ipa` service test).
- [ ] **Step 3: Client build.** Run: `npm run build -w client` — Expected: clean (pre-existing WaveformCanvas warning only).
- [ ] **Step 4: Real-binary check.** Run: `node scripts/verify-ipa.mjs` — Expected: non-empty IPA. Then the packaged smoke test: launch `release/win-unpacked/Xenolinguist.exe`, record alien/gibberish speech → an IPA string appears even though whisper labels it a phonetic guess; run the phonetic-analysis task and confirm the AI reasons over the IPA.
- [ ] **Step 5: Finish.** Invoke superpowers:finishing-a-development-branch → open the `phonetic/ipa` PR (base `main`, no AI attribution). Note deferrals: per-phone segmentation, Sandbox IPA, mac/linux model vendoring.

---

## Self-Review (completed during authoring)

**Spec coverage:** §4.1 config → Task 3. §4.2 service → Task 4. §4.3 route + §app wiring → Task 5. §4.4 Sample.ipa → Task 2. §4.5 client service → Task 6. §4.6 capture wiring → Task 7. §4.7 IPA badge → Task 7. §4.8 AI feeding + phoneticAnalysis → Task 8. §4.9 decode view → Task 9. §4.10 Electron env → Task 10. §4.11 packaging/.gitattributes → Tasks 1 (gitattributes/vendor) + 10 (extraResources). §5 spike → Task 1. §7 testing → Tasks 3–6, 8 + gated/verifier in 1, 4, 11. §0.1 prerequisite → Task 0.

**Placeholder scan:** `MODEL_ID = 'wav2vec2-espeak'` is a concrete default the spike (Task 1) confirms/renames in one place (service + verifier + notes) — flagged explicitly, not a TBD. Task 10 Step 3 branches on the Task-1-recorded backend; both branches have concrete actions. No "TODO"/"handle edge cases" placeholders.

**Type consistency:** `transcribePhones` — server `({ wav })`, client `(blob)` (distinct modules, intentional). `Sample.ipa: string | null` (Task 2) used in capture (Task 7), prompts (Task 8), decode view (Task 9). `onRecordingComplete` extended once (Task 7) with trailing `ipa?: string`. `AITask` union gains `'phoneticAnalysis'` (Task 8) and is mirrored in `TASK_WEIGHTS` (same task) — called out in Task 8 Step 4 to avoid the `Record<AITask, …>` tsc error.
