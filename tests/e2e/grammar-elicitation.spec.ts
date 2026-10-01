import { test, expect, preparePage, openProfile, attachJson } from './fixtures';

const at = '2026-10-01T00:00:00.000Z';
const dictionary = [
  { id: 'star', alien_word: 'nesh', english_meaning: 'star', part_of_speech: 'noun' },
  { id: 'rock', alien_word: 'kor', english_meaning: 'rock', part_of_speech: 'noun' },
  { id: 'see', alien_word: 'lor', english_meaning: 'to see', part_of_speech: 'verb', verb_frame: 'transitive' },
].map(e => ({ ...e, confidence: null, context: '', examples: [], notes: '', created_at: at }));
const grammar_rules = [
  { id: 'suffix', rule: 'Suffix plural', executable: { kind: 'plural-affix', position: 'suffix', affix: '-en' } },
  { id: 'prefix', rule: 'Prefix plural', executable: { kind: 'plural-affix', position: 'prefix', affix: 'en-' } },
  { id: 'svo', rule: 'Subject verb object', executable: { kind: 'clause-order', order: 'SVO', arguments: 2 } },
  { id: 'sov', rule: 'Subject object verb', executable: { kind: 'clause-order', order: 'SOV', arguments: 2 } },
].map(r => ({ ...r, confidence: null, evidence: [], created_at: at }));

test('W22 records grounded grammar decline and answer, reranks alternatives and restores historical captures', async ({ page, server }) => {
  test.setTimeout(90000); await preparePage(page);
  const p = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Grammar questions', dictionary, grammar_rules } })).json();
  let calls = 0; page.on('request', r => { if (r.url().includes('/api/ai/')) calls++; });
  const open = async () => { await openProfile(page, server.url, p.name); await page.locator('[data-tour="grammar"]').click(); };
  await open();
  const panel = page.getByRole('region', { name: 'Active grammar elicitation', exact: true });
  await panel.getByText('Configure alternatives and answerable meanings', { exact: true }).click();
  await panel.getByLabel('Alternative A: Suffix plural', { exact: true }).check();
  await panel.getByLabel('Alternative B: Prefix plural', { exact: true }).check();
  for (const id of ['star', 'rock']) {
    await panel.getByLabel('Question noun or subject', { exact: true }).selectOption(id);
    await panel.getByRole('button', { name: 'Add question anchor', exact: true }).click();
  }
  await expect(panel.getByRole('button', { name: 'Select and record grammar question', exact: true })).toBeDisabled();
  await panel.getByLabel('Can observe the stars', { exact: true }).check();
  await panel.getByLabel('Can observe the rocks', { exact: true }).check();
  await panel.getByText('Configure alternatives and answerable meanings', { exact: true }).click();
  await panel.getByRole('button', { name: 'Select and record grammar question', exact: true }).click();
  await expect(panel.getByLabel('Elicitation reason')).toBeEnabled();
  await panel.getByLabel('Elicitation reason').fill('Cannot observe this meaning today.');
  await panel.getByRole('button', { name: 'Decline question', exact: true }).click();
  await expect(panel).toContainText('No linguistic evidence was changed.');
  await panel.getByRole('button', { name: 'Select and record grammar question', exact: true }).click();
  await expect(panel.getByLabel('Elicitation answer')).toBeEnabled();
  const pending = await (await page.request.get(`${server.url}/api/profiles/${p.id}`)).json();
  const selected = JSON.parse(pending.grammar_elicitation_history[1].report_json).selection.meaning;
  const observed = dictionary.find(e => e.id === selected.nominal.head.entryId)!.alien_word + '-en';
  await panel.getByLabel('Elicitation answer').fill(observed); await panel.getByLabel('Elicitation reason').fill('Independent plural observation.');
  await page.reload(); await open();
  await expect(panel.getByLabel('Elicitation answer')).toHaveValue(observed);
  await panel.getByRole('button', { name: 'Save observed answer', exact: true }).click();
  await expect(panel).toContainText('After the answer: 1 remaining alternatives (before 2)');
  await server.restart(); await page.context().addCookies([{ name: 'xeno_dev_session', value: server.secret, url: server.url + '/api', httpOnly: true, sameSite: 'Strict' }]);
  await open(); await expect(panel).toContainText('Independent plural observation.');
  await panel.screenshot({ path: test.info().outputPath('grammar-elicitation-answer.png') });
  const saved = await (await page.request.get(`${server.url}/api/profiles/${p.id}`)).json();
  expect(saved.grammar_rules).toEqual(p.grammar_rules); expect(saved.research.observations).toHaveLength(1);
  await attachJson('grammar-elicitation-profile.json', saved);
  await page.locator('[data-tour="dashboard"]').click();
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export .xeno archive', exact: true }).click();
  const archive = test.info().outputPath('grammar-elicitation-history.xeno'); await (await downloading).saveAs(archive);
  await page.getByLabel('Import .xeno archive', { exact: true }).setInputFiles(archive);
  await page.getByRole('region', { name: 'Archive preview' }).getByRole('button', { name: 'Restore project', exact: true }).click();
  await page.getByRole('button', { name: 'Open restored project', exact: true }).click(); await page.locator('[data-tour="grammar"]').click();
  await expect(panel).toContainText('Historical grammar question restored from an archive.');
  const profiles = await (await page.request.get(`${server.url}/api/profiles`)).json();
  const restored = await (await page.request.get(`${server.url}/api/profiles/${profiles.find((x: { id: string }) => x.id !== p.id).id}`)).json();
  expect(restored.grammar_elicitation_history[1].decision.observation_id).toBe(restored.research.observations[0].id);
  await attachJson('restored-grammar-elicitation-profile.json', restored); expect(calls).toBe(0);
});

