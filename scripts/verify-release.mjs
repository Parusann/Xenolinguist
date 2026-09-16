import { verifyArtifact } from './verify-artifact-layout.mjs';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { desktopRequest } from './desktop-request.mjs';
// Run a packaged/installed release outside the source tree, in isolated desktop data.
import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rename } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { root, hashFile, inventory, sourceIdentity, saveRecord } from './verification-record.mjs';

const args = process.argv.slice(2);
const standalone = args.includes('--standalone');
if (standalone) {
  if (existsSync(path.join(root, '.git'))) throw Error('Standalone verification must have no source checkout');
  const require = createRequire(import.meta.url);
  for (const dependency of ['@huggingface/transformers', 'onnxruntime-node', 'express']) {
    try { require.resolve(dependency); throw Error('Standalone harness can resolve source dependency: ' + dependency); }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
}
const source = standalone ? JSON.parse(await readFile(path.join(root, 'source.json'), 'utf8')) : sourceIdentity();
if (standalone && process.env.GITHUB_SHA && source.revision !== process.env.GITHUB_SHA) throw Error('Harness source differs from workflow revision');
const executable = args[0];
if (!executable) throw new Error('Usage: node scripts/verify-release.mjs <unpacked executable outside repo> [report.json]');
const resolved = await realpath(executable);
const relative = path.relative(await realpath(root), resolved);
if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Copy/build the unpacked artifact outside the repository first');
const resources = path.join(path.dirname(resolved), 'resources');
const dir = await mkdtemp(path.join(os.tmpdir(), 'xeno-acceptance-desktop-'));
const token = randomBytes(16).toString('hex');
await writeFile(path.join(dir, '.xeno-test-token'), token);
const reportFile = path.resolve(args[1] ?? path.join(root, 'test-results/release-report.json'));
await mkdir(path.dirname(reportFile), { recursive: true });
const record = { source, standalone, executable: await hashFile(resolved),
  appArchive: await hashFile(path.join(resources, 'app.asar')),
  lockfile: await hashFile(path.join(root, standalone ? 'source-package-lock.json' : 'package-lock.json')),
  modelFiles: await inventory(path.join(resources, 'ipa-model')),
  whisperFiles: await inventory(path.join(resources, 'whisper')),
  runtimeFiles: await inventory(path.join(resources, 'server-deps')),
  isolatedUserData: dir, integrationCoverage: {
    nativeAudio: 'required: bundled STT, TTS and phones must succeed',
    localChat: { status: 'not-run', reason: 'Ollama is deliberately unavailable in this isolated acceptance run. Run npm run verify:local-model separately on a host with installed local models.' },
  }, checks: {}, console: [] };
let app;
let hiddenModel;
try {
  const artifactManifest = args.find(arg => arg.startsWith('--artifact-manifest='))?.slice('--artifact-manifest='.length);
  if (standalone && !artifactManifest) throw Error('Standalone release check requires the build artifact manifest');
  if (artifactManifest) {
    record.checks.artifactLayout = await verifyArtifact(path.dirname(resolved), artifactManifest);
    expect(record.checks.artifactLayout.source.revision).toBe(source.revision);
    const metadata = JSON.parse(await readFile(artifactManifest, 'utf8'));
    expect(metadata.lockSha256).toBe(record.lockfile.sha256);
  }
  // These paired credentials opt into isolation; normal launches ignore DATA_DIR.
  const launchEnv = { ...process.env, XENO_TEST_MODE: '1', XENO_TEST_TOKEN: token,
    OLLAMA_BASE_URL: 'http://127.0.0.1:1', NODE_PATH: '', NODE_OPTIONS: '' };
  // Even an empty ELECTRON_RUN_AS_NODE switches Electron into Node CLI mode.
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: resolved, cwd: dir,
    args: [`--xeno-test-user-data=${dir}`, '--use-fake-device-for-media-stream'],
    env: launchEnv, timeout: 40_000 });
  app.process().stdout?.on('data', data => record.console.push(data.toString()));
  app.process().stderr?.on('data', data => record.console.push(data.toString()));
  record.runtime = await app.evaluate(({ app }) => ({ versions: process.versions, packaged: app.isPackaged, userData: app.getPath('userData') }));
  if (!record.runtime.packaged || path.resolve(record.runtime.userData) !== path.resolve(dir)) throw new Error('Desktop isolation check failed');
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.waitForURL(/http:\/\/127\.0\.0\.1:\d+/);
  const origin = new URL(page.url()).origin;
  expect((await page.request.get(`${origin}/api/health`)).status()).toBe(401);
  expect((await page.request.post(`${origin}/api/audio/stages`, { data: 'unauthorized' })).status()).toBe(401);
  expect((await desktopRequest(page).get(`${origin}/api/health`)).status()).toBe(200);
  const boundary = await app.evaluate(async ({ BrowserWindow }, origin) => {
    const primary = BrowserWindow.getAllWindows()[0];
    const prefs = primary.webContents.getLastWebPreferences();
    const other = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    try {
      await other.loadURL(origin);
      const otherWindowStatus = await other.webContents.executeJavaScript("fetch('/api/health').then(r => r.status)");
      return { otherWindowStatus, sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration, webSecurity: prefs.webSecurity };
    } finally { other.destroy(); }
  }, origin);
  expect(boundary).toEqual({ otherWindowStatus: 401, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true });
  await page.evaluate(() => { window.open('https://untrusted.example/'); location.href = 'file:///untrusted.html'; });
  // A subsequent app API request proves the blocked navigation left the trusted document usable.
  expect((await desktopRequest(page).get(`${origin}/api/health`)).status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(origin);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  record.checks.localBoundary = { ...boundary, anonymousHealth: 401, anonymousBinary: 401, trustedHealth: 200, foreignNavigationBlocked: true, popupDenied: true };
  const media = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioTracks = stream.getAudioTracks().length;
    stream.getTracks().forEach(track => track.stop());
    let cameraDenied = false;
    try { const camera = await navigator.mediaDevices.getUserMedia({ video: true }); camera.getTracks().forEach(track => track.stop()); } catch { cameraDenied = true; }
    return { audioTracks, cameraDenied };
  });
  expect(media).toEqual({ audioTracks: 1, cameraDenied: true });
  record.checks.localBoundary.syntheticMicrophone = media;
  const request = async (route, body) => {
    const response = await desktopRequest(page).post(origin + route, { data: body, timeout: 180_000 });
    return { status: response.status(), body: await response.json() };
  };
  const wav = await readFile(path.join(root, 'server/src/__tests__/fixtures/hello-16k.wav'));
  record.fixture = await hashFile(path.join(root, 'server/src/__tests__/fixtures/hello-16k.wav'));
  record.checks.runtimeCapabilities = await (await desktopRequest(page).get(origin + '/api/ollama/capabilities')).json();
  for (const key of ['storage', 'tts', 'stt', 'phones']) expect(record.checks.runtimeCapabilities[key].state).toBe('available');
  expect(record.checks.runtimeCapabilities.chat.state).toBe('unavailable');
  // Keep the original renderer request open while cancelling the actual spawned native process.
  await page.evaluate(audio => {
    window.__phoneCancellation = fetch('/api/ipa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio }) }).then(async response => ({ status: response.status, body: await response.json() }));
  }, wav.toString('base64'));
  let cancelledJob;
  await expect.poll(async () => {
    const current = await (await desktopRequest(page).get(origin + '/api/jobs')).json();
    cancelledJob = current.jobs.find(job => job.state === 'running' && job.task === 'Phone analysis' && job.progress?.status === 'Native phone process started');
    return !!cancelledJob;
  }, { intervals: [10, 20, 50], timeout: 10000 }).toBe(true);
  const cancelStatus = await page.evaluate(async id => (await fetch('/api/jobs/' + id, { method: 'DELETE' })).status, cancelledJob.id);
  expect(cancelStatus).toBe(202);
  const cancelled = await page.evaluate(() => window.__phoneCancellation);
  expect(cancelled.status).toBe(409); expect(cancelled.body.code).toBe('JOB_CANCELLED');
  record.checks.nativeJobCancellation = { nativeProcessStarted: true, status: cancelled.status, code: cancelled.body.code };
  record.checks.ipa = await request('/api/ipa', { audio: wav.toString('base64') });
  if (record.checks.ipa.status === 200) {
    expect(record.checks.ipa.body.ipa.length).toBeGreaterThan(0);
    expect(record.checks.ipa.body.segments.length).toBeGreaterThan(0);
    expect(record.checks.ipa.body.identity.alphabet).toBe('TIMIT ARPABET');
    expect(record.checks.ipa.body.identity.modelSha256).toBe(record.modelFiles.find(file => file.file.endsWith('.onnx')).sha256);
  }
  record.checks.stt = await request('/api/stt', { audio: wav.toString('base64') });
  expect(record.checks.stt.status).toBe(200); expect(record.checks.stt.body.text.trim().length).toBeGreaterThan(0);
  const speech = await desktopRequest(page).post(origin + '/api/tts', { data: { text: 'Hello from the local workbench' } });
  const speechBytes = await speech.body();
  expect(speech.status()).toBe(200); expect(speechBytes.subarray(0, 4).toString()).toBe('RIFF'); expect(speechBytes.length).toBeGreaterThan(44);
  record.checks.tts = { status: speech.status(), bytes: speechBytes.length, wav: true };
  record.checks.wavUpload = await request('/api/audio/upload', { id: 'release-fixture', data: wav.toString('base64') });
  const profile = await request('/api/profiles', { name: 'Release smoke' });
  if (profile.status !== 201) throw new Error('Release profile creation failed');
  await page.addInitScript(() => localStorage.setItem('xenolinguist-tour-completed', '1'));
  await page.goto(`${origin}/app`);
  await page.getByRole('button', { name: /Release smoke/ }).click();
  await page.getByPlaceholder('Enter unknown language text… e.g. nesh tor krash.').fill('Packaged sample');
  const save = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(profile.body.id + '/mutations'));
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  record.checks.sampleSave = { status: (await save).status() };
  const persisted = JSON.parse(await readFile(path.join(dir, 'data/profiles', `${profile.body.id}.json`), 'utf8'));
  record.checks.sampleOnDisk = persisted.samples.some(sample => sample.alien_text === 'Packaged sample');
  await expect(page.getByText('Packaged sample', { exact: true })).toBeVisible();
  const screenshot = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
  if (screenshot) await writeFile(reportFile.replace(/\.json$/, '') + '.png', Buffer.from(screenshot, 'base64'));
  record.checks.loadedWorkbench = await page.getByText('Packaged sample', { exact: true }).isVisible();
  // Exercise the real close handshake with a recoverable failed save, then restart on a new port.
  await page.route('**/api/profiles/*/mutations', route => route.fulfill({ status: 500, json: { error: 'Injected offline save', code: 'TEST_FAILURE' } }));
  await page.getByPlaceholder('Enter unknown language text… e.g. nesh tor krash.').fill('Recovered after desktop close');
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  await expect(page.getByText('Save failed', { exact: true })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles({ name: 'desktop-original.wav', mimeType: 'audio/wav', buffer: wav });
  await expect(page.getByText(/desktop-original.wav/)).toBeVisible();
  await page.getByPlaceholder('IPA, tone markers').fill('Native audio draft');
  await page.locator('[data-tour="translation"]').click();
  await page.getByPlaceholder('Enter unknown language text to translate…').fill('Draft across desktop origins');
  await expect.poll(async () => {
    const local = JSON.parse(await readFile(path.join(dir, 'pending-saves', `${profile.body.id}.json`), 'utf8'));
    return local.batches.length > 0 && local.drafts['translation.alien'] === 'Draft across desktop origins';
  }).toBe(true);
  // Deterministic generator output exercises session persistence, not generation quality.
  const sandboxProfile = await request('/api/profiles', { name: 'Native practice', is_sandbox: true });
  expect(sandboxProfile.status).toBe(201);
  await page.route('**/api/ollama/status', route => route.fulfill({ json: { connected: true, ready: true, models: ['fixture-model'] } }));
  const practiceFixture = { language_name: 'Native fixture', phoneme_set: ['a'], number_base: 10, word_order: 'SVO', rules: ['Subject first'],
    number_words: { 1: 'ka', 2: 'ki', 3: 'ku' }, vocabulary: [{ alien: 'tal', english: 'sky', pos: 'noun' }], sample_sentences: [{ alien: 'tal', english: 'sky' }] };
  await page.route('**/api/ai/stream', route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ token: JSON.stringify(practiceFixture) })}\n\ndata: [DONE]\n\n` }));
  await page.goto(`${origin}/app`);
  await page.getByRole('button').filter({ has: page.getByText('Native practice', { exact: true }) }).click();
  await page.getByRole('button', { name: 'Generate & Start Decoding' }).click();
  const number = page.locator('[data-challenge="number-0"]');
  await number.getByRole('textbox').fill('1cat'); await number.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(number.getByRole('status')).toContainText('Not matched');
  await number.getByRole('button', { name: 'Hint', exact: true }).click();
  await number.getByRole('textbox').fill('unfinished number');
  await expect(page.getByText('Save failed', { exact: true })).toBeVisible();
  let sandboxBeforeClose;
  await expect.poll(async () => {
    const local = JSON.parse(await readFile(path.join(dir, 'pending-saves', `${sandboxProfile.body.id}.json`), 'utf8'));
    sandboxBeforeClose = local.batches.at(-1)?.after.sandbox_session;
    return sandboxBeforeClose?.guesses['number-0'] === 'unfinished number' && sandboxBeforeClose.events.length === 2;
  }).toBe(true);
  // Simulate the explicit "Close anyway" choice only in this isolated acceptance app.
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  const closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  app = undefined;
  await expect.poll(async () => { try { await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) }); return false; } catch { return true; } }).toBe(true);
  app = await electron.launch({ executablePath: resolved, cwd: dir, args: [`--xeno-test-user-data=${dir}`], env: launchEnv, timeout: 40_000 });
  const reopened = await app.firstWindow();
  reopened.setDefaultTimeout(20_000);
  await reopened.waitForURL(/http:\/\/127\.0\.0\.1:\d+/);
  const newOrigin = new URL(reopened.url()).origin;
  expect((await desktopRequest(reopened).get(`${newOrigin}/api/health`)).status()).toBe(200);
  expect((await reopened.request.get(`${newOrigin}/api/health`)).status()).toBe(401);
  record.checks.localBoundary.relaunchAuthenticated = true;
  await reopened.addInitScript(() => localStorage.setItem('xenolinguist-tour-completed', '1'));
  await reopened.goto(`${newOrigin}/app`);
  await reopened.getByRole('button').filter({ has: reopened.getByText('Release smoke', { exact: true }) }).click();
  await expect(reopened.getByPlaceholder('Enter unknown language text to translate…')).toHaveValue('Draft across desktop origins');
  await expect(reopened.getByText('Saved', { exact: true })).toBeVisible();
  const afterRestart = await (await desktopRequest(reopened).get(`${newOrigin}/api/profiles/${profile.body.id}`)).json();
  record.checks.pendingSaveRecovered = afterRestart.samples.filter(sample => sample.alien_text === 'Recovered after desktop close').length === 1;
  record.checks.desktopDraftRecovered = true;
  await reopened.locator('[data-tour="samples"]').click();
  await expect(reopened.getByText(/desktop-original.wav ·/)).toBeVisible();
  await expect(reopened.getByPlaceholder('IPA, tone markers')).toHaveValue('Native audio draft');
  record.checks.desktopAudioDraftRecovered = true;
  await reopened.getByRole('button', { name: 'Analyze phones', exact: true }).click();
  await expect(reopened.getByPlaceholder('Label this word...').first()).toBeVisible({ timeout: 120_000 });
  await reopened.getByRole('button', { name: 'Add Sample', exact: true }).click();
  await expect(reopened.getByRole('button', { name: 'Discard audio draft' })).toHaveCount(0);
  const withAudio = await (await desktopRequest(reopened).get(`${newOrigin}/api/profiles/${profile.body.id}`)).json();
  const clip = withAudio.audio_clips[0];
  const original = await desktopRequest(reopened).get(`${newOrigin}/api/audio/${clip.id}`);
  const originalHash = createHash('sha256').update(await original.body()).digest('hex');
  expect(originalHash).toBe(record.fixture.sha256);
  expect(clip.assets.original.sha256).toBe(originalHash);
  expect(withAudio.samples.find(sample => sample.audio_id === clip.id).ipa.length).toBeGreaterThan(0);
  await reopened.getByRole('button', { name: 'Play audio', exact: true }).click();
  await expect(reopened.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  await reopened.getByRole('button', { name: 'Pause audio', exact: true }).click();
  record.checks.desktopAudioSaved = { originalHash, assets: clip.assets, phoneSegments: clip.segments.length, playback: true };
  await reopened.goto(`${newOrigin}/app`);
  await reopened.getByRole('button').filter({ has: reopened.getByText('Native practice', { exact: true }) }).click();
  const recoveredNumber = reopened.locator('[data-challenge="number-0"]');
  await expect(recoveredNumber.getByRole('textbox')).toHaveValue('unfinished number');
  await expect(recoveredNumber.getByRole('status')).toContainText('Not matched');
  await expect(reopened.getByText('Saved', { exact: true })).toBeVisible();
  const sandboxRestored = await (await desktopRequest(reopened).get(`${newOrigin}/api/profiles/${sandboxProfile.body.id}`)).json();
  const recoveredProposal = sandboxRestored.ai_history?.find(message => message.task === 'conlangGeneration');
  expect(recoveredProposal?.state).toBe('complete');
  expect(recoveredProposal?.model).toBe('fixture-model');
  record.checks.desktopAIHistoryRecovered = { state: recoveredProposal.state, task: recoveredProposal.task, fixtureGeneration: true };
  expect(sandboxRestored.sandbox_session).toEqual(sandboxBeforeClose);
  await recoveredNumber.getByRole('textbox').fill('1'); await recoveredNumber.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(reopened.getByText('Saved', { exact: true })).toBeVisible();
  const sandboxSaved = await (await desktopRequest(reopened).get(`${newOrigin}/api/profiles/${sandboxProfile.body.id}`)).json();
  expect(sandboxSaved.dictionary).toHaveLength(1); expect(sandboxSaved.sandbox_session.events).toHaveLength(3);
  record.checks.desktopSandboxRecovered = { sameSession: sandboxRestored.sandbox_session.id === sandboxBeforeClose.id,
    restoredEvents: sandboxRestored.sandbox_session.events.length, afterRetryEvents: sandboxSaved.sandbox_session.events.length,
    dictionaryEntries: sandboxSaved.dictionary.length, fixtureGeneration: true };
  expect(sandboxSaved.dictionary[0]).toMatchObject({ confidence: null, user_asserted_confidence: null });
  expect(sandboxSaved.metric_snapshots.at(-1).counts).toMatchObject({ assertedEntries: 1, ratedEntries: 0, mappings1To20: 1 });
  await reopened.locator('[data-tour="dashboard"]').click();
  await expect(reopened.getByText('Saved metric history', { exact: true })).toBeVisible();
  await expect(reopened.getByText('Tested linguistic hypotheses: unavailable')).toBeVisible();
  record.checks.desktopEvidenceMetrics = { unratedAssertion: true, historyVisible: true, latestSnapshot: sandboxSaved.metric_snapshots.at(-1) };
  const archiveChecks = [];
  for (const sourceProfile of [withAudio, sandboxSaved]) {
    const restored = await reopened.evaluate(async source => {
      const exported = await fetch(`/api/archives/export/${source.id}?revision=${source.revision}&sandbox=true`);
      if (!exported.ok) throw new Error(`Archive export failed: ${exported.status}`);
      const bytes = await exported.arrayBuffer();
      const inspected = await fetch('/api/archives/inspect', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
      if (!inspected.ok) throw new Error(`Archive inspection failed: ${inspected.status}`);
      const preview = await inspected.json();
      const committed = await fetch(`/api/archives/${preview.token}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'new' }) });
      if (!committed.ok) throw new Error(`Archive restore failed: ${committed.status}`);
      return { bytes: bytes.byteLength, preview, ...(await committed.json()) };
    }, sourceProfile);
    expect(restored.profile.id).not.toBe(sourceProfile.id);
    expect(restored.profile.metric_snapshots).toEqual(sourceProfile.metric_snapshots);
    expect(restored.profile.ai_history?.map(item => item.content)).toEqual(sourceProfile.ai_history?.map(item => item.content));
    if (sourceProfile.sandbox_session) {
      expect(restored.profile.sandbox_session.challenges).toEqual(sourceProfile.sandbox_session.challenges);
      expect(restored.profile.sandbox_session.events.map(({ id: _id, ...event }) => event)).toEqual(sourceProfile.sandbox_session.events.map(({ id: _id, ...event }) => event));
    }
    let restoredAudioHash;
    if (sourceProfile.audio_clips.length) {
      const restoredClip = restored.profile.audio_clips[0];
      expect(restored.profile.samples.some(sample => sample.audio_id === restoredClip.id)).toBe(true);
      const response = await desktopRequest(reopened).get(`${newOrigin}/api/audio/${restoredClip.id}`);
      restoredAudioHash = createHash('sha256').update(await response.body()).digest('hex');
      expect(restoredAudioHash).toBe(record.fixture.sha256);
      expect(restoredClip.assets).toEqual(sourceProfile.audio_clips[0].assets);
    }
    archiveChecks.push({ bytes: restored.bytes, counts: restored.preview.counts, sandboxIncluded: true, restoredAudioHash });
  }
  record.checks.portableArchives = { passed: true, projects: archiveChecks };
  record.restart = { firstOrigin: origin, secondOrigin: newOrigin, revision: afterRestart.revision };
  if (args.includes('--negative-model')) {
    // Only an explicitly requested, isolated temporary acceptance build may be modified.
    const temporaryRelative = path.relative(await realpath(os.tmpdir()), resolved);
    if (!/^xeno-acceptance-[^\\/]+[\\/]/.test(temporaryRelative)) throw new Error('Negative model test requires an xeno-acceptance-* build under the system temp directory');
    await app.close(); app = undefined;
    await expect.poll(async () => { try { await fetch(`${newOrigin}/api/health`, { signal: AbortSignal.timeout(500) }); return false; } catch { return true; } }).toBe(true);
    const model = path.join(resources, 'ipa-model/wav2vec2-phoneme/onnx/model.onnx');
    const hidden = `${model}.${token}.negative-test`;
    await rename(model, hidden);
    hiddenModel = { model, hidden };
    app = await electron.launch({ executablePath: resolved, cwd: dir, args: [`--xeno-test-user-data=${dir}`], env: launchEnv, timeout: 40_000 });
    const negativePage = await app.firstWindow();
    await negativePage.waitForURL(/http:\/\/127\.0\.0\.1:\d+/);
    const negativeOrigin = new URL(negativePage.url()).origin;
    const negative = await desktopRequest(negativePage).post(`${negativeOrigin}/api/ipa`, { data: { audio: wav.toString('base64') } });
    record.checks.missingModel = { status: negative.status(), body: await negative.json() };
    expect(record.checks.missingModel.status).toBe(503);
    expect(record.checks.missingModel.body.code).toBe('IPA_MODEL_MISSING');
    await app.close(); app = undefined;
    await rename(hiddenModel.hidden, model); hiddenModel = undefined;
  }
  record.acceptancePassed = record.checks.ipa.status === 200 && record.checks.stt.status === 200 && record.checks.tts.status === 200
    && record.checks.wavUpload.status === 200 && record.checks.sampleSave.status === 200
    && record.checks.sampleOnDisk && record.checks.loadedWorkbench
    && record.checks.pendingSaveRecovered && record.checks.desktopDraftRecovered && record.checks.portableArchives?.passed
    && record.checks.nativeJobCancellation?.nativeProcessStarted && record.checks.localBoundary?.relaunchAuthenticated && record.checks.desktopEvidenceMetrics?.historyVisible && record.checks.desktopAudioDraftRecovered && record.checks.desktopAudioSaved?.playback && record.checks.desktopSandboxRecovered?.sameSession;
  if (!record.acceptancePassed) process.exitCode = 1;
} catch (error) {
  record.failure = { message: error.message, stack: error.stack };
  record.acceptancePassed = false;
  process.exitCode = 1;
} finally {
  // Release the isolated process even if a failure preceded the dialog override.
  if (app) await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }).catch(() => {});
  try { await app?.close(); }
  finally {
    try { if (hiddenModel) await rename(hiddenModel.hidden, hiddenModel.model); }
    finally { await saveRecord(reportFile, record); }
  }
}
