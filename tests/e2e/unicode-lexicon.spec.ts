import { test, expect, preparePage, openProfile } from './fixtures';

test.beforeEach(async ({ page }) => { await preparePage(page); });
const now = '2026-09-21T00:00:00.000Z';
const word = (id: string, alien_word: string, english_meaning: string) => ({ id, alien_word, english_meaning,
  part_of_speech: 'noun', confidence: null, context: '', examples: [], notes: '', created_at: now });

test('W16 Unicode matches agree across translation, samples and dictionary search', async ({ page, server }) => {
  const source = '水, தமிழ் cafe\u0301! 未知';
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: {
    name: 'Unicode consistency', dictionary: [word('water', '水', 'water'), word('tamil', 'தமிழ்', 'Tamil'), word('coffee', 'café', 'coffee')],
    samples: [{ id: 'sample', alien_text: source, english_translation: null, source: 'field', phonetic_notes: '', decoded: false, audio_id: null, ipa: null, created_at: now }],
  } })).json();
  await openProfile(page, server.url, profile.name);
  await page.getByText(source, { exact: true }).click();
  await expect(page.getByTestId('sample-lexical-tokens')).toContainText('water');
  await expect(page.getByTestId('sample-lexical-tokens')).toContainText('Tamil');
  await expect(page.getByTestId('sample-lexical-tokens')).toContainText('coffee');
  await page.locator('[data-tour="translation"]').click();
  await page.getByPlaceholder('Enter unknown language text to translate…').fill(source);
  await expect(page.getByTestId('lexical-translation')).toHaveText('water, Tamil coffee! [未知]');
  await page.getByRole('button', { name: '[未知]', exact: true }).click();
  await page.getByRole('button', { name: 'Define', exact: true }).click();
  await page.getByLabel('Translation meaning', { exact: true }).fill('unknown');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('lexical-translation')).toHaveText('water, Tamil coffee! unknown');
  await expect.poll(async () => (await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json()).dictionary.map((entry: { alien_word: string }) => entry.alien_word)).toContain('未知');
  await page.locator('[data-tour="vocabulary"]').click();
  await page.getByPlaceholder('Search dictionary…').fill('cafe\u0301');
  await expect(page.getByText('café', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('No matches found.', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('unicode-vocabulary.png') });
});

test('W16 explicit senses, aliases and case policy survive UI save and reload', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: {
    name: 'Explicit lexical policy', dictionary: [word('word', 'Tal', 'river / finance')],
  } })).json();
  await openProfile(page, server.url, profile.name);
  await page.locator('[data-tour="vocabulary"]').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Alien form aliases', { exact: true }).fill('Tál');
  await page.getByRole('button', { name: 'Add explicit sense', exact: true }).click();
  await page.getByLabel('Sense 1 meaning', { exact: true }).fill('river bank');
  await page.getByLabel('Sense 1 aliases', { exact: true }).fill('shore');
  await page.getByRole('button', { name: 'Add explicit sense', exact: true }).click();
  await page.getByLabel('Sense 2 meaning', { exact: true }).fill('financial bank');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Word matching settings', { exact: true }).click();
  await page.getByLabel('Case-sensitive matching').check();
  await expect.poll(async () => (await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json()).lexical_policy?.caseSensitive).toBe(true);
  const saved = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  expect(saved.dictionary[0]).toMatchObject({ english_meaning: 'river / finance', form_aliases: ['Tál'], senses: [
    { meaning: 'river bank', aliases: ['shore'] }, { meaning: 'financial bank', aliases: [] },
  ] });
  await openProfile(page, server.url, profile.name);
  await page.locator('[data-tour="translation"]').click();
  await page.getByPlaceholder('Enter unknown language text to translate…').fill('Tal tal Ta\u0301l');
  await expect(page.getByTestId('lexical-translation')).toHaveText('⟦river bank | financial bank⟧ [tal] ⟦river bank | financial bank⟧');
  await page.getByRole('button', { name: '⟦river bank | financial bank⟧', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Define', exact: true })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('competing-senses.png') });
  await page.getByRole('button', { name: 'English → Alien', exact: true }).click();
  await page.getByPlaceholder('Type English text…').fill('shore financial bank finance');
  await page.getByRole('button', { name: 'Translate', exact: true }).click();
  await expect(page.getByTestId('reverse-translation')).toHaveText('Tal Tal [finance]');
});

test('W16 legacy reverse phrases and competing segmentations remain explicit', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: {
    name: 'Segmentation alternatives', lexical_policy: { caseSensitive: false, apostrophes: 'internal', hyphens: 'internal', segmentation: 'dictionary' },
    dictionary: [word('speak', 'x', 'to speak'), word('slash', 'y', 'star / light'), word('water', '水', 'water'), word('fire', '火', 'fire'), word('steam', '水火', 'steam')],
    samples: [{ id: 'sample', alien_text: '水火', english_translation: null, source: 'field', phonetic_notes: '', decoded: false, audio_id: null, ipa: null, created_at: now }],
  } })).json();
  await openProfile(page, server.url, profile.name);
  await page.getByText('水火', { exact: true }).click();
  await expect(page.getByTestId('sample-lexical-tokens')).toContainText('⟦水 → water | steam | 火 → fire⟧');
  await page.locator('[data-tour="translation"]').click();
  await page.getByPlaceholder('Enter unknown language text to translate…').fill('水火!');
  await expect(page.getByTestId('lexical-translation')).toHaveText('⟦水 → water | steam | 火 → fire⟧!');
  await page.getByRole('button', { name: 'English → Alien', exact: true }).click();
  await page.getByPlaceholder('Type English text…').fill('to speak, to! star / light; star light');
  await page.getByRole('button', { name: 'Translate', exact: true }).click();
  await expect(page.getByTestId('reverse-translation')).toHaveText('x, [to]! y; [star] [light]');
});
