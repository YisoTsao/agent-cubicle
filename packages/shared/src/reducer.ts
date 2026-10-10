import type { Activity, AgentEvent, Presence, SessionState, ToolKind } from './events'

// Session state machine (SPEC §4). Pure functions: (state, event) → state and (state, now) → state.
// The hub owns dedupe/ordering/timers; this file owns *meaning*.

export interface ReducerConfig {
  /** ACTIVE with no events for this long → STALE (never IDLE, never "success"). */
  staleAfterMs: number
  /** STALE for this long → IDLE. */
  idleAfterStaleMs: number
  /** COMPLETED is shown this long before relaxing to IDLE. */
  completedHoldMs: number
}

export const DEFAULT_REDUCER_CONFIG: ReducerConfig = {
  staleAfterMs: 90_000,
  idleAfterStaleMs: 5 * 60_000,
  completedHoldMs: 3_000,
}

/** Internal session record: public state + bookkeeping the UI never sees. */
export interface SessionRecord extends SessionState {
  lastSequence?: number
  /** Presence/activity before going STALE, restored when the session speaks again. */
  beforeStale?: { presence: Presence; activity: Activity; inferred: boolean }
  endedAt?: number
}

const ACTIVITY_FOR_TOOL: Record<ToolKind, { activity: Activity; inferred: boolean }> = {
  READ: { activity: 'READ', inferred: false },
  SEARCH: { activity: 'READ', inferred: false },
  WRITE: { activity: 'WRITE', inferred: false },
  EXEC: { activity: 'EXEC', inferred: false },
  // Unknown tools: we know the agent is busy, not what it is doing.
  OTHER: { activity: 'THINKING', inferred: true },
}

export function createSession(event: AgentEvent): SessionRecord {
  return {
    agentId: event.agentId,
    agentName: event.agentName ?? event.agentId,
    sessionId: event.sessionId,
    presence: 'IDLE',
    activity: 'NONE',
    inferred: false,
    since: event.timestamp,
    lastEventAt: event.timestamp,
  }
}

function set(
  s: SessionRecord,
  at: number,
  presence: Presence,
  activity: Activity,
  inferred: boolean,
  detail?: string,
): SessionRecord {
  const changed = s.presence !== presence || s.activity !== activity
  const next: SessionRecord = { ...s, presence, activity, inferred, since: changed ? at : s.since }
  if (detail !== undefined) next.detail = detail
  else if (changed) delete next.detail
  return next
}

const thinking = (s: SessionRecord, at: number) => set(s, at, 'ACTIVE', 'THINKING', true)

/** Events that end a WAITING_APPROVAL (anything that proves the agent moved on). */
const RELEASES_APPROVAL = new Set<AgentEvent['type']>([
  'TOOL_STARTED',
  'TOOL_COMPLETED',
  'TASK_STARTED',
  'TASK_COMPLETED',
  'TASK_FAILED',
  'SESSION_ENDED',
])

/**
 * Apply one (already deduped and ordered) event. Unknown combinations keep the last valid
 * state — we never guess IDLE (SPEC §4).
 */
export function reduceSession(prev: SessionRecord, event: AgentEvent): SessionRecord {
  const at = event.timestamp
  let s: SessionRecord = { ...prev, lastEventAt: Math.max(prev.lastEventAt, at) }
  if (event.agentName) s.agentName = event.agentName
  if (event.sequence !== undefined) s.lastSequence = event.sequence

  // A STALE session that speaks again resumes where it was.
  if (s.presence === 'STALE' && s.beforeStale) {
    s = { ...s, ...s.beforeStale }
    delete s.beforeStale
  }

  // Sticky states: only specific events may release them.
  if (s.presence === 'WAITING_APPROVAL' && !RELEASES_APPROVAL.has(event.type)) return s
  if (s.presence === 'ERROR' && event.type !== 'TASK_STARTED' && event.type !== 'SESSION_ENDED')
    return s

  switch (event.type) {
    case 'SESSION_STARTED':
      return s.presence === 'ACTIVE' ? s : set(s, at, 'IDLE', 'NONE', false)
    case 'TASK_STARTED':
      return thinking(s, at)
    case 'TOOL_STARTED': {
      const kind = event.toolKind ?? 'OTHER'
      const { activity, inferred } = ACTIVITY_FOR_TOOL[kind]
      return set(s, at, 'ACTIVE', activity, inferred, event.detail)
    }
    case 'TOOL_COMPLETED':
      // A failed tool is a hiccup, not a failed task: the agent will usually react to it.
      return thinking(s, at)
    case 'APPROVAL_REQUIRED':
      return set(s, at, 'WAITING_APPROVAL', s.activity, s.inferred, event.detail ?? s.detail)
    case 'TASK_COMPLETED':
      return set(s, at, 'COMPLETED', 'NONE', false)
    case 'TASK_FAILED':
      return set(s, at, 'ERROR', 'NONE', false, event.detail)
    case 'SESSION_ENDED': {
      const ended = set(s, at, 'IDLE', 'NONE', false)
      ended.endedAt = at
      return ended
    }
    case 'HEARTBEAT':
      return s
  }
}

/** Time-based transitions. Returns the same object when nothing changes. */
export function tickSession(s: SessionRecord, now: number, cfg: ReducerConfig): SessionRecord {
  const silentFor = now - s.lastEventAt
  switch (s.presence) {
    case 'ACTIVE':
      if (silentFor >= cfg.staleAfterMs) {
        const stale: SessionRecord = {
          ...s,
          presence: 'STALE',
          since: now,
          beforeStale: { presence: s.presence, activity: s.activity, inferred: s.inferred },
        }
        return stale
      }
      return s
    case 'STALE':
      if (now - s.since >= cfg.idleAfterStaleMs) {
        const idle = set(s, now, 'IDLE', 'NONE', false)
        delete idle.beforeStale
        return idle
      }
      return s
    case 'COMPLETED':
      return now - s.since >= cfg.completedHoldMs ? set(s, now, 'IDLE', 'NONE', false) : s
    case 'WAITING_APPROVAL': // never times out: a human is needed
    case 'ERROR': // sticky until a new task starts
    case 'IDLE':
      return s
  }
}

/** Strip internal bookkeeping before sending to the renderer. */
export function toPublic(s: SessionRecord): SessionState {
  const { lastSequence: _seq, beforeStale: _bs, endedAt: _end, ...pub } = s
  return pub
}
