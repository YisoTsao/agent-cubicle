import { randomUUID } from 'node:crypto'
import type { AgentEvent, AgentEventType } from '@shared/events'
import { claudeAgentName, toolDetail, toolKind } from './claudeTools'

// Claude Code hook payload → AgentEvent (SPEC §5.1). Field names verified against the official
// hooks reference (code.claude.com/docs/en/hooks, 2026-10). Pure apart from id generation.

export const CLAUDE_AGENT_ID = 'claude-code'

/** Hook events we subscribe to, with the matcher (if any) used when installing. */
export const CLAUDE_HOOK_EVENTS: { event: string; matcher?: string }[] = [
  { event: 'SessionStart' },
  { event: 'UserPromptSubmit' },
  { event: 'PreToolUse', matcher: '*' },
  { event: 'PermissionRequest', matcher: '*' },
  { event: 'PostToolUse', matcher: '*' },
  { event: 'PostToolUseFailure', matcher: '*' },
  { event: 'Notification', matcher: 'permission_prompt' },
  { event: 'Stop' },
  { event: 'StopFailure' },
  { event: 'SessionEnd' },
]

interface HookPayload {
  hook_event_name?: unknown
  session_id?: unknown
  cwd?: unknown
  tool_name?: unknown
  tool_input?: unknown
  error?: unknown
  is_interrupt?: unknown
  notification_type?: unknown
  message?: unknown
}

export type MapResult = { event: AgentEvent } | { ignored: string }

/**
 * Map one hook payload. `sequence` must increase per session in arrival order — hooks are run
 * synchronously by Claude Code, so arrival order is execution order.
 */
export function mapClaudeHook(raw: unknown, now: number, sequence: number): MapResult {
  if (!raw || typeof raw !== 'object') return { ignored: 'not an object' }
  const p = raw as HookPayload
  const hook = typeof p.hook_event_name === 'string' ? p.hook_event_name : ''
  const sessionId = typeof p.session_id === 'string' ? p.session_id : ''
  if (!hook || !sessionId) return { ignored: 'missing hook_event_name or session_id' }

  const toolName = typeof p.tool_name === 'string' ? p.tool_name : undefined
  let type: AgentEventType
  const extra: Partial<AgentEvent> = {}

  switch (hook) {
    case 'SessionStart':
      type = 'SESSION_STARTED'
      break
    case 'UserPromptSubmit':
      // The prompt text is deliberately never forwarded (privacy).
      type = 'TASK_STARTED'
      break
    case 'PreToolUse':
      type = 'TOOL_STARTED'
      break
    case 'PostToolUse':
      type = 'TOOL_COMPLETED'
      extra.success = true
      break
    case 'PostToolUseFailure':
      type = 'TOOL_COMPLETED'
      extra.success = false
      break
    case 'PermissionRequest':
      type = 'APPROVAL_REQUIRED'
      break
    case 'Notification':
      if (p.notification_type !== 'permission_prompt')
        return { ignored: `notification ${String(p.notification_type)}` }
      type = 'APPROVAL_REQUIRED'
      break
    case 'Stop':
      type = 'TASK_COMPLETED'
      break
    case 'StopFailure':
      type = 'TASK_FAILED'
      if (typeof p.error === 'string') extra.detail = `API error: ${p.error}`.slice(0, 120)
      break
    case 'SessionEnd':
      type = 'SESSION_ENDED'
      break
    default:
      return { ignored: `unhandled hook ${hook}` }
  }

  if (
    toolName &&
    (type === 'TOOL_STARTED' || type === 'TOOL_COMPLETED' || type === 'APPROVAL_REQUIRED')
  ) {
    extra.toolName = toolName.slice(0, 64)
    extra.toolKind = toolKind(toolName)
    const detail = toolDetail(toolName, p.tool_input)
    if (detail && type !== 'TOOL_COMPLETED') extra.detail = detail
  }

  return {
    event: {
      eventId: randomUUID(),
      agentId: CLAUDE_AGENT_ID,
      agentName: claudeAgentName(p.cwd),
      sessionId: sessionId.slice(0, 128),
      type,
      timestamp: now,
      sequence,
      source: 'hook',
      ...extra,
    },
  }
}
