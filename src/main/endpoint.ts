import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Connection details shared with local clients (hook command, simulator CLI, custom agents).
// Lives in ~/.agentcubicle (override: CUBICLE_HOME) so clients find it without knowing the
// Electron userData path. Files are user-only (0600).

export const DEFAULT_PORT = 9876

export function cubicleHome(): string {
  return process.env['CUBICLE_HOME'] || join(homedir(), '.agentcubicle')
}

function ensureHome(): string {
  const dir = cubicleHome()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

function writePrivate(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o600 })
  chmodSync(path, 0o600) // also fixes permissions on pre-existing files
}

/** Load the bearer token, creating a random 256-bit one on first run. */
export function loadOrCreateToken(): string {
  const path = join(ensureHome(), 'token')
  try {
    const existing = readFileSync(path, 'utf8').trim()
    if (/^[a-f0-9]{64}$/.test(existing)) return existing
  } catch {
    // first run
  }
  const token = randomBytes(32).toString('hex')
  writePrivate(path, token + '\n')
  return token
}

export interface EndpointInfo {
  port: number
  eventUrl: string
  hookUrl: string
}

/** Publish the listening address for clients (endpoint.json + hook-url used by the hook command). */
export function publishEndpoint(port: number): EndpointInfo {
  const dir = ensureHome()
  const base = `http://127.0.0.1:${port}`
  const info: EndpointInfo = {
    port,
    eventUrl: `${base}/api/event`,
    hookUrl: `${base}/hooks/claude-code`,
  }
  writePrivate(join(dir, 'endpoint.json'), JSON.stringify(info, null, 2) + '\n')
  writePrivate(join(dir, 'hook-url'), info.hookUrl + '\n')
  return info
}
