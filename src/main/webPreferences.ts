import type { WebPreferences } from 'electron'

/** Hardened defaults for every BrowserWindow (SPEC §8). Kept Electron-runtime-free so tests can import it. */
export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  experimentalFeatures: false,
  navigateOnDragDrop: false,
  spellcheck: false,
} as const satisfies WebPreferences
