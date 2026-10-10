import { resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { isolatedEnv } from '../isolatedEnv'

// Phase 5: a hidden window stops rendering (production behaviour, so the test-only
// keep-rendering switch is turned off here) and resumes when shown again.

test('rendering pauses while the window is hidden and resumes when shown', async () => {
  const app = await electron.launch({
    args: [resolve(__dirname, '../..')],
    env: isolatedEnv({ CUBICLE_DIAGNOSTICS: '1', CUBICLE_KEEP_RENDERING: '0' }),
  })
  try {
    const page = await app.firstWindow()
    await page.waitForFunction(
      () => (window as unknown as { __cubicleStats?: unknown }).__cubicleStats,
    )
    // The stats probe publishes a new object every ~0.5 s, but only while frames are drawn.
    const freshStats = () =>
      page.evaluate(async () => {
        const w = window as unknown as { __cubicleStats?: unknown }
        const before = w.__cubicleStats
        await new Promise((r) => setTimeout(r, 1500))
        return w.__cubicleStats !== before
      })

    expect(await freshStats()).toBe(true)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide())
    await page.waitForTimeout(300)
    expect(await freshStats()).toBe(false)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.show())
    await page.waitForTimeout(300)
    expect(await freshStats()).toBe(true)

    // Minimize behaves the same.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize())
    await page.waitForTimeout(800)
    expect(await freshStats()).toBe(false)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.restore())
    await page.waitForTimeout(800)
    expect(await freshStats()).toBe(true)
  } finally {
    await app.close()
  }
})
