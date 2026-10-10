import { describe, expect, it } from 'vitest'
import type { AgentEvent } from './events'
import { EventHub, basename, sessionKey } from './hub'
import { SCENARIOS, expandScenario, scenarioByName, scenarioDuration } from './sim/scenarios'

// SPEC §4 transition rules, one test per rule, plus every simulator scenario end-to-end.

class Clock {
  t = 1_000_000
  now = () => this.t
  advance(ms: number) {
    this.t += ms
  }
}

let n = 0
function ev(type: AgentEvent['type'], extra: Partial<AgentEvent> = {}, clock?: Clock): AgentEvent {
  n++
  return {
    eventId: `e${n}`,
    agentId: 'claude-code',
    sessionId: 's1',
    type,
    timestamp: clock?.t ?? 1_000_000 + n,
    source: 'hook',
    ...extra,
  }
}

function setup(config = {}) {
  const clock = new Clock()
  const hub = new EventHub(clock.now, config)
  const send = (type: AgentEvent['type'], extra: Partial<AgentEvent> = {}) =>
    hub.ingest(ev(type, extra, clock))
  const state = (key = 'claude-code:s1') =>
    hub.snapshot().sessions.find((s) => sessionKey(s.agentId, s.sessionId) === key)
  const tick = (ms: number) => {
    clock.advance(ms)
    hub.tick()
  }
  return { clock, hub, send, state, tick }
}

describe('reducer rules (SPEC §4)', () => {
  it('TOOL_STARTED → ACTIVE with the tool activity', () => {
    const { send, state } = setup()
    send('TASK_STARTED')
    send('TOOL_STARTED', { toolKind: 'WRITE', detail: 'src/a.ts' })
    expect(state()).toMatchObject({
      presence: 'ACTIVE',
      activity: 'WRITE',
      inferred: false,
      detail: 'a.ts',
    })
    send('TOOL_STARTED', { toolKind: 'SEARCH' })
    expect(state()?.activity).toBe('READ')
    send('TOOL_STARTED', { toolKind: 'EXEC' })
    expect(state()?.activity).toBe('EXEC')
  })

  it('unknown tools are busy-but-inferred', () => {
    const { send, state } = setup()
    send('TOOL_STARTED', { toolKind: 'OTHER' })
    expect(state()).toMatchObject({ presence: 'ACTIVE', activity: 'THINKING', inferred: true })
  })

  it('TOOL_COMPLETED → inferred THINKING; a failed tool is not a failed task', () => {
    const { send, state } = setup()
    send('TOOL_STARTED', { toolKind: 'EXEC' })
    send('TOOL_COMPLETED', { toolKind: 'EXEC', success: false })
    expect(state()).toMatchObject({ presence: 'ACTIVE', activity: 'THINKING', inferred: true })
  })

  it('APPROVAL_REQUIRED is sticky until the agent visibly moves on', () => {
    const { send, state, tick } = setup()
    send('TOOL_STARTED', { toolKind: 'EXEC' })
    send('APPROVAL_REQUIRED')
    send('HEARTBEAT')
    send('SESSION_STARTED')
    send('APPROVAL_REQUIRED')
    tick(60 * 60_000) // an hour later: still waiting, never stale
    expect(state()?.presence).toBe('WAITING_APPROVAL')
    send('TOOL_COMPLETED', { success: true })
    expect(state()?.presence).toBe('ACTIVE')
  })

  it.each([
    'TOOL_STARTED',
    'TOOL_COMPLETED',
    'TASK_STARTED',
    'TASK_COMPLETED',
    'TASK_FAILED',
    'SESSION_ENDED',
  ] as const)('%s releases WAITING_APPROVAL', (type) => {
    const { send, state } = setup()
    send('APPROVAL_REQUIRED')
    send(type)
    expect(state()?.presence).not.toBe('WAITING_APPROVAL')
  })

  it('TASK_COMPLETED → COMPLETED, then IDLE after the hold', () => {
    const { send, state, tick } = setup()
    send('TASK_STARTED')
    send('TASK_COMPLETED')
    expect(state()?.presence).toBe('COMPLETED')
    tick(2_000)
    expect(state()?.presence).toBe('COMPLETED')
    tick(1_500)
    expect(state()?.presence).toBe('IDLE')
  })

  it('TASK_FAILED → ERROR sticky until a new TASK_STARTED', () => {
    const { send, state, tick } = setup()
    send('TASK_STARTED')
    send('TASK_FAILED', { detail: 'boom' })
    send('TOOL_STARTED', { toolKind: 'READ' })
    send('TASK_COMPLETED')
    tick(60 * 60_000)
    expect(state()).toMatchObject({ presence: 'ERROR', detail: 'boom' })
    send('TASK_STARTED')
    expect(state()).toMatchObject({ presence: 'ACTIVE', activity: 'THINKING' })
  })

  it('silence while ACTIVE → STALE (not IDLE, not success); STALE → IDLE later', () => {
    const { send, state, tick } = setup({ staleAfterMs: 90_000, idleAfterStaleMs: 300_000 })
    send('TOOL_STARTED', { toolKind: 'WRITE' })
    tick(89_000)
    expect(state()?.presence).toBe('ACTIVE')
    tick(2_000)
    expect(state()).toMatchObject({ presence: 'STALE', activity: 'WRITE' })
    tick(299_000)
    expect(state()?.presence).toBe('STALE')
    tick(2_000)
    expect(state()?.presence).toBe('IDLE')
  })

  it('a STALE session resumes its activity when it speaks again', () => {
    const { send, state, tick } = setup({ staleAfterMs: 1_000 })
    send('TOOL_STARTED', { toolKind: 'EXEC' })
    tick(2_000)
    expect(state()?.presence).toBe('STALE')
    send('HEARTBEAT')
    expect(state()).toMatchObject({ presence: 'ACTIVE', activity: 'EXEC' })
  })

  it('SESSION_ENDED → IDLE, then the session is removed after lingering', () => {
    const { send, state, tick, hub } = setup({ endedLingerMs: 10_000 })
    send('TASK_STARTED')
    send('SESSION_ENDED')
    expect(state()?.presence).toBe('IDLE')
    tick(11_000)
    expect(hub.snapshot().sessions).toHaveLength(0)
  })
})

