import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, session, type WebContents } from 'electron'

/** Origin the renderer is allowed to be served from. */
/** Built renderer directory as a file:// URL prefix (with trailing slash). */
const RENDERER_DIR_URL = pathToFileURL(join(__dirname, '../renderer') + sep).href

/**
 * Only the app's own renderer may talk to the main process or be navigated to: the Vite dev
 * server in development, otherwise files inside the built renderer directory. Any other
 * file:// URL (e.g. a downloaded HTML file) is untrusted.
 */
export function isTrustedRendererUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl && url.startsWith(devUrl)) return true
  try {
    const u = new URL(url)
    return (
      u.protocol === 'file:' &&
      `${u.origin === 'null' ? 'file://' : u.origin}${u.pathname}`.startsWith(RENDERER_DIR_URL)
    )
  } catch {
    return false
  }
}

/** Deny all permission prompts (camera, notifications, geolocation, ...). */
export function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  )
  session.defaultSession.setPermissionCheckHandler(() => false)
}

/** Block navigation, new windows and webview attachment for a WebContents. */
export function hardenWebContents(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })
  contents.on('will-redirect', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
}
