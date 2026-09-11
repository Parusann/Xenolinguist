import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect, preparePage, openProfile, attachJson, wavFixture } from './fixtures';

test.beforeEach(async ({ page }) => { await preparePage(page); });

test('text sample survives an actual backend restart', async ({ page, server }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const created = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Persistence smoke' } })).json();
  await openProfile(page, server.url, created.name);
  await page.getByPlaceholder('Enter unknown language text… e.g. nesh tor krash.').fill('Smoke sample');
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith(created.id));
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await server.restart();
  const persisted = await (await page.request.get(`${server.url}/api/profiles/${created.id}`)).json();
  expect(persisted.samples[0].alien_text).toBe('Smoke sample');
  await openProfile(page, server.url, created.name);
  await expect(page.getByText('Smoke sample', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('workbench.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('F04 concurrent partial writes retain each HTTP outcome', async ({ page, server }) => {
  const trials = [];
  for (let i = 0; i < 10; i++) {
    const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: `Concurrent ${i}` } })).json();
    const responses = await Promise.all([
      page.request.put(`${server.url}/api/profiles/${profile.id}`, { data: { description: `left-${i}` } }),
      page.request.put(`${server.url}/api/profiles/${profile.id}`, { data: { phonetic_notes: `right-${i}` } }),
    ]);
    const outcomes = await Promise.all(responses.map(async r => ({ status: r.status(), body: await r.json() })));
    const stored = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
    const retainedBoth = stored.description === `left-${i}` && stored.phonetic_notes === `right-${i}`;
    trials.push({ outcomes, stored, retainedBoth, classification: outcomes.some(r => r.status >= 400)
      ? 'explicit-request-failure' : retainedBoth ? 'both-retained' : 'acknowledged-edit-lost' });
  }
  await attachJson('concurrency.json', trials);
  // Characterization, not a release acceptance gate. Do not confuse a 500 with silent loss.
  expect(trials).toHaveLength(10);
  for (const t of trials) for (const r of t.outcomes) expect([200, 409, 500]).toContain(r.status);
  test.info().annotations.push({ type: 'baseline', description: `${trials.filter(t => !t.retainedBoth).length}/10 failed to retain both writes; W03 acceptance remains open` });
});

test('W02 invalid nested import never reaches live profile state', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles/demo`)).json();
  await openProfile(page, server.url, profile.name);
  await page.locator('[data-tour="dashboard"]').click();
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'PUT') writes.push(request.url()); });
  await page.locator('input[type="file"]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...profile, number_system: { base: 1, mappings: {}, operators: {} } })) });
  await expect(page.getByText('Invalid profile JSON file', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await server.restart();
  const saved = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  expect(saved.number_system.base).toBe(8);
  expect(saved.dictionary).toEqual(profile.dictionary);
});

test('F03 a one-letter vocabulary answer must not receive credit', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Grading probe', is_sandbox: true } })).json();
  await openProfile(page, server.url, profile.name);
  await page.getByRole('button', { name: 'Generate & Start Decoding' }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByPlaceholder('Your guess...').nth(i).fill(String(i + 1));
    await page.getByPlaceholder('Your guess...').nth(i).press('Enter');
  }
  await page.getByRole('button', { name: /Continue to Vocabulary/ }).click();
  await page.getByPlaceholder('Meaning?').fill('a');
  await page.getByPlaceholder('Meaning?').press('Enter');
  // All setup assertions precede the expected-failure annotation.
  const accepted = await page.getByPlaceholder('Meaning?').isDisabled();
  await attachJson('grading.json', { answer: 'a', expected: 'water', accepted });
  test.fail(true, 'F03: substring grading accepts a letter; remove annotation with W07');
  expect(accepted).toBe(false);
});

test('F03 navigating to another phase must preserve the sandbox draft', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Navigation probe', is_sandbox: true } })).json();
  await openProfile(page, server.url, profile.name);
  await page.getByRole('button', { name: 'Generate & Start Decoding' }).click();
  await page.getByPlaceholder('Your guess...').first().fill('777');
  await page.locator('[data-tour="samples"]').click();
  await page.locator('[data-tour="sandbox"]').click();
  const draft = await page.getByPlaceholder('Your guess...').first().inputValue();
  await attachJson('sandbox-navigation.json', { before: '777', after: draft });
  test.fail(true, 'F03: controller state is lost on phase unmount; remove with W07');
  expect(draft).toBe('777');
});

test('F08 a saved Unicode word must translate', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: {
    name: 'Unicode probe', dictionary: [{ id: 'water', alien_word: '水', english_meaning: 'water',
      part_of_speech: 'noun', confidence: 80, context: '', examples: [], notes: '', created_at: new Date().toISOString() }],
  } })).json();
  await openProfile(page, server.url, profile.name);
  await page.locator('[data-tour="translation"]').click();
  await page.getByPlaceholder('Enter unknown language text to translate…').fill('水');
  const translated = await page.getByText('water', { exact: true }).count();
  await attachJson('unicode.json', { word: '水', expected: 'water', translated });
  test.fail(true, 'F08: token cleaning discards non-Latin letters; remove with W16');
  expect(translated).toBeGreaterThan(0);
});

test('F02 WAV import records decode, upload, save and restart boundaries', async ({ page, server }) => {
  const bytes = await readFile(wavFixture);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const network: unknown[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', response => {
    if (/\/api\/(audio|profiles)/.test(response.url()) && response.request().method() !== 'GET') {
      pending.push((async () => { network.push({ url: new URL(response.url()).pathname, status: response.status(),
        request: response.request().postDataJSON()?.data ? { base64Length: response.request().postDataJSON().data.length } : response.request().postDataJSON(),
        body: await response.json().catch(() => null) }); })());
    }
  });
  await page.addInitScript(() => {
    const original = AudioContext.prototype.decodeAudioData;
    const observations: unknown[] = [];
    Object.assign(window, { audioDecodeObservations: observations });
    AudioContext.prototype.decodeAudioData = function (bytes, ...args) {
      const before = bytes.byteLength;
      const result = original.call(this, bytes, ...args);
      observations.push({ inputBytes: before, bytesAfterCall: bytes.byteLength });
      return result;
    };
  });
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'WAV probe' } })).json();
  await openProfile(page, server.url, profile.name);
  await page.locator('input[type="file"]').setInputFiles(wavFixture);
  await expect(page.getByText(/Recorded ·/)).toBeVisible();
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith(profile.id));
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await Promise.all(pending);
  const decode = await page.evaluate(() => (window as unknown as { audioDecodeObservations: unknown[] }).audioDecodeObservations);
  const control = await page.request.post(`${server.url}/api/audio/upload`, { data: { id: 'fixture-control', data: bytes.toString('base64') } });
  expect(control.status()).toBe(200);
  await server.restart();
  const stored = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  await attachJson('wav-boundaries.json', { fixture: { bytes: bytes.length, sha256 }, decode, network,
    directUpload: { status: control.status(), body: await control.json() }, storedAfterRestart: stored });
  test.fail(true, 'F02: imported audio is lost; remove with audio repair');
  expect(stored.samples[0].audio_id).toBeTruthy();
});
