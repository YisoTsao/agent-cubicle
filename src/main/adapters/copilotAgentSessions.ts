import { readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AgentEvent } from '@shared/events'
import { COPILOT_AGENT_ID } from './copilotChat'

// VS Code agent sessions → AgentEvents.
//
// Newer VS Code builds keep agent-host Copilot sessions out of the chat JSONL files. Each session is
//   <VS Code app support>/Code/agentSessionData/<session>/session.db   (SQLite, rollback journal)
// with three tables used here:
//   session_metadata  copilot.project.displayName / copilot.project.uri → the project name
//   turns             one row per request (id "request_<uuid>"), inserted while it runs
//   turn_usage        one row per finished request (written at the end)
// A turn without a usage row is still running. Prompts, answers and tool data are never read.
// The format is undocumented: every access is defensive and unknown shapes are ignored.

const RECENT_MS = 5 * 60_000
const MAX_DBS = 500
const TEXT_MAX = 48

export interface AgentSessionSnapshot {
  projectName?: string
  turns: { id: string; done: boolean }[]
}

/** Reads the project name and the request list of one session database (read-only). */
export function readAgentSession(dbPath: string): AgentSessionSnapshot | null {
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
    const meta = new Map<string, string>()
    const rows = db
      .prepare('SELECT key, value FROM session_metadata WHERE key IN (?, ?, ?)')
      .all('copilot.project.displayName', 'copilot.project.uri', 'copilot.workingDirectory') as {
      key: string
      value: string
    }[]
    for (const row of rows) meta.set(row.key, row.value)
    const turns = db
      .prepare(
        'SELECT t.id AS id, (u.turn_id IS NOT NULL) AS done FROM turns t LEFT JOIN turn_usage u ON u.turn_id = t.id ORDER BY t.rowid',
      )
      .all() as { id: unknown; done: unknown }[]
    const name = projectName(meta)
    return {
      ...(name ? { projectName: name } : {}),
      turns: turns
        .filter((t): t is { id: string; done: unknown } => typeof t.id === 'string')
        .map((t) => ({ id: t.id, done: Number(t.done) === 1 })),
    }
  } catch {
    return null
  } finally {
    db?.close()
  }
}

/** The project's display name, or the last segment of its folder URI. */
function projectName(meta: Map<string, string>): string | undefined {
  const display = meta.get('copilot.project.displayName')
  if (display) return display.slice(0, TEXT_MAX)
  const uri = meta.get('copilot.project.uri') ?? meta.get('copilot.workingDirectory')
  if (!uri) return undefined
  try {
    const path = decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/[\\/]+$/, '')
    return basename(path).slice(0, TEXT_MAX) || undefined
  } catch {
    return undefined
  }
}

/**
 * Turns the request list of each agent session into TASK_STARTED / TASK_COMPLETED events.
 * A session database is only read again when its file changed. Requests that finished before the
 * app started are never replayed, and neither is a request that is older than the recent window.
 */
export class CopilotAgentSessionTracker {
  /** Session database path → last seen mtime and the turns already announced (true = finished). */
  private readonly dbs = new Map<string, { mtime: number; turns: Map<string, boolean> }>()

  /** Events for every session under one agentSessionData directory. */
  scanRoot(root: string, now = Date.now()): AgentEvent[] {
    let names: string[]
    try {
      names = readdirSync(root)
    } catch {
      return []
    }
    return names.flatMap((name) => this.scan(join(root, name, 'session.db'), now))
  }

  /** Events for one session database that changed since the last scan. */
  scan(dbPath: string, now = Date.now()): AgentEvent[] {
    let mtime: number
    try {
      mtime = statSync(dbPath).mtimeMs
    } catch {
      return []
    }
    const prior = this.dbs.get(dbPath)
    if (prior && prior.mtime === mtime) return []

    const snap = readAgentSession(dbPath)
    if (!snap) return [] // unreadable right now (e.g. mid-write): retry on the next poll

    const sessionId = `ahp:${basename(dirname(dbPath))}`.slice(0, 128)
    const agentName = `GitHub Copilot · ${snap.projectName ?? 'agent session'}`.slice(0, 64)
    const first = !prior
    const recent = now - mtime < RECENT_MS
    const previous = prior?.turns ?? new Map<string, boolean>()
    const turns = new Map<string, boolean>()
    const events: AgentEvent[] = []
    const emit = (type: AgentEvent['type'], turnId: string, key: string) =>
      events.push({
        eventId: `ahp:${turnId}:${key}`.slice(0, 128),
        agentId: COPILOT_AGENT_ID,
        agentName,
        sessionId,
        type,
        timestamp: now,
        source: 'log',
        ...(type === 'TASK_COMPLETED' ? { success: true } : {}),
      })

    for (const turn of snap.turns) {
      const announced = previous.get(turn.id)
      if (announced === undefined) {
        // History (finished, or too old to still be running) is recorded silently.
        if (first && (turn.done || !recent)) {
          turns.set(turn.id, true)
          continue
        }
        emit('TASK_STARTED', turn.id, 'start')
        if (turn.done) emit('TASK_COMPLETED', turn.id, 'done')
        turns.set(turn.id, turn.done)
      } else if (!announced && turn.done) {
        emit('TASK_COMPLETED', turn.id, 'done')
        turns.set(turn.id, true)
      } else {
        turns.set(turn.id, announced)
      }
    }

    this.dbs.delete(dbPath) // re-insert to keep LRU order
    this.dbs.set(dbPath, { mtime, turns })
    if (this.dbs.size > MAX_DBS) this.dbs.delete(this.dbs.keys().next().value!)
    return events
  }
}
