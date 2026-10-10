// Lightweight crowd separation: walking characters are nudged apart (and step to their right
// when meeting head-on) so they don't walk through each other. It only offsets the *rendered*
// position; routes, slots and state are untouched, so behaviour stays deterministic. Settled
// characters don't move — their slots are already non-overlapping.

export const RADIUS = 0.6 // centre distance below which two characters push apart (m)
const MAX_OFFSET = 0.35
const RESPONSE = 6 // 1/s, smoothing toward the target offset (keeps motion continuous)

interface Body {
  x: number
  z: number
  yaw: number
  moving: boolean
  ox: number
  oz: number
}

const bodies = new Map<string, Body>()

export function removeBody(id: string): void {
  bodies.delete(id)
}

export function resetCrowd(): void {
  bodies.clear()
}

/**
 * Report this character's logical position and get back its rendered offset for this frame.
 * Call once per frame per character.
 */
export function crowdOffset(
  id: string,
  x: number,
  z: number,
  yaw: number,
  moving: boolean,
  dt: number,
): [number, number] {
  const self = bodies.get(id) ?? { x, z, yaw, moving, ox: 0, oz: 0 }
  Object.assign(self, { x, z, yaw, moving })
  bodies.set(id, self)

  let tx = 0
  let tz = 0
  if (moving) {
    const hx = Math.sin(yaw)
    const hz = Math.cos(yaw)
    for (const [otherId, o] of bodies) {
      if (otherId === id) continue
      // Compare rendered positions so already-dodging characters are seen where they are.
      const dx = x + self.ox - (o.x + o.ox)
      const dz = z + self.oz - (o.z + o.oz)
      const d = Math.hypot(dx, dz)
      if (d >= RADIUS || d < 1e-4) continue
      const overlap = RADIUS - d
      tx += (dx / d) * overlap
      tz += (dz / d) * overlap
      // Other character ahead of us: also step to our right (facing +z, right is -x).
      if (hx * -dx + hz * -dz > 0) {
        tx += -hz * overlap * 0.8
        tz += hx * overlap * 0.8
      }
    }
    const len = Math.hypot(tx, tz)
    if (len > MAX_OFFSET) {
      tx = (tx / len) * MAX_OFFSET
      tz = (tz / len) * MAX_OFFSET
    }
  }
  const k = Math.min(1, dt * RESPONSE)
  self.ox += (tx - self.ox) * k
  self.oz += (tz - self.oz) * k
  return [self.ox, self.oz]
}
