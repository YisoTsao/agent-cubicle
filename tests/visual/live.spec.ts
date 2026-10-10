import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// Live review capture (not a pixel baseline): the multi-session scenario mid-run, with the dev
// panel open, showing two agents at two desks driven by the real hub.

const OUT = resolve(__dirname, 'baseline')

test('live multi-session', async () => {
  test.setTimeout(60_000)
  const app = await electron.launch({
    args: ['--force-device-scale-factor=2', resolve(__dirname, '../..')],
    env: {
      ...process.env,
      CUBICLE_DIAGNOSTICS: '1',
      CUBICLE_SIMULATE: 'multi-session',
      CUBICLE_USER_DATA: mkdtempSync(join(tmpdir(), 'cubicle-live-')),
    },
  })
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1600, 900),
    )
    await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
    // ~11 s in: Claude Code is reading at desk A, Codex is running tests at the terminal.
    await expect(page.getByTestId('name-tag')).toHaveCount(2, { timeout: 5_000 })
    await page.waitForTimeout(10_500)
    await page.addStyleTag({ content: '.diagnostics{display:none}' })
    mkdirSync(OUT, { recursive: true })
    await page.screenshot({ path: resolve(OUT, 'live-multi-session.png') })
  } finally {
    await app.close()
  }
})
