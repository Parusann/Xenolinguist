// scripts/capture-screenshots.mjs
//
// Regenerates docs/screenshots/*.png from the running app.
//
// One-time local setup (Playwright is intentionally NOT a package.json dep):
//   npm install --no-save playwright && npx playwright install chromium
//
// Run two servers first (see docs/superpowers/plans/2026-06-14-readme-redo.md):
//   1. Public marketing build:  VITE_PUBLIC_SITE=true npm run build -w client
//                               npm run preview -w client -- --port 4173 --strictPort
//   2. Dev workbench:           npm run dev   (client :5173 + server :3001)
//
//   node scripts/capture-screenshots.mjs
//
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const OUT = 'docs/screenshots'
const MARKETING = process.env.MARKETING_URL || 'http://localhost:4173/'
const WB = process.env.WB_URL || 'http://localhost:5173'
const API = process.env.API_URL || 'http://localhost:3001'
const VW = { width: 1440, height: 900 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const done = []
const skipped = []

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  done.push(name)
  console.log('  ✓', name)
}
async function tryShot(label, fn) {
  try { await fn() } catch (e) { skipped.push(`${label}: ${e.message}`); console.log('  ✗', label, '-', e.message) }
}

async function captureMarketing(browser) {
  const page = await browser.newPage({ viewport: VW, deviceScaleFactor: 2 })
  await page.goto(MARKETING, { waitUntil: 'networkidle' })
  await sleep(2500) // let DecodeMoment + Vanta settle
  await tryShot('hero', async () => { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(400); await shot(page, 'hero') })
  const sections = [
    ['method', '#method'],
    ['demo', '#proof'],
    ['features', 'section:has(.features)'],
    ['privacy', '#privacy'],
    ['download', '#download'],
  ]
  for (const [name, sel] of sections) {
    await tryShot(name, async () => {
      await page.locator(sel).first().scrollIntoViewIfNeeded()
      await sleep(900)
      await shot(page, name)
    })
  }
  await page.close()
}

async function captureWorkbench(browser) {
  const ctx = await browser.newContext({ viewport: VW, deviceScaleFactor: 2 })
  // Seed the Eridian demo profile (idempotent enough for a fresh dev data dir).
  await tryShot('seed-demo', async () => {
    const r = await ctx.request.post(`${API}/api/profiles/demo`)
    if (!r.ok()) throw new Error(`seed HTTP ${r.status()}`)
  })
  const page = await ctx.newPage()
  await page.goto(`${WB}/app`, { waitUntil: 'networkidle' })
  await sleep(2000)

  // Profile selector (now lists Eridian)
  await tryShot('landing', async () => { await shot(page, 'landing') })

  // New profile setup form, then back
  await tryShot('new-profile', async () => {
    await page.getByText('New Language', { exact: false }).first().click()
    await sleep(900)
    await shot(page, 'new-profile')
    await page.keyboard.press('Escape')
    await sleep(500)
  })

  // Sandbox difficulty screen, then back to landing
  await tryShot('sandbox', async () => {
    await page.getByText('Sandbox', { exact: false }).first().click()
    await sleep(900)
    await shot(page, 'sandbox')
    await page.keyboard.press('Escape')
    await sleep(500)
  })

  // Enter the Eridian workbench
  await page.goto(`${WB}/app`, { waitUntil: 'networkidle' })
  await sleep(1200)
  await page.getByText('Eridian', { exact: false }).first().click()
  await sleep(1500)

  // Phases 1-6 via number keys
  const phases = ['phase1-samples', 'phase2-numbers', 'phase3-vocabulary', 'phase4-grammar', 'phase5-translation', 'phase6-dashboard']
  for (let i = 0; i < 6; i++) {
    await tryShot(phases[i], async () => {
      await page.keyboard.press(String(i + 1))
      await sleep(1200)
      await shot(page, phases[i])
    })
  }

  // Command palette
  await tryShot('command-palette', async () => {
    await page.keyboard.press('Control+k')
    await sleep(700)
    await shot(page, 'command-palette')
    await page.keyboard.press('Escape')
    await sleep(400)
  })

  // AI chat (connected) -- open, ask, wait for a streamed answer
  await tryShot('ai-chat', async () => {
    await page.keyboard.press('Shift+A')
    await sleep(800)
    const input = page.locator('textarea, input[type=text]').last()
    await input.fill('What base is the Eridian number system, and how confident are you?')
    await page.keyboard.press('Enter')
    await sleep(9000) // let the local model stream a reply
    await shot(page, 'ai-chat')
  })

  await ctx.close()
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: false })
await captureMarketing(browser)
await captureWorkbench(browser)
await browser.close()
console.log(`\nDONE ${done.length} shots:`, done.join(', '))
if (skipped.length) console.log(`SKIPPED ${skipped.length}:`, skipped.join(' | '))
