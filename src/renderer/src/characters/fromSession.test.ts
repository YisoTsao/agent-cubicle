import { describe, expect, it } from 'vitest'
import type { SessionState } from '@shared/events'
import { styleFor, toPresentation } from './fromSession'

const base: SessionState = {
  agentId: 'claude-code',
  agentName: 'Claude Code',
  sessionId: 's',
  presence: 'ACTIVE',
  activity: 'NONE',
  inferred: false,
  since: 0,
  lastEventAt: 0,
}

describe('toPresentation', () => {
  it.each([
    [{ presence: 'ACTIVE', activity: 'READ' }, 'READ'],
    [{ presence: 'ACTIVE', activity: 'WRITE' }, 'WRITE'],
    [{ presence: 'ACTIVE', activity: 'EXEC' }, 'EXEC'],
    [{ presence: 'ACTIVE', activity: 'THINKING' }, 'THINKING'],
    [{ presence: 'ACTIVE', activity: 'NONE' }, 'THINKING'],
    [{ presence: 'WAITING_APPROVAL', activity: 'EXEC' }, 'WAITING_APPROVAL'],
    [{ presence: 'COMPLETED' }, 'COMPLETED'],
    [{ presence: 'ERROR' }, 'ERROR'],
    [{ presence: 'STALE', activity: 'WRITE' }, 'STALE'],
    [{ presence: 'IDLE' }, 'IDLE'],
  ] as const)('%o → %s', (patch, expected) => {
    expect(toPresentation({ ...base, ...patch })).toBe(expected)
  })
})

describe('styleFor', () => {
  it('is stable per agent (same object) and distinct across agents', () => {
    expect(styleFor('claude-code')).toBe(styleFor('claude-code'))
    expect(styleFor('claude-code').shirt).not.toBe(styleFor('codex').shirt)
    expect(styleFor('some-new-agent')).toBe(styleFor('some-new-agent'))
  })
})
