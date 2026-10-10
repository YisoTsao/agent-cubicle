import { join } from 'node:path'
import { BrowserWindow, screen, type Rectangle } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type { SettingsStore } from './appSettings'
import { hardenWebContents } from './security'
import { SECURE_WEB_PREFERENCES } from './webPreferences'

/** Saved bounds are reused only if they are still mostly on a connected display. */
function restorableBounds(saved: Rectangle | undefined): Partial<Rectangle> {
  if (!saved) return { width: 1280, height: 800 }
  const area = screen.getDisplayMatching(saved).workArea
  const overlapW = Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x)
  const overlapH =
    Math.min(saved.y + saved.height, area.y + area.height) - Math.max(saved.y, area.y)
  return overlapW > 200 && overlapH > 150 ? saved : { width: saved.width, height: saved.height }
}

export function createMainWindow(settings: SettingsStore): BrowserWindow {
  const prefs = settings.get()
  const win = new BrowserWindow({
    ...restorableBounds(prefs.bounds),
    alwaysOnTop: prefs.alwaysOnTop,
    minWidth: 640,
    minHeight: 400,
    show: false,
    backgroundColor: '#f3ece1',
    title: 'AgentCubicle',
    // Lets visual tests size the window to 1920×1080 on smaller displays (macOS only).
    enableLargerThanScreen: process.env['CUBICLE_SHOWCASE'] === '1',
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      backgroundThrottling: process.env['CUBICLE_KEEP_RENDERING'] !== '1',
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  hardenWebContents(win.webContents)
  win.once('ready-to-show', () => win.show())
  const saveBounds = () => {
    if (!win.isDestroyed() && !win.isMinimized() && !win.isFullScreen())
      settings.update({ bounds: win.getNormalBounds() })
  }
  const sendVisibility = (visible: boolean) => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannel.WindowVisibility, visible)
  }
  win.on('hide', () => sendVisibility(false))
  win.on('minimize', () => sendVisibility(false))
  win.on('show', () => sendVisibility(!win.isMinimized()))
  win.on('restore', () => sendVisibility(true))
  win.on('resized', saveBounds)
  win.on('moved', saveBounds)

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
  if (env['CUBICLE_KEEP_RENDERING'] === '1') q['keepRendering'] = '1'
  if (env['CUBICLE_CLEAN_CAPTURE'] === '1') q['cleanCapture'] = '1'
  const character = env['CUBICLE_CHARACTER']
  if (character && /^[a-z]{1,24}$/.test(character)) q['character'] = character
  const preview = env['CUBICLE_PREVIEW']
  if (preview && /^[a-z=&,_0-9.]{1,120}$/.test(preview)) q['preview'] = preview
  const state = env['CUBICLE_STATE']
  if (state && /^[A-Z_]{2,32}$/.test(state)) q['state'] = state
  const quality = env['CUBICLE_QUALITY']
  if (quality === 'high' || quality === 'balanced' || quality === 'low') q['quality'] = quality
  return q
}
