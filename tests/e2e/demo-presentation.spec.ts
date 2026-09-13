import { test, expect, openProfile } from './fixtures';
import { DEMO_LANGUAGE, DEMO_VERSION } from '../../shared/demo-language';

test('new app demo matches the public corpus and existing profiles remain unchanged', async ({ page, server }, info) => {
  await page.addInitScript(() => localStorage.setItem('xenolinguist-tour-completed', '1'));
  const old = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Existing corpus', description: 'Original notes' } })).json();
  const created = await page.request.post(`${server.url}/api/profiles/demo`);
  expect(created.status()).toBe(201);
  const demo = await created.json();
  expect(demo.description).toContain(DEMO_VERSION);
  expect(demo.dictionary).toHaveLength(DEMO_LANGUAGE.dictionary.length);
  expect(demo.dictionary).toMatchObject(DEMO_LANGUAGE.dictionary.map(entry => ({ ...entry, user_asserted_confidence: entry.confidence })));
  expect(demo.samples).toEqual(DEMO_LANGUAGE.samples);
  const existing = await (await page.request.get(`${server.url}/api/profiles/${old.id}`)).json();
  expect(existing.description).toBe('Original notes'); expect(existing.revision).toBe(old.revision);
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Open workbench' }).first().click();
  await expect(page).toHaveURL(/\/app$/);
  await openProfile(page, server.url, demo.name);
  await expect(page.getByText('ka nesh lor', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('eridian-workbench.png'), animations: 'disabled' });
});