describe('ingestion (dedupe, ordering, validation)', () => {
  it('rejects invalid payloads without throwing or changing state', () => {
    const { hub, send, state } = setup()
    send('TOOL_STARTED', { toolKind: 'WRITE' })
    for (const bad of [
      null,
      'x',
      42,
      {},
      { type: 'TOOL_STARTED' },
      { ...ev('TOOL_STARTED'), type: 'NOPE' },
    ]) {
      expect(hub.ingest(bad)).toBe('invalid')
    }
    expect(state()?.activity).toBe('WRITE')
    expect(hub.diagnostics().filter((d) => d.outcome === 'invalid')).toHaveLength(6)
  })

  it('drops duplicate eventIds', () => {
    const { hub } = setup()
    const e = ev('TASK_STARTED')
    expect(hub.ingest(e)).toBe('applied')
    expect(hub.ingest(e)).toBe('duplicate')
  })

  it('drops events older than the last applied sequence', () => {
    const { hub, state } = setup()
    hub.ingest(ev('TOOL_STARTED', { toolKind: 'WRITE', sequence: 5 }))
    expect(hub.ingest(ev('TOOL_STARTED', { toolKind: 'READ', sequence: 4 }))).toBe('out-of-order')
    expect(state()?.activity).toBe('WRITE')
  })

  it('falls back to timestamps when there is no sequence', () => {
    const { hub, state } = setup()
    hub.ingest(ev('TOOL_STARTED', { toolKind: 'WRITE', timestamp: 2_000 }))
    expect(hub.ingest(ev('TOOL_STARTED', { toolKind: 'READ', timestamp: 1_500 }))).toBe(
      'out-of-order',
    )
    expect(state()?.activity).toBe('WRITE')
  })

  it('keeps sessions independent', () => {
    const { hub, state } = setup()
    hub.ingest(ev('TOOL_STARTED', { sessionId: 'a', toolKind: 'WRITE' }))
    hub.ingest(ev('TASK_FAILED', { sessionId: 'b' }))
    expect(state('claude-code:a')?.presence).toBe('ACTIVE')
    expect(state('claude-code:b')?.presence).toBe('ERROR')
  })

  it('assigns stable seats and reports overflow', () => {
    const { hub, tick } = setup({ seats: 2, endedLingerMs: 1_000 })
    for (const id of ['a', 'b', 'c']) hub.ingest(ev('SESSION_STARTED', { sessionId: id }))
    const seats = () =>
      Object.fromEntries(hub.snapshot().sessions.map((s) => [s.sessionId, s.seat]))
    expect(seats()).toEqual({ a: 0, b: 1, c: undefined })
    expect(hub.snapshot().overflow).toBe(1)
    hub.ingest(ev('SESSION_ENDED', { sessionId: 'a' }))
    tick(500)
    expect(seats().c).toBeUndefined() // seat held while the ended session lingers
    tick(1_000)
    expect(seats()).toEqual({ b: 1, c: 0 })
  })

  it('prefers the seat an agent used before', () => {
    const { hub, send, tick } = setup({ seats: 2, endedLingerMs: 0 })
    send('SESSION_STARTED', { agentId: 'codex', sessionId: 'x1' })
    send('SESSION_STARTED', { agentId: 'claude-code', sessionId: 'y1' })
    send('SESSION_ENDED', { agentId: 'codex', sessionId: 'x1' })
    send('SESSION_ENDED', { agentId: 'claude-code', sessionId: 'y1' })
    tick(1)
    expect(hub.snapshot().sessions).toHaveLength(0)
    // Claude arrives first this time, but codex's old seat 0 stays codex's preference.
    send('SESSION_STARTED', { agentId: 'claude-code', sessionId: 'y2' })
    send('SESSION_STARTED', { agentId: 'codex', sessionId: 'x2' })
    const seat = (id: string) => hub.snapshot().sessions.find((s) => s.sessionId === id)?.seat
    expect(seat('y2')).toBe(1)
    expect(seat('x2')).toBe(0)
  })

  it('sanitizes detail to basenames by default', () => {
    expect(basename('/Users/me/secret/project/a.ts')).toBe('a.ts')
    expect(basename('C:\\Users\\me\\b.ts')).toBe('b.ts')
    expect(basename('cat /etc/passwd && ls ./src/')).toBe('cat passwd && ls src')
    expect(basename('pnpm test')).toBe('pnpm test')
    const { send, state } = setup()
    send('TOOL_STARTED', { toolKind: 'READ', detail: '/Users/me/private/notes.md' })
    expect(state()?.detail).toBe('notes.md')
  })
})

