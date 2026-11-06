import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { _electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { loadConfig } from './config.js';
import { testFixture } from './test-fixture.js';
import { syntheticComparison } from '../../evaluation/src/atlas/fixtures.js';
import { compareLanguages } from '../../engine/src/comparison/compare.js';

const config = await loadConfig(), output = process.argv[2];
if (process.platform !== 'win32' || !output || !path.resolve(output).startsWith(config.root + path.sep)) throw new Error('This verifier requires Windows and HDD result storage');
await mkdir(output, { recursive: true });
const fixture = await testFixture(config, true), root = await mkdtemp(path.join(config.root, 'temp', 'xeno-acceptance-atlas-'));
const acceptanceToken = randomBytes(16).toString('hex'), checks: string[] = [], pageErrors: string[] = [];
let desktop: ElectronApplication | undefined, backendLog = '';
const startDesktop = async () => {
  const electronEnv = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[0] !== 'ELECTRON_RUN_AS_NODE'));
  const application = await _electron.launch({ executablePath: path.join(config.source, 'node_modules/electron/dist/electron.exe'),
    args: [path.join(config.source, 'electron/dist/main.cjs'), '--research-workbench', '--xeno-test-user-data=' + root],
    env: { ...electronEnv, XENO_TEST_MODE: '1', XENO_TEST_TOKEN: acceptanceToken, XENO_TEST_ATLAS_ORIGIN: fixture.config.origin }, timeout: 45000 });
  desktop = application;
  application.process().stdout?.on('data', chunk => { backendLog += chunk.toString(); });
  application.process().stderr?.on('data', chunk => { backendLog += chunk.toString(); });
  const page = await application.firstWindow(); page.on('pageerror', error => pageErrors.push(error.message)); page.setDefaultTimeout(10000);
  await page.addInitScript(() => localStorage.setItem('xenolinguist-tour-completed', '1'));
  await page.waitForURL('**/app', { timeout: 45000 }); await page.waitForLoadState('load');
  await page.evaluate(() => localStorage.setItem('xenolinguist-tour-completed', '1')); return { application, page };
};
const openProfile = async (page: Page, name: string) => {
  await page.getByRole('button').filter({ has: page.getByText(name, { exact: true }) }).click(); await expect(page.getByRole('banner')).toContainText(name);
};
try {
  await writeFile(path.join(root, '.xeno-test-token'), acceptanceToken, { mode: 0o600 });
  const auth = await fetch(fixture.config.origin + '/api/auth/sign-up/email', { method: 'POST', headers: { Origin: fixture.config.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Desktop acceptance', email: 'desktop-' + randomBytes(6).toString('hex') + '@example.invalid', password: randomBytes(24).toString('hex') }) });
  assert.equal(auth.status, 200); const user = (await auth.json()).user, cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const atlasRequest = async (route: string, method = 'GET', body?: unknown) => {
    const response = await fetch(fixture.config.origin + route, { method, headers: { Origin: fixture.config.origin, Cookie: cookie,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert(response.ok, 'Atlas fixture request failed'); return response.json();
  };
  let launch = await startDesktop(); desktop = launch.application; let page = launch.page;
  const local = (route: string, method = 'GET', body?: unknown) => page.evaluate(async request => {
    const response = await fetch(request.route, { method: request.method,
      ...(request.body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) }) });
    if (!response.ok) throw new Error('Desktop fixture request failed: ' + response.status); return response.json();
  }, { route, method, body });
  const catalog = await atlasRequest('/api/reference-languages'), english = catalog.find((language: { id: string }) => language.id === 'English');
  const stamp = new Date().toISOString();
  const profile = await local('/api/profiles', 'POST', { name: 'Atlas desktop acceptance', dictionary: english.entries.slice(0, 8).map((entry: { id: string; form: string; meaning: string }) => ({
    id: entry.id, alien_word: entry.form, english_meaning: entry.meaning, part_of_speech: 'unknown', confidence: null,
    context: 'Private notebook context', examples: [], notes: 'Private notes excluded from transfer', created_at: stamp })) });
  await page.reload(); await openProfile(page, profile.name);
  assert.equal((await atlasRequest('/api/datasets')).length, 0);
  await page.getByRole('button', { name: 'Atlas', exact: true }).click();
  assert.equal((await atlasRequest('/api/datasets')).length, 0);
  checks.push('Opening the actual desktop main process, a project and its Atlas area makes no evidence transfer');
  const grant = await atlasRequest('/api/desktop/grants', 'POST', { label: 'Actual Electron acceptance' });
  await page.getByLabel('One-time Atlas connection code').fill(grant.code);
  await page.getByRole('button', { name: 'Connect desktop', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Desktop connected.' })).toBeVisible();
  const credentialFile = path.join(root, 'atlas-connection', 'credential.bin');
  const protectedStorage = await desktop.evaluate(({ safeStorage }, encoded) => {
    const bytes = Buffer.from(encoded, 'base64'), value = JSON.parse(safeStorage.decryptString(bytes));
    return { available: safeStorage.isEncryptionAvailable(), ciphertextOmitsToken: !bytes.includes(Buffer.from(value.token)), userId: value.user.id };
  }, (await readFile(credentialFile)).toString('base64'));
  assert(protectedStorage.available && protectedStorage.ciphertextOmitsToken); assert.equal(protectedStorage.userId, user.id);
  const rendererStatus = await page.evaluate(async () => (window as unknown as { xeno: { atlas: { status: () => Promise<Record<string, unknown>> } } }).xeno.atlas.status());
  assert.equal(Object.hasOwn(rendererStatus, 'token'), false);
  checks.push('Electron stores and reloads a Windows-account-encrypted credential without returning its token to the renderer');
  await page.getByRole('button', { name: 'Select visible', exact: true }).click();
  await page.getByRole('button', { name: 'Preview selected transfer', exact: true }).click();
  const selected = await page.getByLabel('Selected Atlas evidence JSON').inputValue();
  assert(!selected.includes('Private notes') && !selected.includes('Private notebook context'));
  assert.equal((await atlasRequest('/api/datasets')).length, 0);
  await page.getByLabel('Atlas evidence rights').fill('CC-BY-4.0');
  await page.getByRole('button', { name: 'Create private Atlas collection', exact: true }).click();
  await page.getByRole('button', { name: 'Upload reviewed evidence', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Evidence version saved.' })).toBeVisible();
  await page.getByRole('button', { name: 'Compare transferred version', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh comparison result', exact: true })).toBeVisible();
  await expect(async () => { await page.getByRole('button', { name: 'Refresh comparison result', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Comparison: complete' })).toBeVisible(); }).toPass({ timeout: 30000, intervals: [1000] });
  checks.push('The actual preload and main-process broker transfer selected entries and retrieve a digest-matched private report');
  const synthetic = syntheticComparison(17); synthetic.input.versionId = randomUUID();
  await page.getByLabel('Import Atlas evidence report').setInputFiles({ name: 'controlled-proposal.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(compareLanguages(synthetic.input, [synthetic.reference]))) });
  await page.getByRole('button', { name: 'Stage proposed hypothesis', exact: true }).first().click();
  await expect.poll(async () => (await local('/api/profiles/' + profile.id)).research.hypotheses.length).toBe(1);
  const saved = await local('/api/profiles/' + profile.id);
  assert.equal(saved.dictionary.length, profile.dictionary.length); assert.equal(saved.research.hypotheses[0].content.kind, 'atlas-lexical'); assert.equal(saved.research.events.length, 0);
  await page.getByText('Staged Atlas hypotheses', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'atlas-desktop-review.png'), fullPage: true });
  checks.push('Imported conditional forms persist as proposed sourced hypotheses and leave the vocabulary unchanged');
  await desktop.close(); desktop = undefined;
  launch = await startDesktop(); desktop = launch.application; page = launch.page;
  await openProfile(page, profile.name); await page.getByRole('button', { name: 'Atlas', exact: true }).click();
  await page.getByRole('button', { name: 'Read connection status', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Connected for' })).toBeVisible();
  assert.equal((await local('/api/profiles/' + profile.id)).research.hypotheses.length, 1);
  checks.push('Desktop restart restores the protected connection and persisted proposal notebook');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Desktop connection revoked' })).toBeVisible();
  assert.equal((await atlasRequest('/api/desktop/connections')).length, 0);
  const secondGrant = await atlasRequest('/api/desktop/grants', 'POST', { label: 'Offline acceptance' });
  await page.getByLabel('One-time Atlas connection code').fill(secondGrant.code); await page.getByRole('button', { name: 'Connect desktop', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Desktop connected.' })).toBeVisible();
  await fixture.stop();
  await page.getByRole('button', { name: 'Select visible', exact: true }).click(); await page.getByRole('button', { name: 'Preview selected transfer', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh Atlas collections', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Atlas connection', exact: true }).getByRole('alert')).toContainText('unavailable');
  await page.getByRole('button', { name: 'Vocabulary', exact: true }).click(); await page.getByRole('button', { name: '+ Add Word', exact: true }).click();
  await page.getByRole('textbox', { name: 'Alien Word', exact: true }).fill('offline-word'); await page.getByRole('textbox', { name: 'English Meaning', exact: true }).fill('offline meaning');
  await page.getByRole('button', { name: 'Add to Dictionary', exact: true }).click();
  await expect.poll(async () => (await local('/api/profiles/' + profile.id)).dictionary.length).toBe(profile.dictionary.length + 1);
  checks.push('With Atlas stopped, the actual desktop keeps its local backend and saves ordinary offline vocabulary edits');
  assert.deepEqual(pageErrors, []);
  await writeFile(path.join(output, 'verification.json'), JSON.stringify({ version: 'atlas-desktop-verification-1', checkedAt: new Date().toISOString(),
    actualElectron: true, actualMainEntry: 'electron/dist/main.cjs', electronVersion: await desktop.evaluate(({ app }) => app.getVersion()), protection: 'Electron safeStorage on Windows',
    credentialCiphertextSha256: createHash('sha256').update(await readFile(credentialFile)).digest('hex'), checks, pageErrors, passed: true }, null, 2));
  console.log(JSON.stringify({ checks, passed: true }, null, 2));
} catch (error) {
  await writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: (error as Error).message, checks }, null, 2));
  if (desktop) await desktop.firstWindow().then(page => page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true })).catch(() => {}); throw error;
} finally {
  await desktop?.close(); await fixture.cleanup().catch(() => {}); await writeFile(path.join(output, 'backend.log'), backendLog);
  const resolved = await realpath(root);
  if (resolved !== root || !resolved.startsWith(path.join(config.root, 'temp') + path.sep) || !path.basename(root).startsWith('xeno-acceptance-atlas-')) throw new Error('Unsafe desktop fixture cleanup');
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
