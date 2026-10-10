import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_PORT, cubicleHome } from './endpoint'
import { hasOurHooks, hookCommand, lineDiff, withOurHooks, withoutOurHooks } from './hookConfig'

// Installs/removes the observer hooks in the user's Claude Code settings (SPEC §5.1).
// Two-step and user-confirmed: plan() returns the exact diff; apply(planId) writes it only if
// the file is unchanged since planning, after backing it up, via an atomic rename.

export function claudeSettingsPath(): string {
  return process.env['CUBICLE_CLAUDE_SETTINGS'] || join(homedir(), '.claude', 'settings.json')
}

export interface HookPlan {
  planId: string
  action: 'install' | 'uninstall'
  path: string
  fileExists: boolean
  diff: string
  noop: boolean
}

interface StoredPlan {
  plan: HookPlan
  beforeHash: string
  content: string
  expires: number
}

export interface HookStatus {
  path: string
  installed: boolean
  error?: string
}

const PLAN_TTL_MS = 5 * 60_000
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export class HookInstaller {
  private readonly plans = new Map<string, StoredPlan>()

  status(): HookStatus {
    const path = claudeSettingsPath()
    try {
      const { json } = this.read(path)
      return { path, installed: hasOurHooks(json) }
    } catch (err) {
      return { path, installed: false, error: (err as Error).message }
    }
  }

  plan(action: 'install' | 'uninstall'): HookPlan {
    const path = claudeSettingsPath()
    const { raw, json, exists } = this.read(path)
    const command = hookCommand(cubicleHome(), `http://127.0.0.1:${DEFAULT_PORT}/hooks/claude-code`)
    const next = action === 'install' ? withOurHooks(json, command) : withoutOurHooks(json)
    const content = JSON.stringify(next, null, 2) + '\n'
    const before = exists ? JSON.stringify(json, null, 2) + '\n' : ''
    const plan: HookPlan = {
      planId: randomUUID(),
      action,
      path,
      fileExists: exists,
      diff: lineDiff(before, content),
      noop: content === before,
    }
    this.plans.set(plan.planId, {
      plan,
      beforeHash: sha(raw),
      content,
      expires: Date.now() + PLAN_TTL_MS,
    })
    return plan
  }

  apply(planId: string): HookStatus {
    const stored = this.plans.get(planId)
    this.plans.delete(planId)
    if (!stored || stored.expires < Date.now())
      throw new Error('This change has expired. Please review it again.')
    const path = stored.plan.path
    const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
    if (sha(current) !== stored.beforeHash) {
      throw new Error('settings.json changed since the preview. Please review the change again.')
    }
    if (stored.plan.noop) return this.status()
    mkdirSync(dirname(path), { recursive: true })
    if (existsSync(path)) copyFileSync(path, `${path}.agentcubicle-backup-${Date.now()}`)
    const tmp = `${path}.agentcubicle-tmp-${process.pid}`
    writeFileSync(tmp, stored.content, { mode: 0o600 })
    renameSync(tmp, path)
    return this.status()
  }

  private read(path: string): { raw: string; json: Record<string, unknown>; exists: boolean } {
    if (!existsSync(path)) return { raw: '', json: {}, exists: false }
    const raw = readFileSync(path, 'utf8')
    if (!raw.trim()) return { raw, json: {}, exists: true }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      throw new Error(`${path} is not valid JSON; fix it before connecting.`)
    }
    if (!json || typeof json !== 'object' || Array.isArray(json))
      throw new Error(`${path} is not a JSON object.`)
    return { raw, json: json as Record<string, unknown>, exists: true }
  }
}
