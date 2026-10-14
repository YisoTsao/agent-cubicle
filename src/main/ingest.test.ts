import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EventHub } from '@shared/hub'
import { IngestRouter } from './ingest'

const chat = (workspace: string, id: string) =>
  join('/vscode/User/workspaceStorage', workspace, 'chatSessions', `${id}.jsonl`)

const sessionStatus = (hub: EventHub, id: string) =>
  hub.snapshot().sessions.find((s) => s.agentId === 'copilot' && s.sessionId === id)?.presence

describe('IngestRouter: Copilot chats in one workspace', () => {
  it('a new chat replaces an idle previous chat (switching model starts a new chat file)', () => {
    let now = Date.now()
    const hub = new EventHub(() => now)
    const router = new IngestRouter(hub)

    router.fromRecentCopilot(chat('ws1', 'old'))
    expect(sessionStatus(hub, 'old')).toBe('IDLE')

    now += 60_000
    router.fromRecentCopilot(chat('ws1', 'new'))
    // Lingers briefly while it leaves the office, like a closed Claude session.
    expect(sessionStatus(hub, 'old')).toBe('IDLE')
    expect(sessionStatus(hub, 'new')).toBe('IDLE')

    now += 60_000
    hub.tick()
    expect(sessionStatus(hub, 'old')).toBeUndefined()
    expect(sessionStatus(hub, 'new')).toBe('IDLE')
  })

  it('keeps a previous chat that is still working', () => {
    let now = Date.now()
    const hub = new EventHub(() => now)
    const router = new IngestRouter(hub)

    router.fromRecentCopilot(chat('ws1', 'old'))
    router.fromCopilotLine(
      JSON.stringify({ kind: 2, k: ['requests'], v: [{ message: {} }] }),
      chat('ws1', 'old'),
    )
    expect(sessionStatus(hub, 'old')).toBe('ACTIVE')

    now += 1_000
    router.fromRecentCopilot(chat('ws1', 'new'))
    expect(sessionStatus(hub, 'old')).toBe('ACTIVE')
    expect(sessionStatus(hub, 'new')).toBe('IDLE')
  })

  it('does not touch chats in other workspaces', () => {
    let now = Date.now()
    const hub = new EventHub(() => now)
    const router = new IngestRouter(hub)

    router.fromRecentCopilot(chat('ws1', 'a'))
    now += 1_000
    router.fromRecentCopilot(chat('ws2', 'b'))
    expect(sessionStatus(hub, 'a')).toBe('IDLE')
    expect(sessionStatus(hub, 'b')).toBe('IDLE')
  })
})

describe('IngestRouter: Claude sessions recovered at startup', () => {
  it('names a recovered session by its project', () => {
    const hub = new EventHub(() => Date.now())
    const router = new IngestRouter(hub)
    router.fromRecentTranscript('s1', '{"type":"user","cwd":"/Users/me/work/api"}', null)
    expect(hub.snapshot().sessions.map((s) => s.agentName)).toEqual(['Claude Code · api'])
  })

  it('does not announce a recovered session that has no project to name it by', () => {
    const hub = new EventHub(() => Date.now())
    const router = new IngestRouter(hub)
    router.fromRecentTranscript('s2', '{"type":"summary"}', '{"type":"mode"}')
    expect(hub.snapshot().sessions).toEqual([])
  })
})
