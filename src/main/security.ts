import { app, session, type WebContents } from 'electron'

/** Origin the renderer is allowed to be served from. */
export function isTrustedRendererUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl && url.startsWith(devUrl)) return true
  return url.startsWith('file://')
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
