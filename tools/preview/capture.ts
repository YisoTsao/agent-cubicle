import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { isolatedEnv } from '../../tests/isolatedEnv'

// Renders single characters on a plain backdrop (renderer `?preview=` mode) for comparison with
// the reference art and for the picker thumbnails. Run `pnpm build` first.
//   tsx tools/preview/capture.ts <outDir> <size> <character[,opt=val...]>...
// e.g. tsx tools/preview/capture.ts /tmp/shots 600x660 duck,view=front kuro,view=iso

const [outDir, size = '600x660', ...specs] = process.argv.slice(2)
if (!outDir || specs.length === 0) {
  console.error('usage: capture.ts <outDir> <WxH> <character[,opt=val...]>...')
  process.exit(1)
}
const [w, h] = size.split('x').map(Number) as [number, number]
const root = resolve(__dirname, '../..')
mkdirSync(outDir, { recursive: true })

async function main(): Promise<void> {
  for (const spec of specs) {
    const app = await electron.launch({
      args: ['--force-device-scale-factor=1', root],
      env: { ...isolatedEnv(), CUBICLE_PREVIEW: spec, CUBICLE_SHOWCASE: '1' },
    })
    try {
      const page = await app.firstWindow()
      await app.evaluate(
        ({ BrowserWindow }, [cw, ch]) => {
          BrowserWindow.getAllWindows()[0]!.setContentSize(cw!, ch!)
        },
        [w, h],
      )
      await page.waitForSelector('[data-testid="stage"][data-ready="true"]')
      await page.waitForTimeout(1500)
      const name = spec.replace(/[^a-z0-9]+/gi, '_')
      await page.screenshot({ path: resolve(outDir, `${name}.png`) })
      console.log('wrote', resolve(outDir, `${name}.png`))
    } finally {
      await app.close()
    }
  }
}

void main()
