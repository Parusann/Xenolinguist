// Run an unpacked release outside the source tree, in an isolated desktop data directory.
import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { root, hashFile, inventory, sourceIdentity, saveRecord } from './verification-record.mjs';

const args = process.argv.slice(2);
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
const record = { source: sourceIdentity(), executable: await hashFile(resolved),
  appArchive: await hashFile(path.join(resources, 'app.asar')),
  lockfile: await hashFile(path.join(root, 'package-lock.json')),
  modelFiles: await inventory(path.join(resources, 'ipa-model')),
  whisperFiles: await inventory(path.join(resources, 'whisper')),
  isolatedUserData: dir, checks: {}, console: [] };
let app;
try {
  // These paired credentials opt into isolation; normal launches ignore DATA_DIR.
  const launchEnv = { ...process.env, XENO_TEST_MODE: '1', XENO_TEST_TOKEN: token,
    OLLAMA_BASE_URL: 'http://127.0.0.1:1', NODE_PATH: '', NODE_OPTIONS: '' };
  // Even an empty ELECTRON_RUN_AS_NODE switches Electron into Node CLI mode.
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: resolved, cwd: dir,
    args: [`--xeno-test-user-data=${dir}`],
    env: launchEnv, timeout: 40_000 });
  app.process().stdout?.on('data', data => record.console.push(data.toString()));
  app.process().stderr?.on('data', data => record.console.push(data.toString()));
  record.runtime = await app.evaluate(({ app }) => ({ versions: process.versions, packaged: app.isPackaged, userData: app.getPath('userData') }));
  if (!record.runtime.packaged || path.resolve(record.runtime.userData) !== path.resolve(dir)) throw new Error('Desktop isolation check failed');
  const page = await app.firstWindow();
  await page.waitForURL(/http:\/\/127\.0\.0\.1:\d+/);
  const origin = new URL(page.url()).origin;
  const request = async (route, body) => {
    const response = await page.request.post(origin + route, { data: body, timeout: 180_000 });
    return { status: response.status(), body: await response.json() };
  };
  const wav = await readFile(path.join(root, 'server/src/__tests__/fixtures/hello-16k.wav'));
  record.fixture = await hashFile(path.join(root, 'server/src/__tests__/fixtures/hello-16k.wav'));
  record.checks.ipa = await request('/api/ipa', { audio: wav.toString('base64') });
  record.checks.stt = await request('/api/stt', { audio: wav.toString('base64') });
  record.checks.wavUpload = await request('/api/audio/upload', { id: 'release-fixture', data: wav.toString('base64') });
  const profile = await request('/api/profiles', { name: 'Release smoke' });
  if (profile.status !== 201) throw new Error('Release profile creation failed');
  await page.addInitScript(() => localStorage.setItem('xenolinguist-tour-completed', '1'));
  await page.goto(`${origin}/app`);
  await page.getByRole('button', { name: /Release smoke/ }).click();
  await page.getByPlaceholder('Enter unknown language text… e.g. nesh tor krash.').fill('Packaged sample');
  const save = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith(profile.body.id));
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  record.checks.sampleSave = { status: (await save).status() };
  const persisted = JSON.parse(await readFile(path.join(dir, 'data/profiles', `${profile.body.id}.json`), 'utf8'));
  record.checks.sampleOnDisk = persisted.samples.some(sample => sample.alien_text === 'Packaged sample');
  const screenshot = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  if (screenshot) await writeFile(reportFile.replace(/\.json$/, '') + '.png', Buffer.from(screenshot, 'base64'));
  record.checks.loadedWorkbench = await page.getByText('Packaged sample', { exact: true }).isVisible();
  record.acceptancePassed = record.checks.ipa.status === 200 && record.checks.stt.status === 200
    && record.checks.wavUpload.status === 200 && record.checks.sampleSave.status === 200
    && record.checks.sampleOnDisk && record.checks.loadedWorkbench;
  if (!record.acceptancePassed) process.exitCode = 1;
} catch (error) {
  record.failure = { message: error.message, stack: error.stack };
  record.acceptancePassed = false;
  process.exitCode = 1;
} finally {
  await app?.close();
  await saveRecord(reportFile, record);
}
