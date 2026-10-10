import { CLAUDE_HOOK_EVENTS } from './adapters/claudeHooks'

// Pure functions that add/remove AgentCubicle's observer hooks in a Claude Code settings object.
// Other hooks are never touched; ours are recognised by MARKER, so install is idempotent.
//
// Hook design (verified against code.claude.com/docs/en/hooks):
//  - type "command", run synchronously: Claude Code runs hooks in order, so events arrive in
//    execution order (async hooks are separate processes and could reorder Pre/PostToolUse).
//  - curl with 0.3 s connect / 0.5 s total timeout, all output discarded, always `exit 0`:
//    exit 0 + empty stdout = "no decision", so the hook can never block or steer the agent, and
//    when the app is closed it fails silently instead of showing "hook error" on every tool call.
//  - Token and URL are read from files at run time, so rotating them needs no reinstall.

export const MARKER = '# agentcubicle-hook'
const HOOK_TIMEOUT_S = 2

/** POSIX single-quote a path for the shell. */
function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export function hookCommand(home: string, fallbackUrl: string): string {
  // Claude Code runs hooks with bash (Git Bash on Windows), which reads C:/… paths fine.
  const dir = home.replace(/\\/g, '/')
  const token = `${dir}/token`
  const url = `${dir}/hook-url`
  return [
    'curl -s -o /dev/null --connect-timeout 0.3 -m 0.5 -X POST',
    `-H 'Content-Type: application/json'`,
    `-H "Authorization: Bearer $(cat ${sq(token)} 2>/dev/null)"`,
    `--data-binary @- "$(cat ${sq(url)} 2>/dev/null || echo ${sq(fallbackUrl)})"`,
    `>/dev/null 2>&1; exit 0 ${MARKER}`,
  ].join(' ')
}

type Json = Record<string, unknown>
interface HookEntry {
  type?: unknown
  command?: unknown
  [k: string]: unknown
}
interface HookGroup {
  matcher?: unknown
  hooks?: unknown
  [k: string]: unknown
}

const isOurs = (h: unknown) =>
  !!h &&
  typeof h === 'object' &&
  typeof (h as HookEntry).command === 'string' &&
  ((h as HookEntry).command as string).includes(MARKER)

export class SettingsShapeError extends Error {}

function hooksObject(settings: Json): Json {
  const hooks = settings['hooks']
  if (hooks === undefined) return {}
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
    throw new SettingsShapeError('"hooks" in settings.json is not an object; refusing to modify it')
  }
  return hooks as Json
}

/** Remove our entries; drop groups/events/hooks only if they became empty because of us. */
export function withoutOurHooks(settings: Json): Json {
  const hooks = hooksObject(settings)
  const nextHooks: Json = {}
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      nextHooks[event] = groups
      continue
    }
    const kept = groups.flatMap((g: unknown) => {
      if (!g || typeof g !== 'object' || !Array.isArray((g as HookGroup).hooks)) return [g]
      const group = g as HookGroup & { hooks: unknown[] }
      const remaining = group.hooks.filter((h) => !isOurs(h))
      if (remaining.length === group.hooks.length) return [g]
      return remaining.length ? [{ ...group, hooks: remaining }] : []
    })
    if (kept.length) nextHooks[event] = kept
  }
  const next: Json = { ...settings }
  if (Object.keys(nextHooks).length) next['hooks'] = nextHooks
  else delete next['hooks']
  return next
}

export function withOurHooks(settings: Json, command: string): Json {
  const base = withoutOurHooks(settings)
  const hooks = { ...hooksObject(base) }
  for (const { event, matcher } of CLAUDE_HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : []
    const group: HookGroup = { hooks: [{ type: 'command', command, timeout: HOOK_TIMEOUT_S }] }
    if (matcher) group.matcher = matcher
    groups.push(group)
    hooks[event] = groups
  }
  return { ...base, hooks }
}

export function hasOurHooks(settings: Json): boolean {
  try {
    const hooks = hooksObject(settings)
    return Object.values(hooks).some(
      (groups) =>
        Array.isArray(groups) &&
        groups.some(
          (g: unknown) =>
            Array.isArray((g as HookGroup)?.hooks) &&
            ((g as HookGroup).hooks as unknown[]).some(isOurs),
        ),
    )
  } catch {
    return false
  }
}

/** Minimal line diff (LCS) for showing the user exactly what will change. */
export function lineDiff(before: string, after: string): string {
  const a = before.split('\n')
  const b = after.split('\n')
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const out: string[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push(`  ${a[i]}`)
      i++
      j++
    } else if (j < b.length && (i >= a.length || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      out.push(`+ ${b[j]}`)
      j++
    } else {
      out.push(`- ${a[i]}`)
      i++
    }
  }
  return out.join('\n')
}
