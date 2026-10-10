import { resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { isolatedEnv } from '../isolatedEnv'

// Switching characters: picked in the settings panel, applied to the live agents without
// touching their state, remembered across restarts, and a URL override for tests.

type Dev = { agents(): { state: string; character: string }[] }
const dev = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __cubicleDev: Dev }).__cubicleDev.agents())

test('pick a character in settings: applies immediately and survives a restart', async () => {
  const env = isolatedEnv({ CUBICLE_DIAGNOSTICS: '1', CUBICLE_STATE: 'WRITE' })
  const launch = () => electron.launch({ args: [resolve(__dirname, '../..')], env })

  let app = await launch()
  let page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  expect(await dev(page)).toMatchObject([{ state: 'WRITE', character: 'duck' }]) // default: 預設組合, first desk

  await page.getByTestId('connect-button').click()
  await expect(page.getByTestId('character-picker')).toBeVisible()
  for (const id of ['chibi', 'duck', 'kuro', 'naughty', 'nicky', 'belle', 'john']) {
    await page.getByTestId(`character-${id}`).click()
    await expect(page.getByTestId(`character-${id}`)).toHaveAttribute('aria-checked', 'true')
    // Same state, different body.
    expect(await dev(page)).toMatchObject([{ state: 'WRITE', character: id }])
  }
  await page.getByTestId('character-john').click()
  await page.waitForTimeout(600) // settings are written after a short debounce
  await app.close()

  app = await launch()
  page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  await expect.poll(async () => (await dev(page))[0]?.character).toBe('john')
  await app.close()
})

test('?character= overrides the saved choice (used by screenshots)', async () => {
  const app = await electron.launch({
    args: [resolve(__dirname, '../..')],
    env: isolatedEnv({
      CUBICLE_DIAGNOSTICS: '1',
      CUBICLE_STATE: 'IDLE',
      CUBICLE_CHARACTER: 'duck',
    }),
  })
  const page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  expect(await dev(page)).toMatchObject([{ character: 'duck' }])
  await app.close()
})
