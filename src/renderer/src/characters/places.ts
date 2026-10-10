import { COFFEE_BAR, TERMINAL } from '../scene/props/BackWall'
import { LOUNGE } from '../scene/props/Lounge'
import { WORKSTATIONS, seatOf } from '../scene/props/WorkDesk'
import type { ClipRole } from './manifest'

// Named locations a character can occupy. Shared spots (terminal, sofa, coffee bar, waiting
// area) have several *slots* so two agents never stand inside each other; desks have one.
// `approach` is where the character walks before the final short move into the slot.

export type XZ = readonly [number, number]

export interface Place {
  /** Slot id, e.g. "terminal:1" or "desk-a". */
  id: string
  /** Group the slot belongs to, e.g. "terminal" (desks: their own id). */
  group: string
  pos: XZ
  /** Facing when settled: direction (sin yaw, cos yaw). */
  yaw: number
  approach: XZ
  posture: Extract<ClipRole, 'sit' | 'sit_sofa' | 'stand'>
}

const FACE_PLUS_X = Math.PI / 2
const FACE_MINUS_Z = Math.PI
const FACE_CAMERA = Math.PI / 4

function deskPlace(index: number): Place {
  const ws = WORKSTATIONS[index]!
  const [x, , z] = seatOf(ws)
  // Enter the chair from the +z end of the desk.
  return {
    id: ws.id,
    group: ws.id,
    pos: [x, z],
    yaw: FACE_PLUS_X,
    approach: [x, ws.center[1] + 0.95],
    posture: 'sit',
  }
}

const [tx, tz] = TERMINAL.stand
const [lx, lz] = LOUNGE.seat
const [cx, cz] = COFFEE_BAR.stand

const ALL: Place[] = [
  ...WORKSTATIONS.map((_, i) => deskPlace(i)),
  // Terminal: centre of the console first, then the right-hand monitor.
  {
    id: 'terminal:0',
    group: 'terminal',
    pos: [tx, tz],
    yaw: FACE_MINUS_Z,
    approach: [tx, tz + 0.5],
    posture: 'stand',
  },
  {
    id: 'terminal:1',
    group: 'terminal',
    pos: [tx + 0.42, tz],
    yaw: FACE_MINUS_Z,
    approach: [tx + 0.42, tz + 0.5],
    posture: 'stand',
  },
  // Sofa: left cushion, then right cushion.
  {
    id: 'lounge:0',
    group: 'lounge',
    pos: [lx, lz],
    yaw: FACE_PLUS_X,
    approach: [lx + 0.6, lz - 0.55],
    posture: 'sit_sofa',
  },
  {
    id: 'lounge:1',
    group: 'lounge',
    pos: [lx, lz + 0.72],
    yaw: FACE_PLUS_X,
    approach: [lx + 0.55, lz + 0.2],
    posture: 'sit_sofa',
  },
  {
    id: 'coffee:0',
    group: 'coffee',
    pos: [cx, cz],
    yaw: FACE_MINUS_Z,
    approach: [cx, cz + 0.5],
    posture: 'stand',
  },
  // Waiting area for agents without a desk (overflow sessions). Spread along screen-x (x − z)
  // so their name tags and status icons don't overlap in the isometric view.
  {
    id: 'wait:0',
    group: 'wait',
    pos: [0.35, -0.6],
    yaw: FACE_CAMERA,
    approach: [0.35, -0.6],
    posture: 'stand',
  },
  {
    id: 'wait:1',
    group: 'wait',
    pos: [-0.5, 0.85],
    yaw: FACE_CAMERA,
    approach: [-0.5, 0.85],
    posture: 'stand',
  },
]

export const PLACES: Record<string, Place> = Object.fromEntries(ALL.map((p) => [p.id, p]))

export const PLACE_GROUPS: Record<string, string[]> = ALL.reduce<Record<string, string[]>>(
  (acc, p) => {
    ;(acc[p.group] ??= []).push(p.id)
    return acc
  },
  {},
)

/** Open floor junction every route passes through. */
export const HUB: XZ = [-0.5, -0.35]
