import { test, expect, preparePage } from './fixtures';

test('W09 requires pairing, rejects unauthorized API calls and loads local assets under strict CSP', async ({ page, server, browser }) => {
  await preparePage(page);
  const anonymous = await browser.newContext();
  try {
    expect((await anonymous.request.get(`${server.url}/api/health`)).status()).toBe(401);
    expect((await anonymous.request.post(`${server.url}/api/audio/stages`, { data: Buffer.from('audio'), headers: { 'Content-Type': 'application/octet-stream' } })).status()).toBe(401);
    expect((await page.request.get(`${server.url}/api/health`, { headers: { Origin: 'https://untrusted.example' } })).status()).toBe(403);
  } finally { await anonymous.close(); }
  await page.context().clearCookies();
  const violations: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(server.url) && /^https?:/.test(request.url())) violations.push(request.url()); });
  const response = await page.goto(`${server.url}/app`);
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.getByRole('heading', { name: 'Local connection' })).toBeVisible();
  await page.getByLabel('Development pairing code').fill(server.secret);
  await page.getByRole('button', { name: 'Pair browser', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New Language', exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Local connection' })).toHaveCount(0);
  expect((await page.request.get(`${server.url}/api/health`)).status()).toBe(200);
  // Playwright evaluation bypasses CSP; execute the probe as an ordinary same-origin script.
  await page.route('**/csp-probe.js', route => route.fulfill({ contentType: 'text/javascript', body: "try { eval('1 + 1'); document.documentElement.dataset.evalBlocked = 'false' } catch { document.documentElement.dataset.evalBlocked = 'true' }" }));
  await page.evaluate(() => { const script = document.createElement('script'); script.src = '/csp-probe.js'; document.head.append(script); });
  await expect(page.locator('html')).toHaveAttribute('data-eval-blocked', 'true');
  const security = await page.evaluate(async () => {
    await document.fonts.ready;
    return { readableCookie: document.cookie, fontLoaded: [...document.fonts].some(font => font.family.replaceAll('"', '') === 'Space Grotesk' && font.status === 'loaded'), storage: JSON.stringify(localStorage) };
  });
  expect(security.fontLoaded).toBe(true);
  expect(security.readableCookie).not.toContain(server.secret); expect(security.storage).not.toContain(server.secret);
  expect(violations).toEqual([]); expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('secured-workbench.png'), animations: 'disabled' });
});
