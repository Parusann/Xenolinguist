// Native whisper verification runs outside Vitest's Windows worker process.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { root, sourceIdentity, hashFile, inventory, saveRecord } from './verification-record.mjs';

const win = path.join(root, 'vendor/whisper/win');
const bin = path.join(win, 'whisper-cli.exe');
const model = path.join(win, 'ggml-base-q5_1.bin');
const wav = path.join(root, 'server/src/__tests__/fixtures/hello-16k.wav');
const record = { source: sourceIdentity(), fixture: await hashFile(wav), runtimeFiles: await inventory(win) };
try {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'xeno-acceptance-stt-'));
  record.isolatedDirectory = dir;
  const outBase = path.join(dir, 'out');
  await writeFile(path.join(dir, 'in.wav'), await readFile(wav));
  const execution = await new Promise((resolve, reject) => {
    const proc = spawn(bin, ['-m', model, '-f', path.join(dir, 'in.wav'), '-oj', '-of', outBase, '-l', 'auto'], { cwd: win, windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Whisper exceeded 120 seconds')); }, 120_000);
    proc.stderr.on('data', data => { stderr += data.toString(); });
    proc.stdout.resume();
    proc.once('error', error => { clearTimeout(timer); reject(error); });
    proc.once('close', code => { clearTimeout(timer); resolve({ code, stderr }); });
  });
  record.execution = execution;
  if (execution.code !== 0) throw new Error(`Whisper exited ${execution.code}`);
  const result = JSON.parse(await readFile(`${outBase}.json`, 'utf8'));
  const text = (result.transcription ?? []).map(segment => (segment.text ?? '').trim()).join(' ').trim();
  const languageProb = Number(execution.stderr.match(/auto-detected language:\s*\w+\s*\(p\s*=\s*([0-9.]+)/i)?.[1] ?? 0);
  record.result = { language: result.result?.language ?? '', languageProb, text,
    mode: text && languageProb >= 0.6 ? 'transcription' : 'phonetic-guess' };
  if (!text) throw new Error('Whisper produced an empty transcription');
  record.passed = true;
  console.log(record.result);
} catch (error) {
  record.passed = false;
  record.failure = { code: error.code, message: error.message };
  process.exitCode = 1;
} finally {
  await saveRecord(path.join(root, 'test-results/stt-node.json'), record);
}
