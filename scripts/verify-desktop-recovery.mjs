import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { desktopRequest } from './desktop-request.mjs';

/** Actual installed desktop: legacy bytes, abrupt backend exit, new credentials and offline controls. */
export async function verifyDesktopRecovery(executablePath, wav) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'xeno-acceptance-récupération-'));
  const token = randomBytes(16).toString('hex');
  await writeFile(path.join(dir, '.xeno-test-token'), token);
  await mkdir(path.join(dir, 'data/profiles'), { recursive: true });
  const legacy = JSON.stringify({ id: 'legacy-release', name: 'Legacy recovery', created_at: '2026-06-14T00:00:00.000Z', updated_at: '2026-06-14T00:00:00.000Z', description: 'Original notes', phonetic_notes: 'nasal vowels' }, null, 4) + '\r\n';
  const legacyFile = path.join(dir, 'data/profiles/legacy-release.json');
  await writeFile(legacyFile, legacy);
  const env = { ...process.env, XENO_TEST_MODE: '1', XENO_TEST_TOKEN: token, OLLAMA_BASE_URL: 'http://127.0.0.1:1', NODE_OPTIONS: '', NODE_PATH: '' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath, cwd: dir, args: [`--xeno-test-user-data=${dir}`, '--strict-offline'], env, timeout: 40000 });
    const page = await app.firstWindow(); page.setDefaultTimeout(20000);
    await page.waitForURL(/http:\/\/127\.0\.0\.1:\d+\/app/);
    await page.evaluate(() => localStorage.setItem('xenolinguist-tour-completed', '1'));
    const firstOrigin = new URL(page.url()).origin;
    const nativeRequests = [];
    await app.evaluate(({ session }) => {
      globalThis.__xenoNetwork = [];
      session.defaultSession.webRequest.onCompleted(details => { if (/^https?:/.test(details.url)) globalThis.__xenoNetwork.push(new URL(details.url).origin); });
    });
    const api = desktopRequest(page);
    const migrated = await (await api.get(firstOrigin + '/api/profiles/legacy-release')).json();
    expect(migrated.schema_version).toBe(3); expect(migrated.phonetic_notes).toBe('nasal vowels');
    expect(await readFile(legacyFile, 'utf8')).toBe(legacy);
    const put = await api.put(firstOrigin + '/api/profiles/legacy-release', { data: { revision: 0, description: 'Migrated notes' } });
    expect(put.status()).toBe(200);
    const backup = await readFile(legacyFile + '.v1.bak'); expect(backup.toString()).toBe(legacy);
    // A conflicting backup must block the first write, leaving original bytes intact.
    const conflict = legacy.replaceAll('legacy-release', 'legacy-conflict');
    const conflictFile = path.join(dir, 'data/profiles/legacy-conflict.json');
    await writeFile(conflictFile, conflict); await writeFile(conflictFile + '.v1.bak', 'different backup');
    expect((await api.put(firstOrigin + '/api/profiles/legacy-conflict', { data: { revision: 0, description: 'Rejected' } })).status()).toBe(409);
    expect(await readFile(conflictFile, 'utf8')).toBe(conflict);
    await page.reload();
    await page.getByRole('button').filter({ has: page.getByText('Legacy recovery', { exact: true }) }).first().click();
    const input = page.getByLabel('Unknown language sample', { exact: true });
    await input.fill('draft before backend crash');
    const before = await page.evaluate(() => window.xeno.backendStatus()); expect(before.strictOffline).toBe(true);
    const oldSecret = await app.evaluate(({ BrowserWindow }, origin) => new Promise(resolve => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      contents.session.webRequest.onSendHeaders(details => {
        if (details.url === origin + '/api/health') resolve(details.requestHeaders['X-Xeno-Session']);
      });
      void contents.executeJavaScript("fetch('/api/health').then(r=>r.status)");
    }), firstOrigin);
    expect(oldSecret).toMatch(/^[a-f0-9]{64}$/);
    const killed = await app.evaluate(({ app }) => {
      const child = app.getAppMetrics().find(item => item.name === 'Xenolinguist backend');
      if (!child) throw Error('Backend process identity missing'); process.kill(child.pid); return child.pid;
    });
    await expect(page.getByRole('button', { name: 'Restart local backend', exact: true })).toBeVisible();
    await input.fill('draft typed after backend crash');
    await page.getByRole('button', { name: 'Restart local backend', exact: true }).click();
    await expect.poll(async () => new URL(page.url()).origin).not.toBe(firstOrigin);
    const secondOrigin = new URL(page.url()).origin;
    await expect.poll(async () => (await desktopRequest(page).get(secondOrigin + '/api/health')).status()).toBe(200);
    expect((await page.request.get(secondOrigin + '/api/health', { headers: { 'X-Xeno-Session': oldSecret } })).status()).toBe(401);
    await page.evaluate(() => localStorage.setItem('xenolinguist-tour-completed', '1')); await page.reload();
    await page.getByRole('button').filter({ has: page.getByText('Legacy recovery', { exact: true }) }).first().click();
    await expect(page.getByLabel('Unknown language sample', { exact: true })).toHaveValue('draft typed after backend crash');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2));
    await expect(page.getByLabel('Unknown language sample', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Vocabulary', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('Search dictionary', { exact: true })).toBeVisible();
    const zoom = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()); expect(zoom).toBe(2);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
    const offline = await page.evaluate(async () => {
      let updateRejected = false, remoteRejected = false;
      try { await window.xeno.checkUpdates(); } catch { updateRejected = true; }
      try { await fetch('https://example.com/'); } catch { remoteRejected = true; }
      return { updateRejected, remoteRejected };
    }); expect(offline).toEqual({ updateRejected: true, remoteRejected: true });
    const download = await desktopRequest(page).post(secondOrigin + '/api/ollama/pull', { data: { model: 'gemma4:e4b', confirmed: true } }); expect(download.status()).toBe(403);
    const capabilities = await (await desktopRequest(page).get(secondOrigin + '/api/ollama/capabilities')).json();
    // Execute bundled speech while offline; do not infer success from file existence.
    const phones = await desktopRequest(page).post(secondOrigin + '/api/ipa', { data: { audio: wav.toString('base64') }, timeout: 120000 }); expect(phones.status()).toBe(200);
    const stt = await desktopRequest(page).post(secondOrigin + '/api/stt', { data: { audio: wav.toString('base64') }, timeout: 120000 }); expect(stt.status()).toBe(200);
    const tts = await desktopRequest(page).post(secondOrigin + '/api/tts', { data: { text: 'Offline speech verification' } }); expect(tts.status()).toBe(200);
    expect((await tts.body()).subarray(0, 4).toString()).toBe('RIFF');
    nativeRequests.push(...await app.evaluate(() => globalThis.__xenoNetwork));
    expect(nativeRequests.every(url => new URL(url).hostname === '127.0.0.1')).toBe(true);
    return { passed: true, nonAsciiUserData: true, migratedSchema: migrated.schema_version, originalReadPreserved: true, conflictingBackupRejected: true,
      backupSha256: createHash('sha256').update(backup).digest('hex'), backendKilled: killed > 0, credentialRotated: true, retainedDraftAfterCrash: true,
      zoomFactor: zoom, keyboardAtZoom: true, strictOffline: { ...offline, downloadsRejected: true, phones: phones.status(), stt: stt.status(), tts: tts.status(),
        completedChromiumOrigins: [...new Set(nativeRequests)], scope: 'Chromium completed requests; external Ollama and OS traffic are not captured.' }, capabilities };
  } finally {
    if (app) { await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }).catch(() => {}); await app.close(); }
  }
}
