import { create } from 'zustand'
import { DEFAULT_STYLE, type ChibiStyle } from '../characters/rig/chibiRig'
import { PRESENTATION_STATES, type PresentationState } from '../characters/presentation'

// Renderer-side view of agents. Phase 2 drives it locally (dev panel / URL params);
// Phase 3 replaces the source with session snapshots from the main process over IPC.

export interface AgentView {
  id: string
  name: string
  state: PresentationState
  deskId: string
  style: ChibiStyle
}

interface AgentsState {
  agents: AgentView[]
  /** Bumped by respawn(); used as a React key to remount characters (lifecycle tests). */
  generation: number
  setState(id: string, state: PresentationState): void
  respawn(): void
}

const params = new URLSearchParams(window.location.search)
const initial = params.get('state')
const initialState: PresentationState = PRESENTATION_STATES.includes(initial as PresentationState)
  ? (initial as PresentationState)
  : 'WRITE'

export const useAgents = create<AgentsState>((set) => ({
  agents: [
    {
      id: 'claude-code',
      name: 'Claude Code',
      state: initialState,
      deskId: 'desk-a',
      style: DEFAULT_STYLE,
    },
  ],
  generation: 0,
  setState: (id, state) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, state } : a)) })),
  respawn: () => set((s) => ({ generation: s.generation + 1 })),
}))
