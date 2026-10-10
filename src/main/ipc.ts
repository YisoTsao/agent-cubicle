import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IpcChannel, type PingResult, type StateSnapshot } from '@shared/ipc'
import { isTrustedRendererUrl } from './security'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? ''
  if (!isTrustedRendererUrl(url)) throw new Error(`Rejected IPC from untrusted frame: ${url}`)
}

export function registerIpcHandlers(getSnapshot: () => StateSnapshot): void {
  ipcMain.handle(IpcChannel.Ping, (event): PingResult => {
    assertTrustedSender(event)
    return { pong: true, appVersion: app.getVersion(), timestamp: Date.now() }
  })
  ipcMain.handle(IpcChannel.GetSnapshot, (event): StateSnapshot => {
    assertTrustedSender(event)
    return getSnapshot()
  })
}
