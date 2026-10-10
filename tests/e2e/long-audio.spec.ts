import { test, expect, openProfile, preparePage, attachJson } from './fixtures';
import { longAudio } from '../../server/src/__tests__/helpers/long-audio';
import { phoneFixture } from '../../server/src/__tests__/helpers/phone-analysis';
import type { LanguageProfile } from '../../shared/types';

test.beforeEach(async ({ page }) => { await preparePage(page); });

test('five-minute recording survives draft recovery, phone analysis, manual editing and archive restore', async ({ page, server }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Long recording' } })).json();
  await page.route('**/api/ipa', async route => {
    await route.fulfill({ json: phoneFixture(Buffer.from(route.request().postDataJSON().audio, 'base64')) });
  });
  await openProfile(page, server.url, profile.name);
  const wav = longAudio();
  await page.locator('input[type="file"]').setInputFiles({ name: 'five-minutes.wav', mimeType: 'audio/wav', buffer: wav });
  await expect(page.getByText('five-minutes.wav · 300.0s')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Transcribe audio', exact: true })).toBeDisabled();
  await openProfile(page, server.url, profile.name);
  await expect(page.getByText('five-minutes.wav · 300.0s')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Queue long phone analysis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy analysis 1 to manual segments', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Copy analysis 1 to manual segments', exact: true }).click();
  await page.getByPlaceholder('Label this word...').fill('long manual correction');
  await page.getByPlaceholder('Enter unknown language text… e.g. nesh tor krash.').fill('Five-minute sample');
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Discard audio draft' })).toHaveCount(0);
  const read = async (): Promise<LanguageProfile> => (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  const saved = await read();
  expect(saved.audio_clips[0].duration).toBe(300);
  expect(saved.audio_clips[0].phone_analyses![0].result.ctc.frames).toBe(14999);
  expect(saved.audio_clips[0].segments[0]).toMatchObject({ label: 'long manual correction', end: 299.98 });
  await expect(page.getByTitle('Re-transcribe audio', { exact: true })).toBeDisabled();
  await server.restart(); await openProfile(page, server.url, profile.name);
  expect((await read()).audio_clips).toEqual(saved.audio_clips);
  await page.getByLabel('Recording annotation layers').locator('summary').first().click();
  await page.screenshot({ path: test.info().outputPath('long-audio.png') });
  const exported = await page.request.get(`${server.url}/api/archives/export/${profile.id}?revision=${saved.revision}&sandbox=true`);
  expect(exported.ok()).toBe(true);
  const archiveBytes = await exported.body();
  await server.waitForArchiveCleanup();
  const inspected = await page.request.post(`${server.url}/api/archives/inspect`, { data: archiveBytes, headers: { 'Content-Type': 'application/octet-stream' } });
  expect(inspected.status()).toBe(201);
  const preview = await inspected.json();
  const response = await page.request.post(`${server.url}/api/archives/${preview.token}/restore`, { data: { mode: 'new' } });
  expect(response.status()).toBe(201);
  const restored: LanguageProfile = (await response.json()).profile;
  expect(restored.audio_clips[0].phone_analyses).toEqual(saved.audio_clips[0].phone_analyses);
  expect(restored.audio_clips[0].segments[0].label).toBe('long manual correction');
  expect((await (await page.request.get(`${server.url}/api/audio/${restored.audio_clips[0].id}`)).body()).equals(wav)).toBe(true);
  await attachJson('long-audio-layers.json', { saved, restored, errors, scope: 'Synthetic PCM and phone response; real browser preparation, draft recovery, storage, restart and archive operations.' });
  expect(errors).toEqual([]);
});

test('rejects an over-limit recording without replacing the retained draft', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Duration limits' } })).json();
  await openProfile(page, server.url, profile.name);
  await page.locator('input[type="file"]').setInputFiles({ name: 'retained.wav', mimeType: 'audio/wav', buffer: longAudio(1) });
  await expect(page.getByText('retained.wav · 1.0s')).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: 'too-long.wav', mimeType: 'audio/wav', buffer: longAudio(301) });
  await expect(page.getByRole('alert')).toContainText('300 seconds');
  await expect(page.getByText('retained.wav · 1.0s')).toBeVisible();
});
