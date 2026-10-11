import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { isolatedEnv } from '../../tests/isolatedEnv'

// Whole-window screenshots of the scenes, to judge the backdrop (moon / Earth / stars).
//   tsx tools/preview/sky.ts <outDir> <scene>...
// Run `pnpm build` first.

const [outDir, ...scenes] = process.argv.slice(2)
if (!outDir || scenes.length === 0) {
  console.error('usage: sky.ts <outDir> <scene>...')
  process.exit(1)
}
const root = resolve(__dirname, '../..')
mkdirSync(outDir, { recursive: true })

async function main(): Promise<void> {
  for (const scene of scenes) {
    const app = await electron.launch({
      args: ['--force-device-scale-factor=2', root],
      env: {
        ...isolatedEnv(),
        CUBICLE_SHOWCASE: '1',
        CUBICLE_QUALITY: 'balanced',
        CUBICLE_SCENE: scene,
        CUBICLE_USER_DATA: mkdtempSync(join(tmpdir(), 'cubicle-sky-')),
      },
    })
    try {
      const page = await app.firstWindow()
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]!.setContentSize(1600, 900)
      })
      await page.waitForSelector('[data-testid="stage"][data-ready="true"]')
      await page.waitForTimeout(2000)
      const file = resolve(outDir, `${scene}.png`)
      await page.screenshot({ path: file })
      console.log('wrote', file)
    } finally {
      await app.close()
    }
  }
}

void main()
