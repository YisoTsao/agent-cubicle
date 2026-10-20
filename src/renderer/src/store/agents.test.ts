import type { StateSnapshot } from '@shared/ipc'
import { beforeAll, describe, expect, it, vi } from 'vitest'

let fromSnapshot: typeof import('./agents').fromSnapshot

beforeAll(async () => {
  vi.stubGlobal('window', { location: { search: '' }, navigator: { userAgent: 'test' } })
  ;({ fromSnapshot } = await import('./agents'))
})

describe('fromSnapshot', () => {
  it('keeps an active Copilot session visible when idle workspace histories fill every spot', () => {
    const idle = Array.from({ length: 4 }, (_, index) => ({
      agentId: 'copilot',
      agentName: `GitHub Copilot · project-${index}`,
      sessionId: `idle-${index}`,
      presence: 'IDLE' as const,
      activity: 'NONE' as const,
      inferred: false,
      since: index,
      lastEventAt: index,
      ...(index < 2 ? { seat: index } : {}),
    }))
    const snapshot: StateSnapshot = {
      sessions: [
        ...idle,
        {
          agentId: 'copilot',
          agentName: 'GitHub Copilot · active-project',
          sessionId: 'active',
          presence: 'ACTIVE',
          activity: 'THINKING',
          inferred: true,
          since: 10,
          lastEventAt: 10,
        },
      ],
      overflow: 1,
    }

    const result = fromSnapshot(snapshot, 'duo', {})

    expect(result.agents.map((agent) => agent.name)).toContain('GitHub Copilot · active-project')
    expect(result.overflow).toBe(1)
  })
})
