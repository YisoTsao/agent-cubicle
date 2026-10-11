import { describe, expect, it } from 'vitest'
import { Locomotion, MAX_DT, TURN_RATE, WALK_SPEED, placeById } from './Locomotion'
import { PLACES } from './places'

function run(loco: Locomotion, seconds: number, dt = 1 / 60) {
  const samples: { x: number; z: number; yaw: number }[] = []
  for (let t = 0; t < seconds; t += dt) {
    loco.update(dt)
    samples.push({ x: loco.x, z: loco.z, yaw: loco.yaw })
  }
  return samples
}

function maxStep(samples: { x: number; z: number; yaw: number }[]) {
  let pos = 0
  let yaw = 0
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!
    const b = samples[i]!
    pos = Math.max(pos, Math.hypot(b.x - a.x, b.z - a.z))
    let d = Math.abs(b.yaw - a.yaw)
    if (d > Math.PI) d = Math.PI * 2 - d
    yaw = Math.max(yaw, d)
  }
  return { pos, yaw }
}

describe('Locomotion', () => {
  it.each(
    Object.keys(PLACES).flatMap((from) =>
      Object.keys(PLACES)
        .filter((to) => to !== from)
        .map((to) => [from, to]),
    ),
  )('walks %s → %s continuously and settles facing the place', (from, to) => {
    const loco = new Locomotion(placeById(from))
    loco.goTo(placeById(to))
    const dt = 1 / 60
    const samples = run(loco, 20, dt)
    const step = maxStep(samples)
    expect(step.pos).toBeLessThanOrEqual(WALK_SPEED * dt + 1e-6)
    expect(step.yaw).toBeLessThanOrEqual(TURN_RATE * dt + 1e-6)
    expect(loco.state).toBe('settled')
    expect(loco.x).toBeCloseTo(placeById(to).pos[0], 5)
    expect(loco.z).toBeCloseTo(placeById(to).pos[1], 5)
    expect(loco.yaw).toBeCloseTo(placeById(to).yaw, 5)
  })

  it('eases in and out instead of snapping to full speed', () => {
    const loco = new Locomotion(placeById('desk-a'))
    loco.goTo(placeById('terminal:0'))
    const dt = 1 / 60
    const speeds: number[] = []
    let last = { x: loco.x, z: loco.z }
    for (let t = 0; t < 20; t += dt) {
      loco.update(dt)
      speeds.push(Math.hypot(loco.x - last.x, loco.z - last.z) / dt)
      last = { x: loco.x, z: loco.z }
    }
    expect(speeds[0]!).toBeLessThan(WALK_SPEED * 0.5)
    for (let i = 1; i < speeds.length; i++)
      expect(Math.abs(speeds[i]! - speeds[i - 1]!)).toBeLessThan(0.35)
  })

  it('redirects mid-walk without jumping', () => {
    const loco = new Locomotion(placeById('desk-a'))
    loco.goTo(placeById('lounge:0'))
    const a = run(loco, 1.2)
    loco.goTo(placeById('terminal:0'))
    const b = run(loco, 20)
    const step = maxStep([...a, ...b])
    expect(step.pos).toBeLessThanOrEqual(WALK_SPEED / 60 + 1e-6)
    expect(loco.place.id).toBe('terminal:0')
    expect(loco.state).toBe('settled')
  })

  it('clamps long frame hitches', () => {
    const loco = new Locomotion(placeById('desk-a'))
    loco.goTo(placeById('terminal:0'))
    const before = { x: loco.x, z: loco.z }
    loco.update(1.5) // 1.5 s hitch
    expect(Math.hypot(loco.x - before.x, loco.z - before.z)).toBeLessThanOrEqual(
      WALK_SPEED * MAX_DT + 1e-6,
    )
  })

  it('ignores goTo for the place it is already settled at', () => {
    const loco = new Locomotion(placeById('desk-a'))
    loco.goTo(placeById('desk-a'))
    expect(loco.state).toBe('settled')
  })
})
