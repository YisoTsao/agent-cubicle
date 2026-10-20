import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CopilotAgentSessionTracker, readAgentSession } from './copilotAgentSessions'

const NOW = Date.UTC(2026, 9, 16, 3, 0, 0)
const sec = (ms: number) => ms / 1000

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agent-sessions-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** A session database with the same tables VS Code writes (only the ones read here). */
function session(
  name: string,
  opts: { project?: string; turns?: { id: string; done: boolean }[]; mtime?: number } = {},
): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'session.db')
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE session_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE turns (id TEXT PRIMARY KEY NOT NULL, event_id TEXT, checkpoint_ref TEXT);
    CREATE TABLE turn_usage (turn_id TEXT PRIMARY KEY NOT NULL, usage TEXT NOT NULL);
  `)
  if (opts.project) {
    db.prepare('INSERT INTO session_metadata (key, value) VALUES (?, ?)').run(
      'copilot.project.displayName',
      opts.project,
    )
  }
  db.prepare('INSERT INTO session_metadata (key, value) VALUES (?, ?)').run(
    'copilot.workingDirectory',
    'file:///Users/me/Desktop/SG/' + (opts.project ?? 'other'),
  )
  setTurns(db, opts.turns ?? [])
  db.close()
  utimesSync(path, sec(opts.mtime ?? NOW), sec(opts.mtime ?? NOW))
  return path
}

function setTurns(db: DatabaseSync, turns: { id: string; done: boolean }[]) {
  db.exec('DELETE FROM turn_usage; DELETE FROM turns;')
  for (const t of turns) {
    db.prepare('INSERT INTO turns (id) VALUES (?)').run(t.id)
    if (t.done) db.prepare('INSERT INTO turn_usage (turn_id, usage) VALUES (?, ?)').run(t.id, '{}')
  }
}

/** Rewrites the turn list and bumps the file's mtime, as VS Code does when a request changes. */
function update(path: string, turns: { id: string; done: boolean }[], mtime: number) {
  const db = new DatabaseSync(path)
  setTurns(db, turns)
  db.close()
  utimesSync(path, sec(mtime), sec(mtime))
}

describe('readAgentSession', () => {
  it('reads the project name and request states, not any text', () => {
    const path = session('a', {
      project: 'fe_booking',
      turns: [
        { id: 'request_1', done: true },
        { id: 'request_2', done: false },
      ],
    })
    expect(readAgentSession(path)).toEqual({
      projectName: 'fe_booking',
      turns: [
        { id: 'request_1', done: true },
        { id: 'request_2', done: false },
      ],
    })
  })

  it('returns null when the file is not a readable session database', () => {
    const path = join(root, 'broken.db')
    writeFileSync(path, 'not sqlite')
    expect(readAgentSession(path)).toBeNull()
  })
})

describe('CopilotAgentSessionTracker', () => {
  it('announces a request that is running when the app sees it', () => {
    const path = session('run', {
      project: 'fe_booking',
      turns: [{ id: 'request_1', done: false }],
      mtime: NOW - 10_000,
    })
    const events = new CopilotAgentSessionTracker().scan(path, NOW)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventId: 'ahp:request_1:start',
      agentId: 'copilot',
      agentName: 'GitHub Copilot · fe_booking',
      sessionId: 'ahp:run',
      type: 'TASK_STARTED',
      source: 'log',
    })
  })

  it('completes a request once its usage row appears, and does not repeat it', () => {
    const path = session('done', {
      project: 'fe_booking',
      turns: [{ id: 'request_1', done: false }],
      mtime: NOW - 10_000,
    })
    const tracker = new CopilotAgentSessionTracker()
    expect(tracker.scan(path, NOW).map((e) => e.type)).toEqual(['TASK_STARTED'])

    update(path, [{ id: 'request_1', done: true }], NOW + 1_000)
    const events = tracker.scan(path, NOW + 1_000)
    expect(events.map((e) => [e.type, e.eventId])).toEqual([
      ['TASK_COMPLETED', 'ahp:request_1:done'],
    ])
    expect(events[0]!.success).toBe(true)

    // Same file state again: nothing new.
    update(path, [{ id: 'request_1', done: true }], NOW + 2_000)
    expect(tracker.scan(path, NOW + 2_000)).toEqual([])
  })

  it('announces a new request that starts after the first scan', () => {
    const path = session('next', {
      project: 'fe_booking',
      turns: [{ id: 'request_1', done: true }],
      mtime: NOW - 10_000,
    })
    const tracker = new CopilotAgentSessionTracker()
    expect(tracker.scan(path, NOW)).toEqual([]) // history is not replayed

    update(
      path,
      [
        { id: 'request_1', done: true },
        { id: 'request_2', done: false },
      ],
      NOW + 1_000,
    )
    const events = tracker.scan(path, NOW + 1_000)
    expect(events.map((e) => [e.type, e.eventId])).toEqual([
      ['TASK_STARTED', 'ahp:request_2:start'],
    ])
  })

  it('does not show finished or long-stale history at startup', () => {
    const path = session('old', {
      project: 'fe_booking',
      turns: [
        { id: 'request_1', done: true },
        { id: 'request_2', done: false },
      ],
      mtime: NOW - 60 * 60_000,
    })
    expect(new CopilotAgentSessionTracker().scan(path, NOW)).toEqual([])
  })

  it('reads a database only when its file changed', () => {
    const path = session('same', {
      project: 'fe_booking',
      turns: [{ id: 'request_1', done: false }],
      mtime: NOW - 10_000,
    })
    const tracker = new CopilotAgentSessionTracker()
    expect(tracker.scan(path, NOW)).toHaveLength(1)
    expect(tracker.scan(path, NOW + 500)).toEqual([])
  })

  it('scans every session directory under a root and skips folders without a database', () => {
    session('one', { project: 'fe_booking', turns: [{ id: 'request_1', done: false }], mtime: NOW - 1_000 })
    mkdirSync(join(root, 'empty'))
    const events = new CopilotAgentSessionTracker().scanRoot(root, NOW)
    expect(events.map((e) => e.sessionId)).toEqual(['ahp:one'])
  })

  it('returns nothing for a missing root', () => {
    expect(new CopilotAgentSessionTracker().scanRoot(join(root, 'missing'), NOW)).toEqual([])
  })
})