test('W22 grounds a role-swapped clause and blocks decisions after executable rules change', async ({ page, server }) => {
  await preparePage(page);
  const p = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Role questions', dictionary, grammar_rules } })).json();
  await openProfile(page, server.url, p.name); await page.locator('[data-tour="grammar"]').click();
  const panel = page.getByRole('region', { name: 'Active grammar elicitation', exact: true });
  await panel.getByText('Configure alternatives and answerable meanings', { exact: true }).click();
  await panel.getByLabel('Alternative A: Subject verb object', { exact: true }).check(); await panel.getByLabel('Alternative B: Subject object verb', { exact: true }).check();
  await panel.getByLabel('Question shape', { exact: true }).selectOption('clause');
  await panel.getByLabel('Question noun or subject', { exact: true }).selectOption('star');
  await panel.getByLabel('Question verb', { exact: true }).selectOption('see'); await panel.getByLabel('Question object', { exact: true }).selectOption('rock');
  await panel.getByRole('button', { name: 'Add question anchor', exact: true }).click();
  await panel.getByLabel('Can observe the rock does see the star', { exact: true }).check();
  await panel.getByLabel('Cost for the rock does see the star', { exact: true }).fill('3');
  await panel.getByText('Configure alternatives and answerable meanings', { exact: true }).click();
  await panel.getByRole('button', { name: 'Select and record grammar question', exact: true }).click();
  await expect(panel).toContainText('declared cost 3'); await expect(panel).toContainText('kor lor nesh'); await expect(panel).toContainText('kor nesh lor');
  const saved = await (await page.request.get(`${server.url}/api/profiles/${p.id}`)).json();
  const response = await page.request.put(`${server.url}/api/profiles/${p.id}`, { data: { revision: saved.revision, grammar_rules: saved.grammar_rules.filter((r: { id: string }) => r.id !== 'svo') } });
  expect(response.ok()).toBe(true); await panel.getByRole('button', { name: 'Refresh grammar history', exact: true }).click();
  await expect(panel).toContainText('Grounding or evidence changed'); await expect(panel.getByRole('button', { name: 'Save observed answer' })).toBeDisabled();
});

test('W22 keeps grammar setup and delayed decision drafts isolated after switching projects', async ({ page, server }) => {
  await preparePage(page);
  const p = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Grammar origin', dictionary, grammar_rules } })).json();
  const other = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Grammar destination' } })).json();
  const meaning = { kind: 'nominal', nominal: { head: { entryId: 'star', sense: null, lemma: 'star', pos: 'noun' }, plural: true, adjectives: [] } };
  const selected = await (await page.request.post(`${server.url}/api/grammar-elicitation/${p.id}`, { data: { expectedRevision: p.revision, mutationId: 'isolation-question', setup: {
    candidates: [{ id: 'A', rule_ids: ['suffix'] }, { id: 'B', rule_ids: ['prefix'] }], anchors: [meaning], available: [{ kind: 'meaning', meaning, cost: 1 }],
  } } })).json();
  const recordId = selected.profile.grammar_elicitation_history[0].id;
  await openProfile(page, server.url, p.name); await page.locator('[data-tour="grammar"]').click();
  const panel = page.getByRole('region', { name: 'Active grammar elicitation', exact: true });
  await panel.getByLabel('Elicitation reason').fill('Decline before navigation.');
  let release!: () => void, held = false;
  const released = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/grammar-elicitation/*/*/decision', async route => { const response = await route.fetch(); held = true; await released; await route.fulfill({ response }); });
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
    await panel.getByRole('button', { name: 'Decline question', exact: true }).click(); await expect.poll(() => held).toBe(true);
    await page.getByTitle('Back to profiles', { exact: true }).click();
    await page.getByRole('button').filter({ has: page.getByText(other.name, { exact: true }) }).click(); await page.locator('[data-tour="grammar"]').click();
    release(); await expect.poll(async () => (await drafts())[p.id]?.[`elicitation.reason.${recordId}`]).toBe('');
    await expect(panel).toContainText('0/20 retained grammar questions');
    expect(Object.keys((await drafts())[other.id] ?? {}).some(key => key.startsWith('elicitation.'))).toBe(false);
    await expect(panel.getByRole('button', { name: 'Select and record grammar question', exact: true })).toBeDisabled();
  } finally { release(); }
});
