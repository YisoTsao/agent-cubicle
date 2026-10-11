import { COFFEE_BAR, TERMINAL } from './props/layout'
import { ROOM } from './props/Room'
import { DESK, WORKSTATIONS } from './props/WorkDesk'

// Solid furniture as axis-aligned boxes (world metres), for the "nobody sits inside the sofa"
// test (colliders.test.ts) and as the single place to look up where things physically are.
// Keep in sync with the furniture components: their dimensions are mirrored here by hand.
//
// `soft` boxes are cushions: a body may sink into them a little (see SOFT_SINK); everything else
// must not be penetrated by more than HARD_SINK.

export interface Collider {
  name: string
  min: [number, number, number]
  max: [number, number, number]
  soft?: boolean
}

/** How far a body may sink into upholstery / a hard surface (metres). */
export const SOFT_SINK = 0.03
export const HARD_SINK = 0.012

const box = (
  name: string,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  soft = false,
): Collider => ({
  name,
  min: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
  max: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
  soft,
})

function workstation(id: string, cx: number, cz: number): Collider[] {
  const { depth: d, width: w, height: h, seatOffsetX } = DESK
  const sx = cx + seatOffsetX
  return [
    box(`${id}:top`, cx, h - 0.0225, cz, d, 0.045, w, true), // hands rest on it
    box(`${id}:drawers`, cx, 0.28, cz + w / 2 - 0.27, 0.6, 0.5, 0.42),
    box(`${id}:seat`, sx, 0.44, cz, 0.48, 0.08, 0.48, true),
    box(`${id}:chair-back`, sx - 0.22, 0.75, cz, 0.08, 0.5, 0.44, true),
    box(`${id}:chair-column`, sx, 0.25, cz, 0.06, 0.3, 0.06),
  ]
}

const sofaZ = 1.12
const sofaX = -2.25
const sofaLen = 2.1

export const COLLIDERS: Collider[] = [
  ...WORKSTATIONS.flatMap((ws) => workstation(ws.id, ws.center[0], ws.center[1])),
  // Sofa (x = -2.25, z = 1.12, long axis z, back against the left wall).
  box('sofa:base', sofaX, 0.25, sofaZ, 0.8, 0.3, sofaLen),
  box('sofa:back', sofaX - 0.28, 0.6, sofaZ, 0.24, 0.55, sofaLen, true),
  box('sofa:arm-near', sofaX, 0.42, sofaZ + sofaLen / 2 - 0.1, 0.8, 0.42, 0.2, true),
  box('sofa:arm-far', sofaX, 0.42, sofaZ - sofaLen / 2 + 0.1, 0.8, 0.42, 0.2, true),
  box('sofa:cushion-near', sofaX + 0.08, 0.46, sofaZ + 0.425, 0.56, 0.14, 0.83, true),
  box('sofa:cushion-far', sofaX + 0.08, 0.46, sofaZ - 0.425, 0.56, 0.14, 0.83, true),
  // Coffee table
  box('table:top', -0.55, 0.4, 1.3, 0.84, 0.05, 0.84),
  box('table:pedestal', -0.55, 0.19, 1.3, 0.16, 0.38, 0.16),
  box('pouf', 0.05, 0.18, 2.2, 0.6, 0.36, 0.6, true),
  // Back wall: coffee bar, terminal console, server rack, bookshelf.
  box('coffee-bar', COFFEE_BAR.stand[0], 0.4, -ROOM.half + 0.22, 1.2, 0.8, 0.42),
  box('console:top', TERMINAL.center, 0.82, -ROOM.half + 0.3, TERMINAL.width, 0.05, 0.5, true),
  // Legs sit at the ends of the console, shallow and against the wall; arms may brush them.
  box(
    'console:leg-l',
    TERMINAL.center - TERMINAL.legInset,
    0.41,
    -ROOM.half + 0.24,
    0.05,
    0.82,
    0.3,
    true,
  ),
  box(
    'console:leg-r',
    TERMINAL.center + TERMINAL.legInset,
    0.41,
    -ROOM.half + 0.24,
    0.05,
    0.82,
    0.3,
    true,
  ),
  box('rack', 2.2, 0.95, -ROOM.half + 0.38, 0.66, 1.9, 0.7),
  box('bookshelf', -2.0, 0.925, -ROOM.half + 0.19, 1.0, 1.85, 0.36),
  // Room walls (inner faces), as thick slabs.
  box('wall-left', -ROOM.half - 0.5, 1.4, 0, 1.0, 2.8, ROOM.half * 2 + 1),
  box('wall-back', 0, 1.4, -ROOM.half - 0.5, ROOM.half * 2 + 1, 2.8, 1.0),
]

/**
 * The station's crew seats and bench have lower backrests (so a life-support pack clears them); every
 * other solid piece keeps the office footprint.
 */
export function collidersFor(furniture: 'office' | 'space'): Collider[] {
  if (furniture === 'office') return COLLIDERS
  return COLLIDERS.map((c) => {
    const cx = (c.min[0] + c.max[0]) / 2
    const cz = (c.min[2] + c.max[2]) / 2
    if (c.name.endsWith(':chair-back')) return box(c.name, cx, 0.62, cz, 0.08, 0.28, 0.44, true)
    if (c.name === 'sofa:back')
      return box(c.name, cx, 0.53, cz, 0.24, 0.4, c.max[2] - c.min[2], true)
    return c
  })
}
