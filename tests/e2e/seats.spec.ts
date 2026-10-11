import { resolve } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { isolatedEnv } from '../isolatedEnv'

// Office size (2 / 4 / 6 desks), a character per seat, and clicking a character to change it.

type Agent = { name: string; deskId: string; character: string }
const agents = (page: Page) =>
  page.evaluate(
    () =>
      // The dev API appears a moment after the stage is ready.
      (window as unknown as { __cubicleDev?: { agents(): Agent[] } }).__cubicleDev?.agents() ?? [],
  )

const launch = (env: Record<string, string>) =>
  electron.launch({ args: [resolve(__dirname, '../..')], env })

test('desk count: 6 desks seat six agents, the rest wait; the choice survives a restart', async () => {
  const env = isolatedEnv({ CUBICLE_DIAGNOSTICS: '1', CUBICLE_SIMULATE: 'crowd' })
  let app = await launch(env)
  let page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  // Default: two desks.
  await expect
    .poll(async () => (await agents(page)).length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(4)
  expect((await agents(page)).filter((a) => a.deskId.startsWith('desk-'))).toHaveLength(2)

  await page.getByTestId('connect-button').click()
  await expect(page.getByTestId('desks-2')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('desks-6').click()
  await expect(page.getByTestId('desks-6')).toHaveAttribute('aria-checked', 'true')
  await expect
    .poll(async () => (await agents(page)).filter((a) => a.deskId.startsWith('desk-')).length)
    .toBe(6)
  expect(new Set((await agents(page)).map((a) => a.deskId)).size).toBeGreaterThanOrEqual(6)

  await page.getByTestId('desks-4').click()
  await expect
    .poll(async () => (await agents(page)).filter((a) => a.deskId.startsWith('desk-')).length)
    .toBe(4)

  await page.getByTestId('desks-6').click()
  await page.waitForTimeout(600)
  await app.close()

  app = await launch(env)
  page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  await expect
    .poll(async () => (await agents(page)).filter((a) => a.deskId.startsWith('desk-')).length)
    .toBe(6)
  await app.close()
})

/** Click an agent's body in the scene (its screen position comes from the dev API). */
async function clickAgent(page: Page, deskId: string) {
  const at = await page.evaluate((desk) => {
    const dev = (
      window as unknown as {
        __cubicleDev: {
          agents(): { id: string; deskId: string }[]
          pose(id: string): { screen: [number, number] | null } | null
        }
      }
    ).__cubicleDev
    const agent = dev.agents().find((a) => a.deskId === desk)
    return agent ? dev.pose(agent.id)?.screen : null
  }, deskId)
  expect(at).toBeTruthy()
  await page.mouse.click(at![0], at![1])
}

test('a character per seat: pick by clicking, clear it, and it is remembered', async () => {
  const env = isolatedEnv({ CUBICLE_DIAGNOSTICS: '1', CUBICLE_SIMULATE: 'multi-session' })
  let app = await launch(env)
  let page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1400, 900)
  })
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  await expect.poll(async () => (await agents(page)).length).toBe(2)
  await page.waitForTimeout(3000) // let both sit down
  const byDesk = async () =>
    Object.fromEntries((await agents(page)).map((a) => [a.deskId, a.character]))
  expect(await byDesk()).toEqual({ 'desk-a': 'duck', 'desk-b': 'kuro' })

  await clickAgent(page, 'desk-b')
  await page.getByTestId('agent-pick-naughty').click()
  await expect.poll(byDesk).toEqual({ 'desk-a': 'duck', 'desk-b': 'naughty' })
  await clickAgent(page, 'desk-a')
  await page.getByTestId('agent-pick-belle').click()
  await expect.poll(byDesk).toEqual({ 'desk-a': 'belle', 'desk-b': 'naughty' })
  await page.getByTestId('agent-pick-default').click()
  await expect.poll(byDesk).toEqual({ 'desk-a': 'duck', 'desk-b': 'naughty' })
  await page.waitForTimeout(600)
  await app.close()

  app = await launch(env)
  page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  await expect.poll(async () => (await agents(page)).length).toBe(2)
  await expect.poll(byDesk).toEqual({ 'desk-a': 'duck', 'desk-b': 'naughty' })
  await app.close()
})

test('settings no longer carry a per-seat list (clicking a character is the way)', async () => {
  const app = await launch(isolatedEnv({ CUBICLE_DIAGNOSTICS: '1', CUBICLE_STATE: 'WRITE' }))
  const page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  await page.getByTestId('connect-button').click()
  await expect(page.getByTestId('integration-panel')).toBeVisible()
  await expect(page.getByTestId('seat-assignments')).toHaveCount(0)
  await app.close()
})

test('click a character in the scene to change it', async () => {
  const env = isolatedEnv({ CUBICLE_DIAGNOSTICS: '1', CUBICLE_SIMULATE: 'multi-session' })
  const app = await launch(env)
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1400, 900)
  })
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  await expect.poll(async () => (await agents(page)).length).toBe(2)
  // Let both agents sit down, then click the first agent's body.
  await page.waitForTimeout(3000)
  const screen = await page.evaluate(
    () =>
      (
        window as unknown as {
          __cubicleDev: {
            pose(id: string): { screen: [number, number] | null } | null
            agents(): { id: string }[]
          }
        }
      ).__cubicleDev.pose(
        (
          window as unknown as { __cubicleDev: { agents(): { id: string }[] } }
        ).__cubicleDev.agents()[0]!.id,
      )?.screen,
  )
  expect(screen).toBeTruthy()
  await page.mouse.click(screen![0], screen![1])
  await expect(page.getByTestId('agent-picker')).toBeVisible()
  await page.getByTestId('agent-pick-nicky').click()
  await expect
    .poll(async () => (await agents(page)).find((a) => a.deskId === 'desk-a')?.character)
    .toBe('nicky')
  await page.getByTestId('agent-pick-default').click()
  await expect
    .poll(async () => (await agents(page)).find((a) => a.deskId === 'desk-a')?.character)
    .toBe('duck')
  await app.close()
})

test('in a 6-desk office the name tag stays above its character', async () => {
  const app = await launch(
    isolatedEnv({
      CUBICLE_DIAGNOSTICS: '1',
      CUBICLE_DESKS: '6',
      CUBICLE_SIMULATE: 'crowd',
    }),
  )
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1600, 1000)
  })
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  await expect.poll(async () => (await agents(page)).length, { timeout: 20_000 }).toBeGreaterThan(5)
  await page.waitForTimeout(4000)
  const gaps = await page.evaluate(() => {
    type Dev = {
      agents(): { id: string; name: string }[]
      pose(id: string): { screen: [number, number] | null } | null
    }
    const dev = (window as unknown as { __cubicleDev: Dev }).__cubicleDev
    const tags = [...document.querySelectorAll('.name-tag')].map((el) => ({
      text: el.textContent ?? '',
      box: el.getBoundingClientRect(),
    }))
    return dev.agents().flatMap((a) => {
      const screen = dev.pose(a.id)?.screen
      const tag = tags.find((t) => t.text.startsWith(a.name))
      if (!screen || !tag) return []
      // Horizontal distance between the character's screen position and its tag's centre.
      return [{ name: a.name, dx: Math.abs(tag.box.left + tag.box.width / 2 - screen[0]) }]
    })
  })
  expect(gaps.length).toBeGreaterThan(5)
  for (const g of gaps) expect(g.dx, `${g.name} tag is beside its character`).toBeLessThan(60)
  await app.close()
})
