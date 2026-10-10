import { create } from 'zustand'
import type { StateSnapshot } from '@shared/ipc'
import { styleFor, toPresentation } from '../characters/fromSession'
import {
  DEFAULT_CHOICE,
  characterFor,
  isChoice,
  type CharacterChoice,
  type CharacterId,
} from '../characters/roster'
import { PRESENTATION_STATES, type PresentationState } from '../characters/presentation'
import type { ChibiStyle } from '../characters/rig/chibiRig'
import { PLACE_GROUPS } from '../characters/places'
import { WORKSTATIONS } from '../scene/props/WorkDesk'

// Renderer-side view of agents.
//  - live:   mirrors session snapshots pushed by the main-process EventHub (default)
//  - manual: a single local agent whose state is set directly (showcase captures, animation
//            tests, dev panel buttons). Live snapshots are ignored while manual.

export interface AgentView {
  /** `${agentId}:${sessionId}` in live mode. */
  id: string
  name: string
  state: PresentationState
  deskId: string
  style: ChibiStyle
  /** Which character is drawn (resolved from the user's choice). */
  character: CharacterId
  /** Low-confidence (inferred) state from the reducer. */
  inferred: boolean
  detail?: string
}

export type AgentSource = 'live' | 'manual'

interface AgentsState {
  source: AgentSource
  agents: AgentView[]
  /** Sessions with neither a desk nor a waiting spot (shown as a "+N" badge, not characters). */
  overflow: number
  /** Bumped by respawn(); used as a React key to remount characters (lifecycle tests). */
  generation: number
  /** The user's character choice (one for everybody, or 'auto' = one per agent). */
  choice: CharacterChoice
  setChoice(choice: CharacterChoice): void
  applySnapshot(snapshot: StateSnapshot): void
  setState(id: string, state: PresentationState): void
  setSource(source: AgentSource): void
  respawn(): void
}

export const MANUAL_AGENT_ID = 'claude-code'

function manualAgent(state: PresentationState, choice: CharacterChoice): AgentView {
  return {
    id: MANUAL_AGENT_ID,
    name: 'Claude Code',
    state,
    deskId: WORKSTATIONS[0]!.id,
    style: styleFor('claude-code'),
    character: characterFor(choice, 'claude-code'),
    inferred: false,
  }
}

export function fromSnapshot(
  snapshot: StateSnapshot,
  choice: CharacterChoice,
): { agents: AgentView[]; overflow: number } {
  const agents: AgentView[] = []
  let overflow = 0
  let waiting = 0
  const waitSpots = PLACE_GROUPS['wait']?.length ?? 0
  for (const s of snapshot.sessions) {
    const desk = s.seat !== undefined ? WORKSTATIONS[s.seat] : undefined
    // No desk: stand in the waiting area while there is room, otherwise only count.
    if (!desk && waiting >= waitSpots) {
      overflow++
      continue
    }
    if (!desk) waiting++
    const view: AgentView = {
      id: `${s.agentId}:${s.sessionId}`,
      name: s.agentName,
      state: toPresentation(s),
      deskId: desk?.id ?? 'wait',
      style: styleFor(s.agentId),
      character: characterFor(choice, s.agentId),
      inferred: s.inferred,
    }
    if (s.detail !== undefined) view.detail = s.detail
    agents.push(view)
  }
  return { agents, overflow }
}

const params = new URLSearchParams(window.location.search)
const initial = params.get('state')
const initialManual = PRESENTATION_STATES.includes(initial as PresentationState)
  ? (initial as PresentationState)
  : null

const urlCharacter = params.get('character')
/** A character forced via URL (tests / screenshots) wins over the persisted choice. */
export const forcedChoice: CharacterChoice | null = isChoice(urlCharacter) ? urlCharacter : null
const initialChoice = forcedChoice ?? DEFAULT_CHOICE

let lastSnapshot: StateSnapshot = { sessions: [], overflow: 0 }

export const useAgents = create<AgentsState>((set, get) => ({
  source: initialManual ? 'manual' : 'live',
  agents: initialManual ? [manualAgent(initialManual, initialChoice)] : [],
  overflow: 0,
  generation: 0,
  choice: initialChoice,
  setChoice: (choice) => {
    if (choice === get().choice) return
    const { source, agents } = get()
    set(
      source === 'live'
        ? { choice, ...fromSnapshot(lastSnapshot, choice) }
        : {
            choice,
            agents: agents.map((a) => ({ ...a, character: characterFor(choice, a.id) })),
          },
    )
  },
  applySnapshot: (snapshot) => {
    lastSnapshot = snapshot
    if (get().source === 'live') set(fromSnapshot(snapshot, get().choice))
  },
  setState: (id, state) => {
    if (get().source !== 'manual') {
      set({ source: 'manual', agents: [manualAgent(state, get().choice)], overflow: 0 })
      return
    }
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, state } : a)) }))
  },
  setSource: (source) => {
    if (source === get().source) return
    set(
      source === 'live'
        ? { source, ...fromSnapshot(lastSnapshot, get().choice) }
        : { source, agents: [manualAgent('WRITE', get().choice)], overflow: 0 },
    )
  },
  respawn: () => set((s) => ({ generation: s.generation + 1 })),
}))

/** Subscribe the store to main-process snapshots. Returns an unsubscribe function. */
export function connectAgents(): () => void {
  const apply = useAgents.getState().applySnapshot
  const off = window.cubicle.onState(apply)
  void window.cubicle.getSnapshot().then(apply)
  return off
}
