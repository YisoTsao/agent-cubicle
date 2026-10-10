import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { IpcChannel, type PingResult, type StateSnapshot } from '@shared/ipc'
import { SCENARIOS, SCENARIO_NAMES } from '@shared/sim/scenarios'
import { SettingsPatch, type SettingsStore } from './appSettings'
import type { HubService } from './hubService'
import type { Integrations } from './integrations'
import { isTrustedRendererUrl } from './security'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? ''
  if (!isTrustedRendererUrl(url)) throw new Error(`Rejected IPC from untrusted frame: ${url}`)
}

/** Dev tools (scenario simulator) are for development only (SPEC §1 non-goals: read-only app). */
export function devToolsEnabled(): boolean {
  return !app.isPackaged || process.env['CUBICLE_DEV_TOOLS'] === '1'
}

function assertDev(event: IpcMainInvokeEvent): void {
  assertTrustedSender(event)
  if (!devToolsEnabled()) throw new Error('Dev tools are disabled in this build')
}

const RunArgs = z.tuple([
  z.enum(SCENARIO_NAMES as [string, ...string[]]),
  z.number().min(0.1).max(20).optional(),
])

const HookAction = z.tuple([z.enum(['install', 'uninstall'])])
const PlanId = z.tuple([z.string().uuid()])

export function registerIpcHandlers(
  hub: HubService,
  integrations: Integrations,
  settings: SettingsStore,
): void {
  const userSettings = () => {
    const { quality, alwaysOnTop, character, scene, camera } = settings.get()
    return { quality, alwaysOnTop, character, scene, camera }
  }
  ipcMain.handle(IpcChannel.SettingsGet, (event) => {
    assertTrustedSender(event)
    return userSettings()
  })
  ipcMain.handle(IpcChannel.SettingsSet, (event, patch: unknown) => {
    assertTrustedSender(event)
    const p = SettingsPatch.parse(patch)
    settings.update(p)
    if (p.alwaysOnTop !== undefined) {
      for (const win of BrowserWindow.getAllWindows()) win.setAlwaysOnTop(p.alwaysOnTop)
    }
    return userSettings()
  })

  ipcMain.handle(IpcChannel.Ping, (event): PingResult => {
    assertTrustedSender(event)
    return { pong: true, appVersion: app.getVersion(), timestamp: Date.now() }
  })
  ipcMain.handle(IpcChannel.GetSnapshot, (event): StateSnapshot => {
    assertTrustedSender(event)
    return hub.snapshot()
  })

  // User-facing integrations. Hook changes are two-step: the renderer must show the plan's diff
  // and the user must confirm before applyHooks(planId) is called.
  ipcMain.handle(IpcChannel.IntegrationStatus, (event) => {
    assertTrustedSender(event)
    return integrations.status()
  })
  ipcMain.handle(IpcChannel.HookPlan, (event, ...args: unknown[]) => {
    assertTrustedSender(event)
    const [action] = HookAction.parse(args)
    return integrations.installer.plan(action)
  })
  ipcMain.handle(IpcChannel.HookApply, (event, ...args: unknown[]) => {
    assertTrustedSender(event)
    const [planId] = PlanId.parse(args)
    integrations.installer.apply(planId)
    return integrations.status()
  })

  ipcMain.handle(IpcChannel.DevListScenarios, (event) => {
    assertDev(event)
    return SCENARIOS.map(({ name, description }) => ({ name, description }))
  })
  ipcMain.handle(IpcChannel.DevRunScenario, (event, ...args: unknown[]) => {
    assertDev(event)
    const [name, speed] = RunArgs.parse(args)
    return hub.runScenario(name, speed)
  })
  ipcMain.handle(IpcChannel.DevReset, (event) => {
    assertDev(event)
    hub.reset()
  })
  ipcMain.handle(IpcChannel.DevDiagnostics, (event) => {
    assertTrustedSender(event)
    return {
      enabled: devToolsEnabled(),
      entries: devToolsEnabled() ? [...hub.hub.diagnostics()] : [],
    }
  })
}
