import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// One showcase close-up per presentation state (Phase 2 review), cropped around the agent so
// poses, props and overlays can be judged at a glance. Contact sheet: `pnpm screenshots:sheet`.

const OUT = resolve(__dirname, 'baseline/states')
const ROOT = resolve(__dirname, '../..')
const STATES = [
  'IDLE',
  'THINKING',
  'READ',
  'WRITE',
  'EXEC',
  'WAITING_APPROVAL',
  'COMPLETED',
  'ERROR',
  'STALE',
] as const

type Pose = { screen: [number, number] | null; place: string; gesture: string; posture: string }

for (const state of STATES) {
  test(`state ${state}`, async () => {
    const app = await electron.launch({
      args: ['--force-device-scale-factor=2', ROOT],
      env: {
        ...process.env,
        CUBICLE_SHOWCASE: '1',
        CUBICLE_DIAGNOSTICS: '1',
        CUBICLE_QUALITY: 'balanced',
        CUBICLE_STATE: state,
        CUBICLE_USER_DATA: mkdtempSync(join(tmpdir(), 'cubicle-states-')),
      },
    })
    try {
      const page = await app.firstWindow()
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]!.setContentSize(1600, 900)
      })
      await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
      await page.waitForFunction(
        () => (window as unknown as { __cubicleStats?: unknown }).__cubicleStats,
      )
      await page.waitForTimeout(1200)
      await page.addStyleTag({ content: '.diagnostics,.dev-panel{display:none}' })

      const pose = (await page.evaluate(() =>
        (window as unknown as { __cubicleDev: { pose(id: string): unknown } }).__cubicleDev.pose(
          'claude-code',
        ),
      )) as Pose
      expect(pose.screen).not.toBeNull()

      mkdirSync(OUT, { recursive: true })
      const [cx, cy] = pose.screen!
      const w = 420
      const h = 380
      await page.screenshot({
        path: resolve(OUT, `${state}-closeup.png`),
        clip: { x: Math.max(0, cx - w / 2), y: Math.max(0, cy - h * 0.35), width: w, height: h },
      })
      writeFileSync(resolve(OUT, `${state}.json`), JSON.stringify(pose, null, 2) + '\n')
    } finally {
      await app.close()
    }
  })
}
