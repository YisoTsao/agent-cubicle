import type { SessionState } from './events'

// Single source of truth for IPC channel names. Keep this file dependency-free:
// the sandboxed preload imports it.
export const IpcChannel = {
  Ping: 'cubicle:ping',
  GetSnapshot: 'cubicle:get-snapshot',
  StateChanged: 'cubicle:state-changed',
  // Dev-only (rejected in packaged builds unless CUBICLE_DEV_TOOLS=1)
  DevListScenarios: 'cubicle:dev:list-scenarios',
  DevRunScenario: 'cubicle:dev:run-scenario',
  DevReset: 'cubicle:dev:reset',
  DevDiagnostics: 'cubicle:dev:diagnostics',
} as const

export interface PingResult {
  pong: true
  appVersion: string
  timestamp: number
}

export interface StateSnapshot {
  sessions: SessionState[]
  /** Sessions without a free seat. */
  overflow: number
}

export interface ScenarioInfo {
  name: string
  description: string
}

export interface DiagnosticsView {
  enabled: boolean
  entries: { at: number; outcome: string; type?: string; sessionKey?: string; reason?: string }[]
}

/** Dev tools surface. Calls reject when dev tools are disabled (packaged builds). */
export interface CubicleDevApi {
  listScenarios(): Promise<ScenarioInfo[]>
  runScenario(
    name: string,
    speed?: number,
  ): Promise<{ runId: string; name: string; durationMs: number }>
  reset(): Promise<void>
  diagnostics(): Promise<DiagnosticsView>
}

/** API exposed on `window.cubicle` by the preload script. */
export interface CubicleApi {
  ping(): Promise<PingResult>
  getSnapshot(): Promise<StateSnapshot>
  onState(callback: (snapshot: StateSnapshot) => void): () => void
  dev: CubicleDevApi
}
