import { test, expect, preparePage, openProfile } from './fixtures';

test('W21 routes research actions into explicit review without background inference or cross-profile drafts', async ({ page, server }) => {
  await preparePage(page);
  const first = await (await page.request.post(server.url + '/api/profiles', { data: { name: 'Research actions' } })).json();
  await page.request.post(server.url + '/api/profiles', { data: { name: 'Other research project' } });
  const inference: string[] = [];
  await page.route('**/api/ai/stream', route => { inference.push('stream'); return route.fulfill({ contentType: 'text/event-stream', body: 'data: [DONE]\n\n' }); });
  await page.route('**/api/ai/research/runs', route => { inference.push('research'); return route.fulfill({ status: 503, json: { error: 'No inference expected in navigation check' } }); });
  await openProfile(page, server.url, 'Research actions');
  await page.clock.install();
  await page.getByPlaceholder('Enter unknown language text… e.g. nesh tor krash.').fill('ka pa-mok');
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Investigate saved sample', exact: true })).toBeVisible();
  await page.clock.runFor(2000); // Exceed the former background-suggestion debounce.
  await expect.poll(async () => (await (await page.request.get(server.url + '/api/profiles/' + first.id)).json()).samples.length).toBe(1);
  await page.getByRole('button', { name: 'Investigate saved sample', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Research proposal review' });
  await expect(panel.getByRole('textbox', { name: 'Research question' })).toHaveValue(/ka pa-mok/);
  await expect(panel.getByText('Capture an observation in Field Log first so proposals can cite retained evidence.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Generate research proposal', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close chat', exact: true }).click();
  await page.getByRole('button', { name: 'Review sample proposal', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Research question' })).toHaveValue(/Investigate patterns/);
  await page.getByRole('button', { name: 'Close chat', exact: true }).click();
  await page.locator('[data-tour="vocabulary"]').click();
  await page.getByRole('button', { name: 'Review lexical proposal', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Research question' })).toHaveValue(/Propose one lexical sense/);
  await page.getByRole('button', { name: 'Close chat', exact: true }).click();
  await page.locator('[data-tour="grammar"]').click();
  await page.getByRole('button', { name: 'Review grammar proposal', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Research question' })).toHaveValue(/Propose an executable grammar rule/);
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Investigate contradictory evidence', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Research question' })).toHaveValue('Investigate contradictory evidence');
  expect(inference).toEqual([]);
  await openProfile(page, server.url, 'Other research project');
  await page.getByRole('button', { name: /AI SHIFT\+A/ }).click();
  await page.getByRole('button', { name: 'Review research proposals', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Research question' })).toHaveValue('');
  expect(inference).toEqual([]);
});

test('W21 waits for active conversation output before opening a requested research review', async ({ page, server }) => {
  await preparePage(page);
  await page.request.post(server.url + '/api/profiles', { data: { name: 'Pending conversation' } });
  let finish!: () => void;
  const responseReady = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/ai/stream', async route => {
    await responseReady;
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"token":"Retained conversation output"}\n\ndata: [DONE]\n\n' });
  });
  try {
    await openProfile(page, server.url, 'Pending conversation');
    await page.getByRole('button', { name: /AI SHIFT\+A/ }).click();
    await page.getByRole('textbox', { name: 'Chat message' }).fill('Explain the existing evidence');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop generation', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review sample proposal', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Research review is ready to open' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Research proposal review' })).toHaveCount(0);
    finish();
    await expect(page.getByRole('region', { name: 'Research proposal review' })).toBeVisible();
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    await expect(page.getByText('Retained conversation output', { exact: true })).toBeVisible();
  } finally { finish(); }
});
