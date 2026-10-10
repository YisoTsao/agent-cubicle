import { describe, expect, it } from 'vitest'
import { AgentEvent } from './events'

const valid = {
  eventId: 'e1',
  agentId: 'claude-code',
  sessionId: 's1',
  type: 'TOOL_STARTED',
  timestamp: 1_700_000_000_000,
  toolName: 'Read',
  toolKind: 'READ',
  detail: 'index.ts',
  source: 'hook',
}

describe('AgentEvent schema', () => {
  it('accepts a well-formed event', () => {
    expect(AgentEvent.safeParse(valid).success).toBe(true)
  })

  it('rejects unknown event types', () => {
    expect(AgentEvent.safeParse({ ...valid, type: 'DANCE' }).success).toBe(false)
  })

  it('rejects missing session id', () => {
    const { sessionId: _omit, ...rest } = valid
    expect(AgentEvent.safeParse(rest).success).toBe(false)
  })

  it('rejects oversized detail', () => {
    expect(AgentEvent.safeParse({ ...valid, detail: 'x'.repeat(257) }).success).toBe(false)
  })

  it('rejects non-object payloads', () => {
    for (const bad of [null, 42, 'TOOL_STARTED', []]) {
      expect(AgentEvent.safeParse(bad).success).toBe(false)
    }
  })
})
