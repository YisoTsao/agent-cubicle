import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve(__dirname, '../..')],
    env: { ...process.env, CUBICLE_USER_DATA: mkdtempSync(join(tmpdir(), 'cubicle-e2e-')) },
  })
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
})

test('opens the main window', async () => {
  await expect(page).toHaveTitle('AgentCubicle')
})

test('renderer reaches main via IPC ping', async () => {
  const result = await page.evaluate(() => window.cubicle.ping())
  expect(result.pong).toBe(true)
})

test('3D canvas mounts with a WebGL context', async () => {
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  const hasGl = await page.evaluate(() => !!document.querySelector('canvas')?.getContext('webgl2'))
  expect(hasGl).toBe(true)
})

test.describe('security checklist (SPEC §8)', () => {
  test('webPreferences are hardened', async () => {
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      // Undocumented but stable runtime API; not present in electron.d.ts.
      const wc = BrowserWindow.getAllWindows()[0]!.webContents as unknown as {
        getLastWebPreferences(): Record<string, unknown>
      }
      return wc.getLastWebPreferences()
    })
    expect(prefs).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    })
  })

  test('renderer has no Node globals and only the cubicle bridge', async () => {
    const env = await page.evaluate(() => ({
      require: typeof (globalThis as Record<string, unknown>)['require'],
      process: typeof (globalThis as Record<string, unknown>)['process'],
      bridgeKeys: Object.keys(window.cubicle).sort(),
    }))
    expect(env.require).toBe('undefined')
    expect(env.process).toBe('undefined')
    expect(env.bridgeKeys).toEqual(['dev', 'getSnapshot', 'onState', 'ping'])
  })

  test('CSP meta is present and strict in production build', async () => {
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content')
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
  })

  test('window.open is denied', async () => {
    const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
    await page.evaluate(() => window.open('https://example.com'))
    await page.waitForTimeout(300)
    const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
    expect(after).toBe(before)
  })

  test('navigation away from the app is blocked', async () => {
    const before = page.url()
    await page.evaluate(() => {
      window.location.href = 'https://example.com'
    })
    await page.waitForTimeout(300)
    expect(page.url()).toBe(before)
  })

  test('permission requests are denied', async () => {
    const state = await page.evaluate(async () => {
      const result = await navigator.permissions.query({ name: 'geolocation' })
      return result.state
    })
    expect(state).not.toBe('granted')
  })
})
