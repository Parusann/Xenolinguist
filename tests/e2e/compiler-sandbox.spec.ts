import { test, expect, preparePage, openProfile, attachJson } from './fixtures';

test('W14 compiler practice works without Ollama, keeps reload drafts and restart grading, and reveals only selected answers', async ({ page, server }) => {
  await preparePage(page);
  await page.route('**/api/ollama/status', route => route.fulfill({ json: { connected: false, ready: false, models: [] } }));
  let modelRequests = 0; page.on('request', req => { if (req.url().includes('/api/ai/stream')) modelRequests++; });
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Compiler practice', is_sandbox: true } })).json();
  await openProfile(page, server.url, profile.name);
  await page.getByRole('button', { name: 'Start validated practice' }).click();
  await expect(page.getByRole('heading', { name: 'Validated compiler practice', exact: true })).toBeVisible();
  const first = page.locator('[data-compiler-challenge="c-0"]');
  await first.getByRole('textbox').fill('wrong'); await first.getByRole('button', { name: 'Check translation', exact: true }).click();
  await expect(first.getByRole('status')).toContainText('Not matched');
  await first.getByRole('textbox').fill('unfinished translation');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const before = await (await page.request.get(`${server.url}/api/compiler/${profile.id}`)).json();
  expect(before.challenges).toHaveLength(5); expect(before.observations).toHaveLength(29);
  expect(before.challenges.every((c: object) => Object.keys(c).join(',') === 'id,utterance')).toBe(true);
  await openProfile(page, server.url, profile.name);
  await expect(first.getByRole('textbox')).toHaveValue('unfinished translation');
  await server.restart(); await openProfile(page, server.url, profile.name);
  // Browser drafts are origin-local; the restarted test server receives a different port.
  // The server retains the submitted answer. Native stable draft storage is checked by verify-release.
  await expect(first.getByRole('textbox')).toHaveValue('wrong');
  await expect(first.getByRole('status')).toContainText('Not matched');
  expect(await (await page.request.get(`${server.url}/api/compiler/${profile.id}`)).json()).toEqual(before);
  const second = page.locator('[data-compiler-challenge="c-1"]');
  await second.getByRole('button', { name: 'Reveal translation' }).click();
  await expect(second.getByRole('status')).toContainText('Revealed:');
  const after = await (await page.request.get(`${server.url}/api/compiler/${profile.id}`)).json();
  expect(after.feedback.filter((f: { answer?: string }) => f.answer)).toHaveLength(1);
  expect(after.feedback[0]).toMatchObject({ attempts: 1, matched: false, revealed: false });
  expect(modelRequests).toBe(0);
  await page.screenshot({ path: test.info().outputPath('compiler-practice.png'), fullPage: true });
  await attachJson('compiler-learner-view.json', { before, after, modelRequests });
});
