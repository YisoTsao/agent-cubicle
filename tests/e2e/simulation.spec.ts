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

// Phase 3 acceptance (SPEC §10): simulator scenarios flow through the real main-process EventHub
// and IPC, and drive the 3D characters end-to-end.

let app: ElectronApplication
let page: Page

interface AgentRow {
  id: string
  name: string
  state: string
  deskId: string
}
type Dev = {
  agents(): AgentRow[]
  pose(id: string): { place: string; moving: boolean } | null
}

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve(__dirname, '../..')],
    env: {
      ...process.env,
      CUBICLE_DIAGNOSTICS: '1',
      CUBICLE_USER_DATA: mkdtempSync(join(tmpdir(), 'cubicle-sim-')),
    },
  })
  page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  await page.waitForFunction(() => (window as unknown as { __cubicleDev?: unknown }).__cubicleDev)
})

test.afterAll(async () => {
  await app?.close()
})

test.beforeEach(async () => {
  await page.evaluate(() => window.cubicle.dev.reset())
  await expect.poll(() => agents()).toEqual([])
})

const agents = () =>
  page.evaluate(() => (window as unknown as { __cubicleDev: Dev }).__cubicleDev.agents())

const run = (name: string, speed: number) =>
  page.evaluate(([n, s]) => window.cubicle.dev.runScenario(n as string, s as number), [
    name,
    speed,
  ] as const)

interface Watch {
  states: Record<string, string[]>
  places: Record<string, string[]>
  desks: Record<string, string>
}

/**
 * Poll every 100 ms (from the test side — the app's CSP rightly forbids eval in the page),
 * collecting distinct consecutive states per agent and the places each character settled at.
 */
async function watch(
  until: (states: Record<string, string[]>) => boolean,
  timeoutMs: number,
): Promise<Watch> {
  const w: Watch = { states: {}, places: {}, desks: {} }
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const rows = await page.evaluate(() => {
      const dev = (window as unknown as { __cubicleDev: Dev }).__cubicleDev
      return dev.agents().map((a) => ({ ...a, pose: dev.pose(a.id) }))
    })
    for (const a of rows) {
      const s = (w.states[a.name] ??= [])
      if (s.at(-1) !== a.state) s.push(a.state)
      w.desks[a.name] = a.deskId
      const p = (w.places[a.name] ??= [])
      if (a.pose && !a.pose.moving && p.at(-1) !== a.pose.place) p.push(a.pose.place)
    }
    if (until(w.states) || Date.now() > deadline) return w
    await page.waitForTimeout(100)
  }
}

test('normal-task drives one character through the whole lifecycle', async () => {
  test.setTimeout(90_000)
  // Real-time speed: at higher speeds the run step is shorter than the walk to the terminal,
  // and (by design, see PLACE_DEBOUNCE_MS) the character would rightly stay at its desk.
  await run('normal-task', 1)
  const { states, places } = await watch(
    (s) => (s['Claude Code'] ?? []).includes('COMPLETED') && s['Claude Code']!.at(-1) === 'IDLE',
    45_000,
  )
  const seq = states['Claude Code']!
  // Order matters: each milestone appears after the previous one.
  let i = -1
  for (const milestone of ['THINKING', 'READ', 'WRITE', 'EXEC', 'COMPLETED', 'IDLE']) {
    const next = seq.indexOf(milestone, i + 1)
    expect(next, `${milestone} after index ${i} in ${seq.join(' → ')}`).toBeGreaterThan(i)
    i = next
  }
  // The character physically went to the terminal for EXEC and to the sofa for IDLE.
  expect(places['Claude Code']).toContain('terminal')
  await expect
    .poll(async () => (await watch(() => true, 0)).places['Claude Code']?.at(-1), {
      timeout: 15_000,
    })
    .toBe('lounge')
})

test('approval: the character waits (sticky) and then carries on', async () => {
  await run('approval', 4)
  const { states } = await watch((s) => (s['Claude Code'] ?? []).includes('COMPLETED'), 20_000)
  const seq = states['Claude Code']!
  const wait = seq.indexOf('WAITING_APPROVAL')
  expect(wait).toBeGreaterThan(0)
  expect(seq.slice(wait + 1)).toContain('COMPLETED')
})

test('multi-session: two agents, two desks, independent states', async () => {
  await run('multi-session', 4)
  const { states, desks } = await watch(
    (s) =>
      (s['Claude Code'] ?? []).includes('COMPLETED') && (s['Codex CLI'] ?? []).includes('ERROR'),
    20_000,
  )
  expect(new Set(Object.values(desks))).toEqual(new Set(['desk-a', 'desk-b']))
  expect(states['Codex CLI']).toContain('EXEC')
  expect(states['Claude Code']).not.toContain('ERROR')
  await expect(page.getByTestId('name-tag')).toHaveCount(2)
})

test('out-of-order: the late READ never reaches the character', async () => {
  await run('out-of-order', 4)
  const { states } = await watch((s) => (s['Claude Code'] ?? []).includes('COMPLETED'), 15_000)
  expect(states['Claude Code']).not.toContain('READ')
  // The last duplicate is delivered just after COMPLETED, so poll for it.
  await expect
    .poll(async () => {
      const diag = await page.evaluate(() => window.cubicle.dev.diagnostics())
      return diag.entries.filter((e) => e.outcome === 'duplicate').length
    })
    .toBeGreaterThanOrEqual(3)
})

test('dev IPC validates its input', async () => {
  await expect(page.evaluate(() => window.cubicle.dev.runScenario('rm -rf /'))).rejects.toThrow()
  await expect(
    page.evaluate(() => window.cubicle.dev.runScenario('normal-task', 1e9)),
  ).rejects.toThrow()
})
