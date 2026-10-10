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
    // Lets visual tests size the window to 1920×1080 on smaller displays (macOS only).
    enableLargerThanScreen: process.env['CUBICLE_SHOWCASE'] === '1',
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  hardenWebContents(win.webContents)
  win.once('ready-to-show', () => win.show())

  const query = rendererQuery()
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    const url = new URL(devUrl)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
  return win
}

/** Developer/test switches forwarded to the renderer (read by the settings store). */
function rendererQuery(): Record<string, string> {
  const q: Record<string, string> = {}
  const env = process.env
  if (env['CUBICLE_SHOWCASE'] === '1') q['showcase'] = '1'
  if (env['CUBICLE_DIAGNOSTICS'] === '1') q['diagnostics'] = '1'
  if (env['CUBICLE_DEMO'] === '1') q['demo'] = '1'
  const state = env['CUBICLE_STATE']
  if (state && /^[A-Z_]{2,32}$/.test(state)) q['state'] = state
  const quality = env['CUBICLE_QUALITY']
  if (quality === 'high' || quality === 'balanced' || quality === 'low') q['quality'] = quality
  return q
}
