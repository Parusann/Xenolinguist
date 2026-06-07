// Standalone verification that the vendored whisper.cpp binary + model actually transcribe
// the test fixture. Use this instead of the vitest gated test on Windows, where vitest's
// forked worker cannot spawn the multi-DLL whisper-cli.exe (works fine here in plain Node,
// which mirrors the production Electron-forked server). Run: `node scripts/verify-stt.mjs`.
import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN = path.join(ROOT, 'vendor', 'whisper', 'win');
const bin = path.join(WIN, 'whisper-cli.exe');
const model = path.join(WIN, 'ggml-base-q5_1.bin');
const wav = path.join(ROOT, 'server', 'src', '__tests__', 'fixtures', 'hello-16k.wav');
const MIN_LANGUAGE_PROB = 0.6; // keep in sync with server/src/services/stt-whisper.ts

for (const [label, p] of [['binary', bin], ['model', model], ['fixture', wav]]) {
  if (!existsSync(p)) { console.error(`MISSING ${label}: ${p}`); process.exit(1); }
}

const dir = mkdtempSync(path.join(os.tmpdir(), 'xeno-verify-stt-'));
const outBase = path.join(dir, 'out');
writeFileSync(path.join(dir, 'in.wav'), readFileSync(wav));

const proc = spawn(bin, ['-m', model, '-f', path.join(dir, 'in.wav'), '-oj', '-of', outBase, '-l', 'auto'], {
  cwd: path.dirname(bin),
});
let stderr = '';
proc.stderr.on('data', (d) => { stderr += d.toString(); });
proc.on('error', (e) => { console.error('SPAWN ERROR:', e.code, e.message); rmSync(dir, { recursive: true, force: true }); process.exit(1); });
proc.on('close', (code) => {
  try {
    if (code !== 0) { console.error('whisper exited', code); process.exit(1); }
    const j = JSON.parse(readFileSync(`${outBase}.json`, 'utf8'));
    const language = j.result?.language ?? '';
    const text = (j.transcription ?? []).map((s) => (s.text ?? '').trim()).join(' ').trim();
    const m = stderr.match(/auto-detected language:\s*\w+\s*\(p\s*=\s*([0-9.]+)\)/i);
    const languageProb = m ? Number(m[1]) : 0;
    const mode = text && languageProb >= MIN_LANGUAGE_PROB ? 'transcription' : 'phonetic-guess';
    console.log('language   :', language);
    console.log('languageProb:', languageProb);
    console.log('mode       :', mode);
    console.log('text       :', text);
    if (!text) { console.error('FAIL: empty transcription'); process.exit(1); }
    console.log('\nOK: bundled whisper.cpp transcribed the fixture.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
