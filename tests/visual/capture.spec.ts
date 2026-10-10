import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// Fixed-camera showcase captures (SPEC §6 / Phase 1 acceptance). Writes PNGs + render stats
// to tests/visual/baseline so every visual change can be compared against the same framing.

const OUT = resolve(__dirname, 'baseline')
const ROOT = resolve(__dirname, '../..')

const CASES = [
  { name: '1080p-1x', scale: 1, quality: 'balanced' },
  { name: '1080p-2x', scale: 2, quality: 'balanced' },
  { name: '1080p-2x-high', scale: 2, quality: 'high' },
  { name: '1080p-1x-low', scale: 1, quality: 'low' },
] as const

for (const c of CASES) {
  test(`capture ${c.name}`, async () => {
    const app = await electron.launch({
      args: [`--force-device-scale-factor=${c.scale}`, ROOT],
      env: {
        ...process.env,
        CUBICLE_SHOWCASE: '1',
        CUBICLE_DIAGNOSTICS: '1',
        CUBICLE_QUALITY: c.quality,
        CUBICLE_USER_DATA: mkdtempSync(join(tmpdir(), 'cubicle-visual-')),
      },
    })
    try {
      const page = await app.firstWindow()
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]!
        win.setContentSize(1920, 1080)
        win.center()
      })
      await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
      // Let shadows, AO and stats settle.
      await page.waitForFunction(
        () => (window as unknown as { __cubicleStats?: unknown }).__cubicleStats,
      )
      await page.waitForTimeout(1500)
      const stats = await page.evaluate(
        () => (window as unknown as { __cubicleStats: unknown }).__cubicleStats,
      )
      const size = await page.evaluate(() => ({
        w: window.innerWidth,
        h: window.innerHeight,
        dpr: window.devicePixelRatio,
      }))

      mkdirSync(OUT, { recursive: true })
      // Hide the diagnostics overlay for the image itself.
      await page.addStyleTag({ content: '.diagnostics{display:none}' })
      await page.screenshot({ path: resolve(OUT, `${c.name}.png`) })
      writeFileSync(
        resolve(OUT, `${c.name}.json`),
        JSON.stringify({ ...c, size, stats }, null, 2) + '\n',
      )
      console.log(c.name, JSON.stringify({ size, stats }))
    } finally {
      await app.close()
    }
  })
}
