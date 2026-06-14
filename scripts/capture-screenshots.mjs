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
// Env knobs:
//   ONLY=marketing|workbench|both   (default both)
//   HEADLESS=1                       (default headed; workbench is more stable headless)
//
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const OUT = 'docs/screenshots'
const MARKETING = process.env.MARKETING_URL || 'http://localhost:4173/'
const WB = process.env.WB_URL || 'http://localhost:5173'
const API = process.env.API_URL || 'http://localhost:3001'
const ONLY = process.env.ONLY || 'both'
const HEADLESS = process.env.HEADLESS === '1'
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
  // Suppress the first-run onboarding tour so it doesn't overlay the captures.
  await ctx.addInitScript(() => { try { localStorage.setItem('xenolinguist-tour-completed', 'true') } catch (e) {} })
  if (process.env.SKIP_SEED !== '1') {
    await tryShot('seed-demo', async () => {
      const r = await ctx.request.post(`${API}/api/profiles/demo`)
      console.log('    seed-demo HTTP', r.status())
    })
  }
  const page = await ctx.newPage()
  const toLanding = async () => { await page.goto(`${WB}/app`, { waitUntil: 'domcontentloaded' }); await sleep(2200) }

  await tryShot('landing', async () => { await toLanding(); await shot(page, 'landing') })

  await tryShot('new-profile', async () => {
    await toLanding()
    await page.getByText('New Language', { exact: false }).first().click()
    await sleep(1000)
    await shot(page, 'new-profile')
  })

  await tryShot('sandbox', async () => {
    await toLanding()
    await page.getByText('Sandbox', { exact: false }).first().click()
    await sleep(1000)
    await shot(page, 'sandbox')
  })

  // Enter the Eridian workbench, then capture phases + overlays.
  let entered = false
  await tryShot('enter-eridian', async () => {
    await toLanding()
    await page.getByText('Eridian', { exact: false }).first().click()
    await sleep(1800)
    entered = true
  })
  if (!entered) { await ctx.close(); return }

  const phases = ['phase1-samples', 'phase2-numbers', 'phase3-vocabulary', 'phase4-grammar', 'phase5-translation', 'phase6-dashboard']
  for (let i = 0; i < 6; i++) {
    await tryShot(phases[i], async () => {
      await page.keyboard.press(String(i + 1))
      await sleep(1300)
      if (i === 4) {
        // Phase 5: type a known Eridian sentence so the live word-by-word
        // translation (colored by confidence) renders instead of the empty state.
        await page.getByPlaceholder(/unknown language text/i).first().fill('ka nesh lor, vel tor krash')
        await sleep(1800)
      }
      await shot(page, phases[i])
    })
  }

  await tryShot('command-palette', async () => {
    await page.keyboard.press('Control+k')
    await sleep(800)
    await shot(page, 'command-palette')
    await page.keyboard.press('Escape')
    await sleep(400)
  })

  await tryShot('ai-chat', async () => {
    await page.keyboard.press('Shift+A')
    await sleep(900)
    const input = page.locator('textarea, input[type="text"]').last()
    await input.fill('What base is the Eridian number system, and how confident are you?')
    await page.keyboard.press('Enter')
    await sleep(9000) // let the local model stream a reply
    await shot(page, 'ai-chat')
  })

  await ctx.close()
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({
  headless: HEADLESS,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
if (ONLY !== 'workbench') await captureMarketing(browser)
if (ONLY !== 'marketing') await captureWorkbench(browser)
await browser.close()
console.log(`\nDONE ${done.length}:`, done.join(', '))
if (skipped.length) console.log(`SKIPPED ${skipped.length}:`, skipped.join(' | '))
