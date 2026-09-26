import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, preparePage, openProfile } from './fixtures';
test.beforeEach(async ({ page }) => { await preparePage(page); });

test('W19 tests a discriminating answer, predicts a withheld numeral and preserves validation through archive restore', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Number composition', number_system: {
    base: null, operators: {}, mappings: { 1: 'ra', 2: 'ru', 3: 'ri', 5: 'ka', 6: 'ka ra', 7: 'ka ru' },
  } } })).json();
  let modelCalls = 0; page.on('request', request => { if (request.url().includes('/api/ai/')) modelCalls++; });
  await openProfile(page, server.url, profile.name); await page.locator('[data-tour="numbers"]').click();
  const panel = page.getByRole('region', { name: 'Number grammar inference', exact: true });
  await panel.getByRole('button', { name: 'Infer number grammar', exact: true }).click();
  await expect(panel.getByTestId('number-inference-result')).toContainText('ambiguous');
  const question = panel.getByRole('region', { name: 'Number question', exact: true });
  await expect(question).toContainText('Next useful observation: 10');
  await expect(panel.getByRole('region', { name: 'Number prediction', exact: true })).toContainText('Leading grammars disagree');
  await question.getByLabel('Observed number answer').fill('ru ka');
  await question.getByRole('button', { name: 'Save answer as validation' }).click();
  await expect(panel).toContainText('previous predictions are stale');
  await expect.poll(async () => (await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json()).number_system.validation_values).toEqual([10]);
  await panel.getByRole('button', { name: 'Infer number grammar', exact: true }).click();
  const prediction = panel.getByRole('region', { name: 'Number prediction', exact: true });
  await expect(prediction).toContainText('All leading grammars agree'); await expect(prediction).toContainText('ru ka ri');
  await prediction.getByText('Composition tree', { exact: true }).click();
  await expect(prediction).toContainText('×'); await expect(prediction).toContainText('= 13');
  await page.screenshot({ path: test.info().outputPath('number-composition.png'), fullPage: true });
  await prediction.getByText('Structured derivation (JSON)', { exact: true }).click();
  await expect(prediction.locator('pre')).toBeVisible(); await expect(prediction.locator('pre')).toContainText('"value": 13');
  await openProfile(page, server.url, profile.name); await page.locator('[data-tour="numbers"]').click();
  await panel.getByText('Choose independent validation mappings', { exact: true }).click();
  await expect(panel.getByLabel('Validate number 10', { exact: true })).toBeChecked();
  await panel.getByRole('button', { name: 'Infer number grammar', exact: true }).click(); await expect(prediction).toContainText('ru ka ri');
  await panel.getByRole('button', { name: 'Record candidate as research hypothesis' }).click();
  await expect.poll(async () => (await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json()).research.hypotheses.length).toBe(1);
  const saved = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  expect(saved.number_system.base).toBeNull(); expect(saved.number_system.mappings[13]).toBeUndefined();
  const exported = await page.request.get(`${server.url}/api/archives/export/${profile.id}?revision=${saved.revision}&sandbox=false`); expect(exported.ok()).toBe(true);
  await expect.poll(() => readdir(path.join(server.dataDir, 'archive-staging'))).toEqual([]);
  const preview = await page.request.post(`${server.url}/api/archives/inspect`, { data: await exported.body(), headers: { 'Content-Type': 'application/octet-stream' } }); expect(preview.status()).toBe(201);
  const restored = await page.request.post(`${server.url}/api/archives/${(await preview.json()).token}/restore`, { data: { mode: 'new' } }); expect(restored.status()).toBe(201);
  expect((await restored.json()).profile.number_system).toEqual(saved.number_system);
  await panel.getByLabel('Validate number 10', { exact: true }).uncheck(); await expect(panel).toContainText('previous predictions are stale');
  await page.locator('[data-tour="dashboard"]').click();
  await expect(page.getByRole('region', { name: 'Research evidence', exact: true })).toContainText('number mappings, validation selection or case policy changed');
  expect(modelCalls).toBe(0);
});
