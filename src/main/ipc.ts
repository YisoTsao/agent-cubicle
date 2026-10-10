import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { IpcChannel, type PingResult, type StateSnapshot } from '@shared/ipc'
import { SCENARIOS, SCENARIO_NAMES } from '@shared/sim/scenarios'
import type { HubService } from './hubService'
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

export function registerIpcHandlers(hub: HubService): void {
  ipcMain.handle(IpcChannel.Ping, (event): PingResult => {
    assertTrustedSender(event)
    return { pong: true, appVersion: app.getVersion(), timestamp: Date.now() }
  })
  ipcMain.handle(IpcChannel.GetSnapshot, (event): StateSnapshot => {
    assertTrustedSender(event)
    return hub.snapshot()
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
