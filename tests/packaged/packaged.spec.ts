import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { isolatedEnv } from '../isolatedEnv'

// Smoke tests against the packaged app (SPEC §10 Phase 5): production guards are active and the
// real integrations work from inside the asar.

const ROOT = resolve(__dirname, '../..')
const EXECUTABLE: Record<string, string> = {
  darwin: join(ROOT, `dist/mac-${process.arch}/AgentCubicle.app/Contents/MacOS/AgentCubicle`),
  linux: join(ROOT, 'dist/linux-unpacked/agentcubicle'),
  win32: join(ROOT, 'dist/win-unpacked/AgentCubicle.exe'),
}
const exe = EXECUTABLE[process.platform]!

test.skip(!existsSync(exe), `packaged app not found at ${exe} — run \`pnpm dist:dir\``)

test('packaged app: guards, server and persisted settings', async () => {
  const env = isolatedEnv()
  const launch = () => electron.launch({ executablePath: exe, env })

  let app = await launch()
  let page = await app.firstWindow()
  await expect(page).toHaveTitle('AgentCubicle')
  expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
  expect((await page.evaluate(() => window.cubicle.ping())).pong).toBe(true)

  // Dev tools are disabled in production builds.
  await expect(page.evaluate(() => window.cubicle.dev.listScenarios())).rejects.toThrow(/disabled/)
  await expect(page.evaluate(() => window.cubicle.dev.runScenario('normal-task'))).rejects.toThrow(
    /disabled/,
  )

  // Strict CSP.
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')
  expect(csp).toContain("script-src 'self'")
  expect(csp).not.toMatch(/script-src[^;]*unsafe/)

  // Local server works from the packaged build.
  const endpointFile = join(env['CUBICLE_HOME']!, 'endpoint.json')
  await expect.poll(() => existsSync(endpointFile)).toBe(true)
  const { port, eventUrl } = JSON.parse(readFileSync(endpointFile, 'utf8')) as {
    port: number
    eventUrl: string
  }
  const health = await fetch(`http://127.0.0.1:${port}/api/health`)
  expect(health.status).toBe(200)
  const token = readFileSync(join(env['CUBICLE_HOME']!, 'token'), 'utf8').trim()
  const res = await fetch(eventUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      eventId: 'pkg-1',
      agentId: 'smoke',
      sessionId: 's',
      type: 'TASK_STARTED',
      timestamp: Date.now(),
      source: 'webhook',
    }),
  })
  expect(res.status).toBe(202)
  await expect
    .poll(async () => (await page.evaluate(() => window.cubicle.getSnapshot())).sessions.length)
    .toBe(1)

  // Preferences survive a restart.
  await page.evaluate(() => window.cubicle.settings.set({ quality: 'low', alwaysOnTop: true }))
  await app.close()
  app = await launch()
  page = await app.firstWindow()
  expect(await page.evaluate(() => window.cubicle.settings.get())).toEqual({
    quality: 'low',
    alwaysOnTop: true,
  })
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isAlwaysOnTop()),
  ).toBe(true)
  await app.close()
})
