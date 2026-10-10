import type { ClipRole } from './manifest'
import type { Place } from './places'

// Presentation layer (SPEC §7): maps an agent's displayed state to place, animation, overlay and
// prop changes. Pure data — no Three.js — so it can be reviewed and tested as a table.

export const PRESENTATION_STATES = [
  'IDLE',
  'THINKING',
  'READ',
  'WRITE',
  'EXEC',
  'WAITING_APPROVAL',
  'COMPLETED',
  'ERROR',
  'STALE',
] as const

export type PresentationState = (typeof PRESENTATION_STATES)[number]

export type OverlayKind = 'thought' | 'warning' | 'error' | 'check' | 'question'
export type HandProp = 'mug' | 'book'
export type ScreenMode = 'idle' | 'active' | 'error'

export interface Presentation {
  /** 'desk' = the agent's assigned workstation; 'stay' = remain wherever it is. */
  place: 'desk' | 'terminal' | 'lounge' | 'coffee' | 'stay'
  gesture: ClipRole
  /** Gesture override when the settled posture doesn't suit the default gesture. */
  gestureByPosture?: Partial<Record<Place['posture'], ClipRole>>
  overlay?: OverlayKind
  /** Desk monitor state at the agent's workstation. */
  screen?: ScreenMode
  terminal?: 'active'
  /** Inferred / low-confidence states render the overlay faded. */
  muted?: boolean
}

export const PRESENTATION: Record<PresentationState, Presentation> = {
  IDLE: { place: 'lounge', gesture: 'idle_coffee' },
  THINKING: { place: 'desk', gesture: 'think', overlay: 'thought', muted: true },
  READ: { place: 'desk', gesture: 'read', screen: 'active' },
  WRITE: { place: 'desk', gesture: 'type_fast', screen: 'active' },
  EXEC: { place: 'terminal', gesture: 'stand_terminal', terminal: 'active' },
  WAITING_APPROVAL: {
    place: 'desk',
    gesture: 'wave_attention',
    overlay: 'warning',
    screen: 'active',
  },
  COMPLETED: { place: 'stay', gesture: 'celebrate', overlay: 'check' },
  ERROR: { place: 'desk', gesture: 'confused', overlay: 'error', screen: 'error' },
  STALE: {
    place: 'stay',
    gesture: 'sit_idle',
    gestureByPosture: { stand: 'stand_idle', sit_sofa: 'idle_coffee' },
    overlay: 'question',
    muted: true,
  },
}

/** Hand props follow the gesture being played, not the state. */
export const PROP_FOR_GESTURE: Partial<Record<ClipRole, HandProp>> = {
  idle_coffee: 'mug',
  read: 'book',
}

/** Gesture for a state once the character is settled in `posture`. */
export function gestureFor(state: PresentationState, posture: Place['posture']): ClipRole {
  const p = PRESENTATION[state]
  return p.gestureByPosture?.[posture] ?? p.gesture
}

/** Resolve the target place id for a state. */
export function placeIdFor(
  state: PresentationState,
  deskId: string,
  currentPlaceId: string,
): string {
  const p = PRESENTATION[state].place
  if (p === 'stay') return currentPlaceId
  if (p === 'desk') return deskId
  return p
}
