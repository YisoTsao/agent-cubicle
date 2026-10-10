import { app, BrowserWindow } from 'electron'
import type { StateSnapshot } from '@shared/ipc'
import { registerIpcHandlers } from './ipc'
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

  // Phase 3 replaces this with the Event Hub's authoritative session state.
  const snapshot: StateSnapshot = { sessions: [] }

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    hardenSession()
    registerIpcHandlers(() => snapshot)
    mainWindow = createMainWindow()
    mainWindow.on('closed', () => (mainWindow = null))

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
