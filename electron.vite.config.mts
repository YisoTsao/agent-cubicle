import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const alias = { '@shared': resolve(import.meta.dirname, 'packages/shared/src') }

// Strict CSP for production builds; dev needs inline scripts (React Refresh) and the HMR socket.
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')
const DEV_CSP = PROD_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace(
  "connect-src 'self'",
  "connect-src 'self' ws://localhost:* http://localhost:*",
)

function cspPlugin(): Plugin {
  let csp = PROD_CSP
  return {
    name: 'cubicle-csp',
    configResolved(config) {
      csp = config.command === 'serve' ? DEV_CSP : PROD_CSP
    },
    transformIndexHtml: (html) => html.replace('%CUBICLE_CSP%', csp),
  }
}

export default defineConfig({
  main: {
    resolve: { alias },
  },
  preload: {
    resolve: { alias },
    // Sandboxed preloads cannot require() node_modules, so bundle everything.
    build: { externalizeDeps: false },
  },
  renderer: {
    resolve: { alias: { ...alias, '@renderer': resolve(import.meta.dirname, 'src/renderer/src') } },
    plugins: [react(), cspPlugin()],
  },
})
