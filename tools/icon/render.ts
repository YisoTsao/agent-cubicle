// Renders the app icon from the real 3D scene so it always matches the product's look.
//
//   pnpm build && pnpm icon      → build/icon.png (1024×1024)
import { _electron as electron } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { isolatedEnv } from '../../tests/isolatedEnv'

const ROOT = resolve(__dirname, '../..')

async function main() {
  const app = await electron.launch({
    args: ['--force-device-scale-factor=2', ROOT],
    env: isolatedEnv({
      CUBICLE_SHOWCASE: '1',
      CUBICLE_STATE: 'WRITE',
      CUBICLE_QUALITY: 'high',
      CUBICLE_CLEAN_CAPTURE: '1',
    }),
  })
  const raw = join(mkdtempSync(join(tmpdir(), 'cubicle-icon-')), 'raw.png')
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1000, 760),
    )
    await page.waitForSelector('[data-ready="true"]')
    await page.addStyleTag({
      content: '.name-tag,.diagnostics,.overflow-badge{display:none!important}',
    })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: raw })
  } finally {
    await app.close()
  }
  // Rounded-square app icon: warm backdrop, scene scaled in with a little margin, soft edge.
  const out = join(ROOT, 'build/icon.png')
  execFileSync('convert', [
    '-size',
    '1024x1024',
    'xc:none',
    '-fill',
    '#f1e5d3',
    '-draw',
    'roundrectangle 64,64 960,960 190,190',
    '(',
    raw,
    '-resize',
    '900x900',
    '-gravity',
    'center',
    '-crop',
    '820x820+0+0',
    '+repage',
    '(',
    '-size',
    '820x820',
    'xc:none',
    '-fill',
    'white',
    '-draw',
    'roundrectangle 0,0 819,819 160,160',
    ')',
    '-alpha',
    'set',
    '-compose',
    'DstIn',
    '-composite',
    ')',
    '-gravity',
    'center',
    '-compose',
    'Over',
    '-composite',
    out,
  ])
  console.log(`wrote ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
