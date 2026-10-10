import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { isolatedEnv } from '../../tests/isolatedEnv'

// Close-ups of one character in the real office scene, one image per state (showcase mode).
//   tsx tools/preview/scene.ts <outDir> <character> <STATE>...
// Run `pnpm build` first.

const [outDir, character, ...states] = process.argv.slice(2)
if (!outDir || !character || states.length === 0) {
  console.error('usage: scene.ts <outDir> <character> <STATE>...')
  process.exit(1)
}
const root = resolve(__dirname, '../..')
mkdirSync(outDir, { recursive: true })

type Pose = { screen: [number, number] | null }

async function main(): Promise<void> {
  for (const state of states) {
    const app = await electron.launch({
      args: ['--force-device-scale-factor=2', root],
      env: {
        ...isolatedEnv(),
        CUBICLE_SHOWCASE: '1',
        CUBICLE_DIAGNOSTICS: '1',
        CUBICLE_QUALITY: 'balanced',
        CUBICLE_STATE: state,
        CUBICLE_CHARACTER: character,
        CUBICLE_USER_DATA: mkdtempSync(join(tmpdir(), 'cubicle-scene-')),
      },
    })
    try {
      const page = await app.firstWindow()
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]!.setContentSize(1600, 900)
      })
      await page.waitForSelector('[data-testid="stage"][data-ready="true"]')
      await page.waitForFunction(
        () => (window as unknown as { __cubicleStats?: unknown }).__cubicleStats,
      )
      await page.waitForTimeout(1500)
      await page.addStyleTag({ content: '.diagnostics,.dev-panel{display:none}' })
      const pose = (await page.evaluate(() =>
        (window as unknown as { __cubicleDev: { pose(id: string): unknown } }).__cubicleDev.pose(
          'claude-code',
        ),
      )) as Pose | null
      const [cx, cy] = pose?.screen ?? [800, 450]
      const w = 520
      const h = 460
      const file = resolve(outDir, `${character}-${state}.png`)
      await page.screenshot({
        path: file,
        clip: { x: Math.max(0, cx - w / 2), y: Math.max(0, cy - h * 0.38), width: w, height: h },
      })
      console.log('wrote', file)
    } finally {
      await app.close()
    }
  }
}

void main()
