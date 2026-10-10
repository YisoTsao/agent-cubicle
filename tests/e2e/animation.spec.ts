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

// Phase 2 acceptance (SPEC §10): transitions never teleport; switching states / respawning
// characters does not grow GPU resources; missing clips are covered by unit tests.

const AGENT = 'claude-code'

let app: ElectronApplication
let page: Page

interface Pose {
  x: number
  z: number
  yaw: number
  moving: boolean
  place: string
  hips: [number, number, number]
  gesture: string | null
  posture: string | null
}
interface Stats {
  geometries: number
  textures: number
}

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve(__dirname, '../..')],
    env: {
      ...process.env,
      CUBICLE_DIAGNOSTICS: '1',
      CUBICLE_STATE: 'WRITE',
      CUBICLE_USER_DATA: mkdtempSync(join(tmpdir(), 'cubicle-anim-')),
    },
  })
  page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __cubicleDev?: { pose(id: string): unknown; stats(): unknown }
    }
    return w.__cubicleDev?.pose('claude-code') && w.__cubicleDev.stats()
  })
})

test.afterAll(async () => {
  await app?.close()
})

const setState = (state: string) =>
  page.evaluate(
    ([id, s]) =>
      (
        window as unknown as { __cubicleDev: { setState(id: string, s: string): void } }
      ).__cubicleDev.setState(id!, s!),
    [AGENT, state],
  )

const pose = () =>
  page.evaluate(
    (id) =>
      (window as unknown as { __cubicleDev: { pose(id: string): Pose } }).__cubicleDev.pose(id),
    AGENT,
  )

const stats = () =>
  page.evaluate(() =>
    (window as unknown as { __cubicleDev: { stats(): Stats } }).__cubicleDev.stats(),
  )

/** Sample the agent's pose every animation frame until it settles (or timeout). */
async function sampleUntilSettled(timeoutMs: number): Promise<Pose[]> {
  return page.evaluate(
    ([id, timeout]) =>
      new Promise<Pose[]>((done) => {
        const dev = (window as unknown as { __cubicleDev: { pose(id: string): Pose } }).__cubicleDev
        const out: Pose[] = []
        const start = performance.now()
        let settledFrames = 0
        let moved = false
        const tick = () => {
          const p = dev.pose(id as string)
          out.push(p)
          moved ||= p.moving
          settledFrames = p.moving ? 0 : settledFrames + 1
          // Place changes are debounced: wait for the walk to start, then past the sit-down
          // cross-fade, before declaring the transition finished.
          if ((moved && settledFrames > 45) || performance.now() - start > (timeout as number))
            done(out)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    [AGENT, timeoutMs] as const,
  )
}

function maxSteps(samples: Pose[]) {
  let root = 0
  let hips = 0
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!
    const b = samples[i]!
    root = Math.max(root, Math.hypot(b.x - a.x, b.z - a.z))
    hips = Math.max(
      hips,
      Math.hypot(b.hips[0] - a.hips[0], b.hips[1] - a.hips[1], b.hips[2] - a.hips[2]),
    )
  }
  return { root, hips }
}

test('dev panel is available in diagnostics mode', async () => {
  await expect(page.getByTestId('dev-panel')).toBeVisible()
})

for (const [from, to, place] of [
  ['WRITE', 'EXEC', 'terminal'],
  ['EXEC', 'IDLE', 'lounge'],
  ['IDLE', 'READ', 'desk-a'],
] as const) {
  test(`${from} → ${to}: walks to ${place} without teleporting`, async () => {
    expect((await pose()).moving).toBe(false)
    await setState(to)
    const samples = await sampleUntilSettled(20_000)
    const last = samples.at(-1)!
    expect(last.place).toBe(place)
    expect(last.moving).toBe(false)
    expect(samples.some((s) => s.moving)).toBe(true)
    expect(samples.some((s) => s.posture === 'walk')).toBe(true)

    const step = maxSteps(samples)
    // Root: bounded by walk speed × clamped frame time (1.5 m/s × 1/20 s = 0.075 m).
    expect(step.root).toBeLessThanOrEqual(0.076)
    // Hips (root motion + posture cross-fades): any snap between poses would exceed this.
    expect(step.hips).toBeLessThan(0.1)
  })
}

test('state churn and respawns do not leak GPU resources', async () => {
  test.setTimeout(90_000)
  const states = [
    'IDLE',
    'THINKING',
    'READ',
    'WRITE',
    'EXEC',
    'WAITING_APPROVAL',
    'COMPLETED',
    'ERROR',
    'STALE',
  ]
  // Warm-up: make every lazily created resource exist once. Hand props only appear once the
  // agent has settled (mug on the sofa, book at the desk), so let those two states finish.
  for (const s of states) {
    await setState(s)
    await page.waitForTimeout(80)
  }
  for (const s of ['IDLE', 'READ']) {
    await setState(s)
    await sampleUntilSettled(20_000)
  }
  await page.evaluate(() =>
    (window as unknown as { __cubicleDev: { respawn(): void } }).__cubicleDev.respawn(),
  )
  await setState('WRITE')
  await page.waitForTimeout(1500)
  const before = await stats()

  for (let i = 0; i < 100; i++) {
    await setState(states[(i * 7) % states.length]!)
    await page.waitForTimeout(25)
  }
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() =>
      (window as unknown as { __cubicleDev: { respawn(): void } }).__cubicleDev.respawn(),
    )
    await page.waitForTimeout(60)
  }
  await setState('WRITE')
  await page.waitForTimeout(1500)
  const after = await stats()

  // No growth. (Counts may dip: a respawned agent re-uploads hand props only when shown.)
  // A leaked character would add ≥1 skinned geometry per respawn, i.e. ≥ +10 here.
  expect(after.geometries).toBeLessThanOrEqual(before.geometries)
  expect(after.textures).toBeLessThanOrEqual(before.textures)
  expect(await pose()).not.toBeNull()
})
