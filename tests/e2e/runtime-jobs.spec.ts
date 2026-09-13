import { test, expect, preparePage, openProfile } from './fixtures';

test('W10 distinguishes reachable service from chat readiness and requires an explicit download action', async ({ page, server }) => {
  await preparePage(page);
  await page.route('**/api/ollama/status', route => route.fulfill({ json: { connected: true, ready: false, models: [], defaultModel: 'gemma4:e4b', inventory: [
    { name: 'embedding:latest', size: 1000, digest: 'fixture-digest', capabilities: ['embedding'], location: 'local', eligible: false, reason: 'Model does not support completion' },
    { name: 'cloud-alias', size: 384, digest: 'cloud-digest', capabilities: ['completion'], location: 'remote', eligible: false, reason: 'Remote-backed model is disabled in local mode' },
  ] } }));
  let pulls = 0;
  await page.route('**/api/ollama/pull', route => { pulls++; expect(route.request().postDataJSON()).toEqual({ model: 'gemma4:e4b', confirmed: true }); return route.fulfill({ status: 503, json: { error: 'Download unavailable; retry when online' } }); });
  await page.goto(server.url + '/app');
  await page.getByRole('button', { name: 'Runtime & setup', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Runtime and setup' });
  await expect(panel.getByText('Ollama service: reachable · Chat: not ready')).toBeVisible();
  await expect(panel.getByRole('combobox', { name: 'Local chat model' }).locator('option')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Download gemma4:e4b', exact: true })).toBeVisible();
  expect(pulls).toBe(0);
  await panel.getByRole('button', { name: 'Download gemma4:e4b', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Download unavailable'); expect(pulls).toBe(1);
});

test('W10 retains partial answers and errors per profile through reload and supports deleting history', async ({ page, server }) => {
  await preparePage(page);
  const first = await (await page.request.post(server.url + '/api/profiles', { data: { name: 'Chat evidence' } })).json();
  const second = await (await page.request.post(server.url + '/api/profiles', { data: { name: 'Separate profile' } })).json();
  await page.route('**/api/ai/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'data: {"token":"A partial proposal"}\n\ndata: {"error":"Model stopped responding"}\n\n' }));
  await openProfile(page, server.url, 'Chat evidence');
  await page.getByRole('button', { name: /AI SHIFT\+A/ }).click();
  await page.getByRole('textbox', { name: 'Chat message' }).fill('Find a pattern'); await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('A partial proposal', { exact: true })).toBeVisible(); await expect(page.getByText('Model stopped responding', { exact: true })).toBeVisible();
  await expect.poll(async () => (await (await page.request.get(server.url + '/api/profiles/' + first.id)).json()).ai_history?.at(-1)?.state).toBe('failed');
  await page.reload(); await page.getByRole('button').filter({ has: page.getByText('Chat evidence', { exact: true }) }).click(); await page.getByRole('button', { name: /AI SHIFT\+A/ }).click();
  await expect(page.getByText('A partial proposal', { exact: true })).toBeVisible(); await expect(page.getByText('Model stopped responding', { exact: true })).toBeVisible();
  await openProfile(page, server.url, 'Separate profile'); await page.getByRole('button', { name: /AI SHIFT\+A/ }).click();
  await expect(page.getByText('A partial proposal', { exact: true })).toHaveCount(0);
  expect((await (await page.request.get(server.url + '/api/profiles/' + second.id)).json()).ai_history ?? []).toEqual([]);
  await openProfile(page, server.url, 'Chat evidence'); await page.getByRole('button', { name: /AI SHIFT\+A/ }).click();
  await page.getByRole('button', { name: 'Delete AI history' }).click();
  await expect.poll(async () => (await (await page.request.get(server.url + '/api/profiles/' + first.id)).json()).ai_history).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('runtime-chat.png'), animations: 'disabled' });
});
