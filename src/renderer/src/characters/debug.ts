import type { Object3D } from 'three'
import type { Locomotion } from './Locomotion'

// Live handles for diagnostics and e2e tests (exposed via window.__cubicleDev in App).

export interface AgentDebugHandle {
  root: Object3D
  hips: Object3D
  head: Object3D
  loco: Locomotion
  gesture(): string | null
  posture(): string | null
}

export const agentDebug = new Map<string, AgentDebugHandle>()
