import { resolve } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { isolatedEnv } from '../isolatedEnv'

// Scene themes and the free camera: picked in settings, applied live, remembered on restart.

type Dev = {
  agents(): { character: string }[]
  pose(id: string): { screen: [number, number] | null } | null
}

const settings = (page: Page) => page.evaluate(() => window.cubicle.settings.get())

test('every scene renders with every character, without errors', async () => {
  const env = isolatedEnv({ CUBICLE_DIAGNOSTICS: '1', CUBICLE_STATE: 'WRITE' })
  const app = await electron.launch({ args: [resolve(__dirname, '../..')], env })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  await page.getByTestId('connect-button').click()
  for (const scene of ['hacker', 'night', 'space', 'office']) {
    await page.getByTestId(`scene-${scene}`).click()
    await expect(page.getByTestId(`scene-${scene}`)).toHaveAttribute('aria-checked', 'true')
    for (const character of ['chibi', 'duck', 'john']) {
      await page.getByTestId(`character-${character}`).click()
      await page.waitForTimeout(250)
    }
  }
  await page.waitForTimeout(500)
  expect(errors).toEqual([])
  await app.close()
})

test('pick the hacker scene and the free camera; both survive a restart', async () => {
  const env = isolatedEnv({ CUBICLE_DIAGNOSTICS: '1', CUBICLE_STATE: 'WRITE' })
  const launch = () => electron.launch({ args: [resolve(__dirname, '../..')], env })

  let app = await launch()
  let page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  expect(await settings(page)).toMatchObject({ scene: 'office', camera: 'iso' })

  await page.getByTestId('connect-button').click()
  await expect(page.getByTestId('scene-picker')).toBeVisible()
  await page.getByTestId('scene-hacker').click()
  await expect(page.getByTestId('scene-hacker')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('camera-free').click()
  await expect(page.getByTestId('camera-reset')).toBeVisible()
  // Dragging orbits the view (the agent's head moves on screen); reset brings it back.
  const head = async () =>
    page.evaluate(
      () => (window as unknown as { __cubicleDev: Dev }).__cubicleDev.pose('claude-code')?.screen,
    )
  await page.waitForTimeout(500)
  const before = (await head())!
  await page.mouse.move(640, 700)
  await page.mouse.down()
  await page.mouse.move(860, 690, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(700)
  const after = (await head())!
  expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeGreaterThan(20)
  await page.getByTestId('camera-reset').click()
  await page.waitForTimeout(700)
  const reset = (await head())!
  expect(Math.hypot(reset[0] - before[0], reset[1] - before[1])).toBeLessThan(6)
  // The app keeps rendering and the agent keeps its character through the switches.
  const dev = (p: Page) =>
    p.evaluate(() => (window as unknown as { __cubicleDev: Dev }).__cubicleDev.agents())
  expect(await dev(page)).toHaveLength(1)
  await page.waitForTimeout(600)
  expect(await settings(page)).toMatchObject({ scene: 'hacker', camera: 'free' })
  await app.close()

  app = await launch()
  page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  await expect.poll(async () => (await settings(page)).scene).toBe('hacker')
  expect(await settings(page)).toMatchObject({ camera: 'free' })
  // Back to the office / fixed view.
  await page.getByTestId('connect-button').click()
  await page.getByTestId('scene-office').click()
  await page.getByTestId('camera-iso').click()
  await page.waitForTimeout(600)
  expect(await settings(page)).toMatchObject({ scene: 'office', camera: 'iso' })
  await app.close()
})
