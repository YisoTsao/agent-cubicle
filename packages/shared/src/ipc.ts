import type { SessionState } from './events'

// Single source of truth for IPC channel names. Keep this file dependency-free:
// the sandboxed preload imports it.
export const IpcChannel = {
  Ping: 'cubicle:ping',
  GetSnapshot: 'cubicle:get-snapshot',
  StateChanged: 'cubicle:state-changed',
  WindowVisibility: 'cubicle:window-visibility',
  SettingsGet: 'cubicle:settings:get',
  SettingsSet: 'cubicle:settings:set',
  // Integrations (user-facing)
  IntegrationStatus: 'cubicle:integration:status',
  HookPlan: 'cubicle:integration:hook-plan',
  HookApply: 'cubicle:integration:hook-apply',
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

export interface IntegrationStatus {
  server:
    | { state: 'listening'; port: number; eventUrl: string }
    | { state: 'stopped' }
    | { state: 'error'; message: string }
  hooks: { path: string; installed: boolean; error?: string; lastEventAt: number; count: number }
  transcripts: { enabled: boolean; root: string; files: number; lines: number }
}

export interface HookPlanView {
  planId: string
  action: 'install' | 'uninstall'
  path: string
  fileExists: boolean
  diff: string
  noop: boolean
}

/** Connecting agents (user-facing). Hook changes are always previewed before being applied. */
export interface CubicleIntegrationApi {
  status(): Promise<IntegrationStatus>
  planHooks(action: 'install' | 'uninstall'): Promise<HookPlanView>
  applyHooks(planId: string): Promise<IntegrationStatus>
}

export interface UserSettings {
  quality: 'high' | 'balanced' | 'low'
  alwaysOnTop: boolean
  /** Character id, or 'duo' / 'auto'. */
  character: string
  /** Scene theme id ('office' | 'hacker'). */
  scene: string
  /** 'iso' = fixed isometric view, 'free' = orbit / zoom with the mouse. */
  camera: 'iso' | 'free'
}

export interface CubicleSettingsApi {
  get(): Promise<UserSettings>
  set(patch: Partial<UserSettings>): Promise<UserSettings>
}

/** API exposed on `window.cubicle` by the preload script. */
export interface CubicleApi {
  ping(): Promise<PingResult>
  getSnapshot(): Promise<StateSnapshot>
  onState(callback: (snapshot: StateSnapshot) => void): () => void
  /** Window hidden/minimized (false) or shown/restored (true); more reliable than the page API. */
  onWindowVisibility(callback: (visible: boolean) => void): () => void
  settings: CubicleSettingsApi
  integration: CubicleIntegrationApi
  dev: CubicleDevApi
}
