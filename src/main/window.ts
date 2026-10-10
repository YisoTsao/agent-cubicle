import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { hardenWebContents } from './security'
import { SECURE_WEB_PREFERENCES } from './webPreferences'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    show: false,
    backgroundColor: '#f3ece1',
    title: 'AgentCubicle',
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  hardenWebContents(win.webContents)
  win.once('ready-to-show', () => win.show())

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
