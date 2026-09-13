import { test, expect } from '@playwright/test';

test('public dictionary uses canonical meanings without model or API requests', async ({ page }) => {
  const unexpected: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/') || new URL(request.url()).origin !== 'http://127.0.0.1:4178') unexpected.push(request.url()); });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Source — Eridian' }).fill('NESH tor missing');
  await expect(page.getByRole('status', { name: 'Dictionary result' })).toContainText('star / light sky [?]');
  await expect(page.getByText('3 words · 2 matched · 1 unknown')).toBeVisible();
  await page.getByRole('textbox', { name: 'Source — Eridian' }).fill('sa ren ku vol');
  await expect(page.getByRole('status', { name: 'Dictionary result' })).toHaveText('one two three four');
  await page.getByRole('textbox', { name: 'Source — Eridian' }).fill('');
  await expect(page.getByText('0 words · 0 matched · 0 unknown')).toBeVisible();
  await page.goto('app');
  await expect(page).toHaveURL(/\/Xenolinguist\/#download$/);
  await expect(page.getByRole('heading', { name: /Choose with/ })).toBeInViewport();
  expect(unexpected).toEqual([]); expect(errors).toEqual([]);
});

test('download actions expose a pinned release and distinguish the preview', async ({ page }) => {
  const failed: string[] = []; page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  await page.goto('./');
  await page.getByRole('button', { name: 'Download for Windows' }).first().click();
  await expect(page.locator('#download')).toBeInViewport();
  await expect(page.getByRole('link', { name: 'Download v1.0.0 for Windows' })).toHaveAttribute('href', 'https://github.com/Parusann/Xenolinguist/releases/download/v1.0.0/Xenolinguist-Setup-1.0.0.exe');
  await expect(page.locator('#download')).toContainText('have not been released in a new installer');
  await expect(page.locator('#download')).toContainText('2026-06-14');
  for (const anchor of await page.locator('a[href^="#"]').all()) {
    const href = await anchor.getAttribute('href'); expect(await page.locator(href!).count()).toBe(1);
  }
  expect(failed).toEqual([]);
});

test('example controls and dictionary input work from the keyboard', async ({ page }) => {
  await page.goto('./');
  const first = page.getByRole('button', { name: 'Show example 1', exact: true });
  await first.focus(); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show example 2', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByText('ka ix mok', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show example 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Pause examples' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Try dictionary demo' }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#proof')).toBeInViewport();
  const input = page.getByRole('textbox', { name: 'Source — Eridian' }); await input.focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('tor');
  await expect(page.getByRole('status', { name: 'Dictionary result' })).toHaveText('sky');
});

for (const width of [320, 390, 768, 1440]) test(`public page fits ${width}px and loads its assets`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const failed: string[] = []; page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  await page.goto('./'); await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const selector of ['.hero-nav', '.hero-headline', '.demo-moment', '#proof textarea', '.demo-frame', '.download-panel', '.hero-footer']) {
    const bounds = await page.locator(selector).boundingBox(); expect(bounds).not.toBeNull();
    expect(bounds!.x, selector).toBeGreaterThanOrEqual(-1); expect(bounds!.x + bounds!.width, selector).toBeLessThanOrEqual(width + 1);
  }
  await page.screenshot({ path: info.outputPath('hero.png') });
  await page.locator('#proof').evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 88)); await page.screenshot({ path: info.outputPath('dictionary.png') });
  await page.locator('#download').evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 88)); await page.screenshot({ path: info.outputPath('download.png') });
  expect(failed).toEqual([]);
});


test('automatic examples pause and resume without starting inference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./'); await page.clock.install();
  await page.getByRole('button', { name: 'Pause examples' }).click();
  await page.clock.fastForward(7000);
  await expect(page.getByRole('button', { name: 'Show example 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Resume examples' }).click();
  await page.clock.fastForward(7000);
  await expect(page.getByRole('button', { name: 'Show example 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
