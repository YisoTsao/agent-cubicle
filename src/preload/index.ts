import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel, type CubicleApi, type StateSnapshot } from '@shared/ipc'

// Minimal, typed surface. Never expose ipcRenderer itself.
const api: CubicleApi = {
  ping: () => ipcRenderer.invoke(IpcChannel.Ping),
  getSnapshot: () => ipcRenderer.invoke(IpcChannel.GetSnapshot),
  onState: (callback) => {
    const listener = (_event: IpcRendererEvent, snapshot: StateSnapshot) => callback(snapshot)
    ipcRenderer.on(IpcChannel.StateChanged, listener)
    return () => ipcRenderer.removeListener(IpcChannel.StateChanged, listener)
  },
  // Main rejects these in packaged builds; exposing the functions grants nothing by itself.
  dev: {
    listScenarios: () => ipcRenderer.invoke(IpcChannel.DevListScenarios),
    runScenario: (name, speed) => ipcRenderer.invoke(IpcChannel.DevRunScenario, name, speed),
    reset: () => ipcRenderer.invoke(IpcChannel.DevReset),
    diagnostics: () => ipcRenderer.invoke(IpcChannel.DevDiagnostics),
  },
}

contextBridge.exposeInMainWorld('cubicle', api)
