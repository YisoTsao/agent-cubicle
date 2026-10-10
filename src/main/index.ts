import { app, BrowserWindow } from 'electron'
import { HubService } from './hubService'
import { devToolsEnabled, registerIpcHandlers } from './ipc'
import { hardenSession } from './security'
import { createMainWindow } from './window'

// Keep the main process alive on unexpected errors (SPEC §8); log and continue.
process.on('uncaughtException', (err) => console.error('[main] uncaughtException', err))
process.on('unhandledRejection', (reason) => console.error('[main] unhandledRejection', reason))

// Tests run with an isolated profile so they never collide with a developer's running instance
// (the single-instance lock is scoped to the userData directory).
const userDataOverride = process.env['CUBICLE_USER_DATA']
if (userDataOverride) app.setPath('userData', userDataOverride)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  // Authoritative agent state lives here (SPEC §3); renderers only receive snapshots.
  const hub = new HubService()

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    hardenSession()
    registerIpcHandlers(hub)
    hub.start()
    mainWindow = createMainWindow()
    autoSimulate(hub)
    mainWindow.on('closed', () => (mainWindow = null))

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
    })
  })

  app.on('before-quit', () => hub.stop())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

/** `CUBICLE_SIMULATE=<scenario>[@speed]` plays a scenario on startup (dev demos and e2e). */
function autoSimulate(hub: HubService): void {
  const spec = process.env['CUBICLE_SIMULATE']
  if (!spec || !devToolsEnabled()) return
  const [name, speed] = spec.split('@')
  try {
    hub.runScenario(name!, speed ? Number(speed) : 1)
  } catch (err) {
    console.error('[main] CUBICLE_SIMULATE failed', err)
  }
}