describe('simulator scenarios drive the hub end-to-end', () => {
  function play(name: string) {
    const scenario = scenarioByName(name)!
    const clock = new Clock()
    const hub = new EventHub(clock.now, scenario.hubConfig)
    const start = clock.t
    const timeline = expandScenario(scenario, { runId: 't', startTime: start })
    const seen: Record<string, string[]> = {}
    const record = () => {
      for (const s of hub.snapshot().sessions) {
        const label = s.presence === 'ACTIVE' ? s.activity : s.presence
        const list = (seen[s.agentId] ??= [])
        if (list.at(-1) !== label) list.push(label)
      }
    }
    let i = 0
    const end = start + scenarioDuration(scenario) + 40_000
    for (; clock.t <= end; clock.advance(100)) {
      while (i < timeline.length && start + timeline[i]!.at <= clock.t)
        hub.ingest(timeline[i++]!.event)
      hub.tick()
      record()
    }
    return { hub, seen }
  }

  it('normal-task walks through read, write, exec, completed, idle', () => {
    const { seen } = play('normal-task')
    expect(seen['claude-code']).toEqual([
      'IDLE',
      'THINKING',
      'READ',
      'THINKING',
      'READ',
      'THINKING',
      'WRITE',
      'THINKING',
      'EXEC',
      'THINKING',
      'COMPLETED',
      'IDLE',
    ])
  })

  it('approval waits through heartbeats and resumes after approval', () => {
    const { seen } = play('approval')
    const s = seen['claude-code']!
    expect(s).toContain('WAITING_APPROVAL')
    expect(s[s.indexOf('WAITING_APPROVAL') + 1]).toBe('THINKING')
    expect(s.at(-1)).toBe('IDLE')
  })

  it('failure-recovery stays in ERROR until the next task', () => {
    const { seen } = play('failure-recovery')
    const s = seen['claude-code']!
    const err = s.indexOf('ERROR')
    expect(err).toBeGreaterThan(0)
    expect(s[err + 1]).toBe('THINKING') // TASK_STARTED, not the READ noise
    expect(s.at(-1)).toBe('IDLE')
  })

  it('out-of-order never shows the late READ and ignores duplicates', () => {
    const { seen, hub } = play('out-of-order')
    expect(seen['claude-code']).not.toContain('READ')
    expect(seen['claude-code']).toEqual([
      'IDLE',
      'THINKING',
      'WRITE',
      'THINKING',
      'COMPLETED',
      'IDLE',
    ])
    const outcomes = hub.diagnostics().map((d) => d.outcome)
    expect(outcomes.filter((o) => o === 'duplicate')).toHaveLength(3)
    expect(outcomes.filter((o) => o === 'out-of-order')).toHaveLength(1)
  })

  it('disconnect goes STALE (no fake success) and resumes', () => {
    const { seen } = play('disconnect')
    // The next event after the gap is TOOL_COMPLETED: resume, then apply it in one step.
    expect(seen['claude-code']).toEqual([
      'IDLE',
      'THINKING',
      'WRITE',
      'STALE',
      'THINKING',
      'COMPLETED',
      'IDLE',
    ])
  })

  it('multi-session keeps agents separate and seated apart', () => {
    const scenario = scenarioByName('multi-session')!
    const { seen } = play('multi-session')
    expect(seen['claude-code']).toContain('COMPLETED')
    expect(seen['codex']).toContain('ERROR')
    expect(seen['codex']!.at(-1)).toBe('IDLE')
    const clock = new Clock()
    const hub = new EventHub(clock.now)
    for (const { event } of expandScenario(scenario, { runId: 's', startTime: clock.t }).slice(
      0,
      2,
    ))
      hub.ingest(event)
    expect(
      hub
        .snapshot()
        .sessions.map((s) => s.seat)
        .sort(),
    ).toEqual([0, 1])
  })

  it.each(SCENARIOS.map((s) => s.name))(
    '%s expands to schema-valid, uniquely-identified events',
    (name) => {
      const timeline = expandScenario(scenarioByName(name)!, { runId: 'u', startTime: 0, speed: 2 })
      const hub = new EventHub(() => 0)
      const ids = new Set<string>()
      for (const { event } of timeline) {
        expect(hub.ingest(structuredClone(event))).not.toBe('invalid')
        ids.add(event.eventId)
      }
      const duplicates = scenarioByName(name)!.steps.filter(
        (s) => s.duplicateOf !== undefined,
      ).length
      expect(ids.size).toBe(timeline.length - duplicates)
    },
  )
})
