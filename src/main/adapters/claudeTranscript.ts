import type { AgentEvent } from '@shared/events'
import { CLAUDE_AGENT_ID } from './claudeHooks'
import { claudeAgentName, toolDetail, toolKind } from './claudeTools'

// Claude Code transcript line (~/.claude/projects/<project>/<session>.jsonl) → AgentEvents.
// Supplementary source (SPEC §5.2): used when hooks are not installed. Interpreted:
//   user prompt (string content, not meta)  → TASK_STARTED
//   assistant tool_use                       → TOOL_STARTED
//   user tool_result                         → TOOL_COMPLETED (is_error → failure)
//   assistant stop_reason "end_turn"         → TASK_COMPLETED (main thread only)
// Every other line type is ignored; malformed lines never throw.

/**
 * The project directory (`cwd`) of the newest transcript line in `text` that carries one, or
 * undefined. Not every line has `cwd` (summaries, snapshots, meta lines), and a cut line at either
 * end of `text` is skipped.
 */
export function projectCwdIn(text: string | null): string | undefined {
  for (const line of (text ?? '').split('\n').reverse()) {
    try {
      const cwd = (JSON.parse(line) as { cwd?: unknown } | null)?.cwd
      if (typeof cwd === 'string' && cwd) return cwd
    } catch {
      // partial or non-JSON line: keep looking
    }
  }
  return undefined
}

export function mapTranscriptLine(line: string, fallbackNow: number): AgentEvent[] {
  let o: unknown
  try {
    o = JSON.parse(line)
  } catch {
    return []
  }
  if (!o || typeof o !== 'object') return []
  const rec = o as {
    type?: unknown
    sessionId?: unknown
    timestamp?: unknown
    cwd?: unknown
    uuid?: unknown
    isSidechain?: unknown
    isMeta?: unknown
    message?: { content?: unknown; stop_reason?: unknown }
  }
  if ((rec.type !== 'assistant' && rec.type !== 'user') || typeof rec.sessionId !== 'string')
    return []
  const content = rec.message?.content
  const sidechain = rec.isSidechain === true

  const parsed = typeof rec.timestamp === 'string' ? Date.parse(rec.timestamp) : NaN
  const timestamp = Number.isFinite(parsed) ? parsed : fallbackNow
  const base = {
    agentId: CLAUDE_AGENT_ID,
    agentName: claudeAgentName(rec.cwd),
    sessionId: rec.sessionId.slice(0, 128),
    timestamp,
    source: 'log' as const,
  }

  const events: AgentEvent[] = []
  const lineId = typeof rec.uuid === 'string' ? rec.uuid : `${timestamp}`

  if (rec.type === 'user' && typeof content === 'string' && rec.isMeta !== true && !sidechain) {
    events.push({ ...base, eventId: `log:${lineId}:prompt`.slice(0, 128), type: 'TASK_STARTED' })
    return events
  }
  if (!Array.isArray(content)) return events

  content.forEach((block: unknown, i) => {
    if (!block || typeof block !== 'object') return
    const b = block as {
      type?: unknown
      id?: unknown
      name?: unknown
      input?: unknown
      tool_use_id?: unknown
      is_error?: unknown
    }
    if (rec.type === 'assistant' && b.type === 'tool_use' && typeof b.name === 'string') {
      const e: AgentEvent = {
        ...base,
        eventId: `log:${String(b.id ?? `${String(rec.uuid)}:${i}`)}:start`.slice(0, 128),
        type: 'TOOL_STARTED',
        toolName: b.name.slice(0, 64),
        toolKind: toolKind(b.name),
      }
      const detail = toolDetail(b.name, b.input)
      if (detail) e.detail = detail
      events.push(e)
    } else if (rec.type === 'user' && b.type === 'tool_result') {
      events.push({
        ...base,
        eventId: `log:${String(b.tool_use_id ?? `${String(rec.uuid)}:${i}`)}:done`.slice(0, 128),
        type: 'TOOL_COMPLETED',
        success: b.is_error !== true,
      })
    }
  })

  if (rec.type === 'assistant' && rec.message?.stop_reason === 'end_turn' && !sidechain) {
    events.push({ ...base, eventId: `log:${lineId}:end`.slice(0, 128), type: 'TASK_COMPLETED' })
  }
  return events
}
