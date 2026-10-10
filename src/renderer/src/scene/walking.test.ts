import { describe, expect, it } from 'vitest'
import { Locomotion, placeById } from '../characters/Locomotion'
import { PLACES } from '../characters/places'
import { COLLIDERS } from './colliders'

// Walking from any place to any other must keep the body clear of furniture. The last stretch
// into a seat (and the first one out of it) is exempt: that is where the character is meant to
// touch the furniture.

/** Half-width of the widest figure (plush: shoulders / arm bulges). */
const BODY_RADIUS: Record<string, number> = { chibi: 0.27, plush: 0.4 }

/** Distance from a point to the segment a→b. */
function segDist(x: number, z: number, a: readonly [number, number], b: readonly [number, number]) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz))
}

function clearance(x: number, z: number, radius: number): { name: string; depth: number } | null {
  let worst: { name: string; depth: number } | null = null
  for (const c of COLLIDERS) {
    // Only things that block a walking body (knee to shoulder height).
    if (c.max[1] < 0.15 || c.min[1] > 1.1) continue
    const dx = Math.max(c.min[0] - x, 0, x - c.max[0])
    const dz = Math.max(c.min[2] - z, 0, z - c.max[2])
    const d = Math.hypot(dx, dz)
    const depth = radius - d
    if (depth > 0.02 && (!worst || depth > worst.depth)) worst = { name: c.name, depth }
  }
  return worst
}

describe.each(Object.entries(BODY_RADIUS))('%s walking routes', (_kind, radius) => {
  it('never push through furniture', () => {
    const problems = new Map<string, number>()
    const ids = Object.keys(PLACES)
    for (const from of ids)
      for (const to of ids) {
        if (from === to) continue
        const a = placeById(from)
        const b = placeById(to)
        const loco = new Locomotion(a)
        loco.goTo(b)
        for (let t = 0; t < 30 && loco.state === 'walking'; t += 1 / 30) {
          loco.update(1 / 30)
          const lastWp = (p: typeof a) => (p.route ?? [p.approach]).at(-1)!
          const onSeatStretch = (p: typeof a) => segDist(loco.x, loco.z, lastWp(p), p.pos) < 0.05
          if (onSeatStretch(a) || onSeatStretch(b)) continue
          const hit = clearance(loco.x, loco.z, radius)
          if (hit) {
            const key = `${from} → ${to}: ${hit.name}`
            problems.set(key, Math.max(problems.get(key) ?? 0, hit.depth))
          }
        }
      }
    expect([...problems].map(([k, d]) => `${k} (${(d * 100).toFixed(0)} cm)`)).toEqual([])
  })
})
