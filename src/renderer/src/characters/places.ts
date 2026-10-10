import { COFFEE_BAR, TERMINAL } from '../scene/props/BackWall'
import { LOUNGE } from '../scene/props/Lounge'
import { WORKSTATIONS, seatOf } from '../scene/props/WorkDesk'
import type { ClipRole } from './manifest'

// Named locations a character can occupy. `approach` is where the character walks to before the
// final short move into the seat / standing spot, so it never cuts through furniture.

export type XZ = readonly [number, number]

export interface Place {
  id: string
  pos: XZ
  /** Facing when settled: direction (sin yaw, cos yaw). */
  yaw: number
  approach: XZ
  posture: Extract<ClipRole, 'sit' | 'sit_sofa' | 'stand'>
}

const FACE_PLUS_X = Math.PI / 2
const FACE_MINUS_Z = Math.PI

function deskPlace(index: number): Place {
  const ws = WORKSTATIONS[index]!
  const [x, , z] = seatOf(ws)
  // Enter the chair from the +z end of the desk.
  return {
    id: ws.id,
    pos: [x, z],
    yaw: FACE_PLUS_X,
    approach: [x, ws.center[1] + 0.95],
    posture: 'sit',
  }
}

export const PLACES: Record<string, Place> = Object.fromEntries(
  [
    ...WORKSTATIONS.map((_, i) => deskPlace(i)),
    {
      id: 'terminal',
      pos: TERMINAL.stand,
      yaw: FACE_MINUS_Z,
      approach: [TERMINAL.stand[0], TERMINAL.stand[1] + 0.5],
      posture: 'stand',
    },
    {
      id: 'coffee',
      pos: COFFEE_BAR.stand,
      yaw: FACE_MINUS_Z,
      approach: [COFFEE_BAR.stand[0], COFFEE_BAR.stand[1] + 0.5],
      posture: 'stand',
    },
    {
      id: 'lounge',
      pos: LOUNGE.seat,
      yaw: FACE_PLUS_X,
      approach: [LOUNGE.seat[0] + 0.6, LOUNGE.seat[1] - 0.55],
      posture: 'sit_sofa',
    },
  ].map((p) => [p.id, p as Place]),
)

/** Open floor junction every route passes through. */
export const HUB: XZ = [-0.5, -0.35]
