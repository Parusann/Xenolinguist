import { test, expect, preparePage, openProfile, attachJson } from './fixtures';

const mappings = { 1: 'ra', 2: 'ru', 3: 'ri', 5: 'ka', 6: 'ka ra', 7: 'ka ru' };
function answerFor(value: number): string {
  const atoms: Record<number, string> = { 1: 'ra', 2: 'ru', 3: 'ri', 5: 'ka' };
  if (value <= 5) return atoms[value];
  const q = Math.floor(value / 5), r = value % 5;
  return [...(q === 1 ? [] : [answerFor(q)]), 'ka', ...(r ? [atoms[r]] : [])].join(' ');
}
test('W22 retains question, decline, observed answer and reranking through restart and archive restoration', async ({ page, server }) => {
  test.setTimeout(90000); await preparePage(page);
  const p = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Elicitation history', number_system: { base: null, mappings, operators: {} } } })).json();
  let modelCalls = 0; page.on('request', r => { if (r.url().includes('/api/ai/')) modelCalls++; });
  const open = async () => { await openProfile(page, server.url, p.name); await page.locator('[data-tour="numbers"]').click(); };
  await open();
  const panel = page.getByRole('region', { name: 'Active number elicitation', exact: true });
  const select = panel.getByRole('button', { name: 'Select and record next question', exact: true });
  await select.click(); await expect(panel.getByLabel('Elicitation reason')).toBeEnabled();
  const first = await (await page.request.get(`${server.url}/api/profiles/${p.id}`)).json();
  expect(first.number_system).toEqual(p.number_system); expect(first.research.observations).toHaveLength(0);
  await panel.getByLabel('Elicitation reason').fill('Cannot observe this numeral today.');
  await panel.getByRole('button', { name: 'Decline question', exact: true }).click();
  await expect(panel).toContainText('No linguistic evidence was changed.');
  await select.click(); await expect(panel.getByLabel('Elicitation answer')).toBeEnabled();
  const second = await (await page.request.get(`${server.url}/api/profiles/${p.id}`)).json();
  const requested = JSON.parse(second.elicitation_history[1].report_json).selection.value;
  expect(requested).not.toBe(JSON.parse(first.elicitation_history[0].report_json).selection.value);
  const observed = answerFor(requested);
  await panel.getByLabel('Elicitation answer').fill(observed);
  await panel.getByLabel('Elicitation reason').fill('Independent numeral observation.');
  await page.reload(); await open();
  await expect(panel.getByLabel('Elicitation answer')).toHaveValue(observed);
  await expect(panel.getByLabel('Elicitation reason')).toHaveValue('Independent numeral observation.');
  await panel.getByRole('button', { name: 'Save observed answer', exact: true }).click();
  await expect(panel).toContainText('Recorded decision: answer'); await expect(panel).toContainText('After the answer:');
  let saved = await (await page.request.get(`${server.url}/api/profiles/${p.id}`)).json();
  expect(saved.number_system.mappings[requested]).toBe(observed); expect(saved.number_system.validation_values).toContain(requested);
  expect(saved.research.observations).toHaveLength(1);
  const decision = saved.elicitation_history[1].decision;
  expect(JSON.parse(decision.after_json).leaderIds.length).toBeLessThan(JSON.parse(saved.elicitation_history[1].report_json).leaderIds.length);
  await server.restart(); await page.context().addCookies([{ name: 'xeno_dev_session', value: server.secret, url: server.url + '/api', httpOnly: true, sameSite: 'Strict' }]);
  await open(); await expect(panel).toContainText('Independent numeral observation.');
  await panel.screenshot({ path: test.info().outputPath('elicitation-answer.png') });
  saved = await (await page.request.get(`${server.url}/api/profiles/${p.id}`)).json(); await attachJson('elicitation-profile.json', saved);
  await page.locator('[data-tour="dashboard"]').click();
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export .xeno archive', exact: true }).click();
  const archive = test.info().outputPath('elicitation-history.xeno'); await (await downloading).saveAs(archive);
  await page.getByLabel('Import .xeno archive', { exact: true }).setInputFiles(archive);
  await page.getByRole('region', { name: 'Archive preview' }).getByRole('button', { name: 'Restore project', exact: true }).click();
  await page.getByRole('button', { name: 'Open restored project', exact: true }).click(); await page.locator('[data-tour="numbers"]').click();
  await expect(panel).toContainText('Historical question restored from an archive.'); await expect(panel).toContainText('Independent numeral observation.');
  const profiles = await (await page.request.get(`${server.url}/api/profiles`)).json();
  const restored = await (await page.request.get(`${server.url}/api/profiles/${profiles.find((x: { id: string }) => x.id !== p.id).id}`)).json();
  expect(restored.elicitation_history[1].source_json).toBe(saved.elicitation_history[1].source_json);
  expect(restored.elicitation_history[1].decision.observation_id).toBe(restored.research.observations[0].id);
  await attachJson('restored-elicitation-profile.json', restored); expect(modelCalls).toBe(0);
});

