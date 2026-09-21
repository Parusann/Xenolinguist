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
  const saved = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(created.id + '/mutations'));
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

test('W03 concurrent operations conflict visibly and both survive retry and restart', async ({ page, server }) => {
  const trials = [];
  for (let i = 0; i < 10; i++) {
    const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: `Concurrent ${i}` } })).json();
    const requests = [
      { expectedRevision: 0, mutationId: `left-${i}`, operations: [{ type: 'set-fields', fields: { description: `left-${i}` } }] },
      { expectedRevision: 0, mutationId: `right-${i}`, operations: [{ type: 'set-fields', fields: { phonetic_notes: `right-${i}` } }] },
    ];
    const responses = await Promise.all(requests.map(data => page.request.post(`${server.url}/api/profiles/${profile.id}/mutations`, { data })));
    const outcomes = await Promise.all(responses.map(async r => ({ status: r.status(), body: await r.json() })));
    expect(outcomes.map(r => r.status).sort()).toEqual([200, 409]);
    const conflict = outcomes.findIndex(r => r.status === 409);
    const retried = await page.request.post(`${server.url}/api/profiles/${profile.id}/mutations`, { data: { ...requests[conflict], expectedRevision: 1 } });
    expect(retried.status()).toBe(200);
    await server.restart();
    const stored = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
    const retainedBoth = stored.description === `left-${i}` && stored.phonetic_notes === `right-${i}`;
    trials.push({ outcomes, retry: { status: retried.status(), body: await retried.json() }, stored, retainedBoth });
    expect(retainedBoth).toBe(true);
  }
  await attachJson('concurrency.json', trials);
  expect(trials).toHaveLength(10);
});

test('W02 invalid nested import never reaches live profile state', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles/demo`)).json();
  await openProfile(page, server.url, profile.name);
  await page.locator('[data-tour="dashboard"]').click();
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'PUT' || request.url().endsWith('/mutations')) writes.push(request.url()); });
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...profile, number_system: { base: 1, mappings: {}, operators: {} } })) });
  await expect(page.getByText('Invalid profile JSON file', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await server.restart();
  const saved = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  expect(saved.number_system.base).toBe(8);
  expect(saved.dictionary).toEqual(profile.dictionary);
});

test('W04 failed saves survive reload and retry exactly once', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Retry flow' } })).json();
  await page.route('**/api/profiles/*/mutations', route => route.fulfill({ status: 500, json: { error: 'Injected save failure', code: 'TEST_FAILURE' } }));
  await openProfile(page, server.url, profile.name);
  await page.getByPlaceholder('Enter unknown language text… e.g. nesh tor krash.').fill('Retry this sample');
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  await expect(page.getByText('Save failed', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('save-failed.png') });
  await openProfile(page, server.url, profile.name); // Real page reload, same browser storage origin.
  await expect(page.getByText('Retry this sample', { exact: true })).toBeVisible();
  await expect(page.getByText('Save failed', { exact: true })).toBeVisible();
  await page.unroute('**/api/profiles/*/mutations');
  await page.getByRole('button', { name: 'Retry save for Retry flow' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const stored = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  expect(stored.samples.filter((sample: { alien_text: string }) => sample.alien_text === 'Retry this sample')).toHaveLength(1);
  await openProfile(page, server.url, profile.name);
  await expect(page.getByText('Retry this sample', { exact: true })).toBeVisible();
});

test('W04 switching profiles preserves both pending saves', async ({ page, server }) => {
  const a = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'First queue' } })).json();
  const b = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Second queue' } })).json();
  await openProfile(page, server.url, a.name);
  await page.getByPlaceholder('Enter unknown language text… e.g. nesh tor krash.').fill('First pending');
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  await page.getByTitle('Back to profiles').click();
  await page.getByRole('button').filter({ has: page.getByText(b.name, { exact: true }) }).click();
  await page.getByPlaceholder('Enter unknown language text… e.g. nesh tor krash.').fill('Second pending');
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  for (const [profile, expected] of [[a, 'First pending'], [b, 'Second pending']] as const) {
    await expect.poll(async () => (await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json()).samples.map((sample: { alien_text: string }) => sample.alien_text)).toContain(expected);
  }
  await server.restart();
  expect((await (await page.request.get(`${server.url}/api/profiles/${a.id}`)).json()).samples).toHaveLength(1);
  expect((await (await page.request.get(`${server.url}/api/profiles/${b.id}`)).json()).samples).toHaveLength(1);
});

test('W04 translation drafts and active phase survive reload without leaking across profiles', async ({ page, server }) => {
  const a = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Draft owner' } })).json();
  const b = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Other draft owner' } })).json();
  await openProfile(page, server.url, a.name);
  await page.locator('[data-tour="translation"]').click();
  await page.getByPlaceholder('Enter unknown language text to translate…').fill('Unfinished translation');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await openProfile(page, server.url, a.name);
  await expect(page.getByPlaceholder('Enter unknown language text to translate…')).toHaveValue('Unfinished translation');
  await page.getByTitle('Back to profiles').click();
  await page.getByRole('button').filter({ has: page.getByText(b.name, { exact: true }) }).click();
  await page.locator('[data-tour="translation"]').click();
  await expect(page.getByPlaceholder('Enter unknown language text to translate…')).toHaveValue('');
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
        requestBytes: response.request().postDataBuffer()?.length ?? 0,
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
  await expect(page.locator('input[type="file"]')).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles(wavFixture);
  await expect(page.getByText(/hello-16k.wav ·/)).toBeVisible();
  const saved = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(profile.id + '/mutations'));
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
  expect(stored.samples[0].audio_id).toBeTruthy();
  const original = await page.request.get(`${server.url}/api/audio/${stored.samples[0].audio_id}`);
  expect(createHash('sha256').update(await original.body()).digest('hex')).toBe(sha256);
  expect(stored.audio_clips[0].assets.original.sha256).toBe(sha256);
});
