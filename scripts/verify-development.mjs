// Exercise the real Vite proxy and direct development entry using synthetic data.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { root } from './verification-record.mjs';

for (const [port, host] of [[3001, '127.0.0.1'], [5173, 'localhost']]) {
  await new Promise((resolve, reject) => {
    const probe = createServer(); probe.once('error', reject);
    probe.listen(port, host, () => probe.close(resolve));
  });
}
const dataDir = await mkdtemp(path.join(tmpdir(), 'xeno-acceptance-development-'));
const processes = [];
let browser, output = '';
const launch = (args, cwd) => {
  const child = spawn(process.execPath, args, { cwd, windowsHide: true, env: { ...process.env, NODE_ENV: 'development', DATA_DIR: dataDir, PORT: '3001', OLLAMA_BASE_URL: 'http://127.0.0.1:1', XENO_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { output += data.toString(); });
  child.stderr.on('data', data => { output += data.toString(); });
  processes.push(child);
};
try {
  launch(['--import', 'tsx', 'server/src/index.ts'], root);
  launch([path.join(root, 'node_modules/vite/bin/vite.js')], path.join(root, 'client'));
  let secret;
  await expect.poll(async () => {
    try { secret = await readFile(path.join(dataDir, '.development-pairing'), 'utf8'); return (await fetch('http://localhost:5173')).ok; } catch { await sleep(100); return false; }
  }, { timeout: 30_000 }).toBe(true);
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('xenolinguist-tour-completed', '1'));
  expect((await page.request.get('http://localhost:5173/api/health')).status()).toBe(401);
  await page.goto('http://localhost:5173/app');
  await expect(page.getByRole('heading', { name: 'Local connection' })).toBeVisible();
  await page.getByLabel('Development pairing code').fill(secret);
  await page.getByRole('button', { name: 'Pair browser', exact: true }).click();
  await expect(page.getByRole('button', { name: /New Language/ })).toBeVisible();
  expect((await page.request.post('http://localhost:5173/api/profiles', { data: { name: 'Development boundary probe' } })).status()).toBe(201);
  await page.reload();
  expect((await page.request.get('http://localhost:5173/api/health')).status()).toBe(200);
  expect(await page.evaluate(() => document.cookie)).not.toContain(secret);
  expect(output).not.toContain(secret);
  console.log('Development pairing, authenticated mutation, reload, HttpOnly cookie and secret-free startup logs passed.');
} finally {
  await browser?.close();
  await Promise.all(processes.map(child => new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); })));
}
