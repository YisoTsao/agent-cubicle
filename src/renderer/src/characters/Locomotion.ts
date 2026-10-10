import { HUB, PLACES, type Place, type XZ } from './places'

// Moves a character between places along simple waypoint routes with bounded speed and turn
// rate, so position and facing are always continuous (SPEC §7 — no teleporting).

export const WALK_SPEED = 1.5 // m/s — brisk: tool calls are short, walks must be too
export const TURN_RATE = 7 // rad/s
/** Frame-time clamp: a long hitch must not turn into a visible jump. */
export const MAX_DT = 1 / 20

export type LocoState = 'settled' | 'walking' | 'turning'

/** Waypoints from the hub to a place's slot (excluding both). */
function inbound(p: Place): readonly XZ[] {
  return p.route ?? [p.approach]
}

export class Locomotion {
  x: number
  z: number
  yaw: number
  state: LocoState = 'settled'
  place: Place
  private path: XZ[] = []

  constructor(start: Place) {
    this.place = start
    ;[this.x, this.z] = start.pos
    this.yaw = start.yaw
  }

  get moving(): boolean {
    return this.state === 'walking'
  }

  /** Instantly place the character (initial spawn / showcase only). */
  teleport(place: Place): void {
    this.place = place
    ;[this.x, this.z] = place.pos
    this.yaw = place.yaw
    this.path = []
    this.state = 'settled'
  }

  goTo(target: Place): void {
    if (target.id === this.place.id && this.state !== 'walking') return
    const route: XZ[] = []
    // Leave the current spot via its approach point unless we're already mid-walk.
    if (this.state !== 'walking') route.push(...[...inbound(this.place)].reverse())
    route.push(HUB, ...inbound(target), target.pos)
    this.path = dedupe(route)
    this.place = target
    this.state = 'walking'
  }

  update(rawDt: number): void {
    const dt = Math.min(rawDt, MAX_DT)
    if (this.state === 'walking') {
      let budget = WALK_SPEED * dt
      while (budget > 0 && this.path.length) {
        const [tx, tz] = this.path[0]!
        const dx = tx - this.x
        const dz = tz - this.z
        const dist = Math.hypot(dx, dz)
        if (dist > 1e-4) this.turnTowards(Math.atan2(dx, dz), dt)
        if (dist <= budget) {
          this.x = tx
          this.z = tz
          budget -= dist
          this.path.shift()
        } else {
          this.x += (dx / dist) * budget
          this.z += (dz / dist) * budget
          budget = 0
        }
      }
      if (!this.path.length) this.state = 'turning'
    } else if (this.state === 'turning') {
      if (this.turnTowards(this.place.yaw, dt)) this.state = 'settled'
    }
  }

  /** Rotate towards `target` at most TURN_RATE·dt; returns true when aligned. */
  private turnTowards(target: number, dt: number): boolean {
    const diff = wrap(target - this.yaw)
    const step = TURN_RATE * dt
    if (Math.abs(diff) <= step) {
      this.yaw = target
      return true
    }
    this.yaw = wrap(this.yaw + Math.sign(diff) * step)
    return false
  }
}

export function placeById(id: string): Place {
  const p = PLACES[id]
  if (!p) throw new Error(`Unknown place "${id}"`)
  return p
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function dedupe(points: XZ[]): XZ[] {
  return points.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1]![0], p[1] - points[i - 1]![1]) > 1e-3,
  )
}