test('W22 blocks stale answers and keeps question drafts scoped to their project', async ({ page, server }) => {
  await preparePage(page);
  const p = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Question origin', number_system: { base: null, mappings, operators: {} } } })).json();
  const other = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Question other' } })).json();
  await openProfile(page, server.url, p.name); await page.locator('[data-tour="numbers"]').click();
  const panel = page.getByRole('region', { name: 'Active number elicitation', exact: true });
  await panel.getByRole('button', { name: 'Select and record next question', exact: true }).click();
  await panel.getByLabel('Elicitation answer').fill('draft form'); await panel.getByLabel('Elicitation reason').fill('draft source');
  const saved = await (await page.request.get(`${server.url}/api/profiles/${p.id}`)).json();
  const update = await page.request.put(`${server.url}/api/profiles/${p.id}`, { data: { revision: saved.revision, number_system: { ...saved.number_system, mappings: { ...mappings, 8: 'ka ri' } } } });
  expect(update.ok()).toBe(true);
  await panel.getByRole('button', { name: 'Refresh question history' }).click();
  await expect(panel).toContainText('Number evidence changed'); await expect(panel.getByRole('button', { name: 'Save observed answer' })).toBeDisabled();
  await openProfile(page, server.url, other.name); await page.locator('[data-tour="numbers"]').click();
  await expect(panel).toContainText('0/20 retained questions'); await expect(panel.getByLabel('Elicitation answer')).toHaveCount(0);
});

test('W22 clears only originating drafts when a decision response arrives after a project switch', async ({ page, server }) => {
  await preparePage(page);
  const p = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Delayed origin', number_system: { base: null, mappings, operators: {} } } })).json();
  const other = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Delayed destination' } })).json();
  await openProfile(page, server.url, p.name); await page.locator('[data-tour="numbers"]').click();
  const panel = page.getByRole('region', { name: 'Active number elicitation', exact: true });
  await panel.getByRole('button', { name: 'Select and record next question', exact: true }).click();
  await panel.getByLabel('Elicitation reason').fill('Decline before changing projects.');
  const saved = await (await page.request.get(`${server.url}/api/profiles/${p.id}`)).json(), recordId = saved.elicitation_history[0].id;
  let release!: () => void, held = false;
  const released = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/elicitation/*/*/decision', async route => {
    const response = await route.fetch(); held = true; await released; await route.fulfill({ response });
  });
  const drafts = () => page.evaluate(() => new Promise<Record<string, Record<string, unknown>>>((resolve, reject) => {
    const open = indexedDB.open('xenolinguist-drafts', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, read = db.transaction('profiles', 'readonly').objectStore('profiles').getAll();
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => { db.close(); resolve(Object.fromEntries(read.result.map((r: { profileId: string; drafts: Record<string, unknown> }) => [r.profileId, r.drafts]))); };
    };
  }));
  try {
    await panel.getByRole('button', { name: 'Decline question', exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await page.getByTitle('Back to profiles', { exact: true }).click();
    await page.getByRole('button').filter({ has: page.getByText(other.name, { exact: true }) }).click();
    await page.locator('[data-tour="numbers"]').click();
    release();
    await expect.poll(async () => (await drafts())[p.id]?.[`elicitation.reason.${recordId}`]).toBe('');
    await expect(panel).toContainText('0/20 retained questions');
    expect(Object.keys((await drafts())[other.id] ?? {}).some(key => key.startsWith('elicitation.'))).toBe(false);
  } finally { release(); }
});
