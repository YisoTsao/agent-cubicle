import type { SessionState } from './events'

// Single source of truth for IPC channel names. Keep this file dependency-free:
// the sandboxed preload imports it.
export const IpcChannel = {
  Ping: 'cubicle:ping',
  GetSnapshot: 'cubicle:get-snapshot',
  StateChanged: 'cubicle:state-changed',
} as const

export interface PingResult {
  pong: true
  appVersion: string
  timestamp: number
}

export interface StateSnapshot {
  sessions: SessionState[]
}

/** API exposed on `window.cubicle` by the preload script. */
export interface CubicleApi {
  ping(): Promise<PingResult>
  getSnapshot(): Promise<StateSnapshot>
  onState(callback: (snapshot: StateSnapshot) => void): () => void
}
