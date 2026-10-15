import { describe, expect, it } from 'vitest'
import { AgentEvent } from '@shared/events'
import { CopilotChatMapper, copilotAgentName, copilotToolKind } from './copilotChat'

// Lines shaped like the ones VS Code's Copilot Chat extension appends to
// workspaceStorage/<hash>/chatSessions/<id>.jsonl (observed on extension 0.48).

const line = (o: unknown) => JSON.stringify(o)
const tool = (toolId: string, extra: Record<string, unknown> = {}) => ({
  kind: 'toolInvocationSerialized',
  toolId,
  isConfirmed: { type: 1 },
  isComplete: false,
  ...extra,
})
const run = (m: CopilotChatMapper, ...lines: string[]) => lines.flatMap((l) => m.mapLine(l, 1000))
const types = (events: AgentEvent[]) =>
  events.map(
    (e) => `${e.type}${e.toolName ? ':' + e.toolName : ''}${e.detail ? `[${e.detail}]` : ''}`,
  )

describe('Copilot Chat mapper', () => {
  it('a request, its tools and its end become a normal task lifecycle', () => {
    const m = new CopilotChatMapper('chat-1', 'GitHub Copilot · app')
    const events = run(
      m,
      line({ kind: 0, v: { requests: [], sessionId: 'chat-1' } }),
      line({
        kind: 2,
        k: ['requests'],
        v: [{ requestId: 'r1', message: { text: 'SECRET PROMPT' } }],
      }),
      line({
        kind: 2,
        k: ['requests', 0, 'response'],
        v: [
          { value: 'SECRET ANSWER' },
          tool('copilot_readFile', {
            invocationMessage: {
              value: 'Reading [](file:///Users/me/proj/src/App.tsx), lines 1 to 50',
            },
          }),
        ],
      }),
      line({ kind: 1, k: ['requests', 0, 'response', 1, 'isComplete'], v: true }),
      line({
        kind: 2,
        k: ['requests', 0, 'response'],
        i: 2,
        v: [
          tool('copilot_replaceString', {
            isComplete: true,
            pastTenseMessage: { value: 'Edited [](file:///x/y/store.ts)' },
          }),
        ],
      }),
      line({ kind: 1, k: ['requests', 0, 'modelState'], v: { value: 1, completedAt: 5 } }),
    )
    expect(types(events)).toEqual([
      'TASK_STARTED',
      'TOOL_STARTED:copilot_readFile[App.tsx]',
      'TOOL_COMPLETED',
      'TOOL_STARTED:copilot_replaceString[store.ts]',
      'TOOL_COMPLETED',
      'TASK_COMPLETED',
    ])
    // Every event is valid for the hub and carries nothing but kinds and file names.
    for (const e of events) {
      expect(AgentEvent.safeParse(e).success).toBe(true)
      expect(e.agentId).toBe('copilot')
      expect(e.sessionId).toBe('chat-1')
      expect(JSON.stringify(e)).not.toMatch(/SECRET|\/Users\/me/)
    }
    expect(events.find((e) => e.toolName === 'copilot_replaceString')?.toolKind).toBe('WRITE')
    expect(new Set(events.map((e) => e.eventId)).size).toBe(events.length)
  })

  it('never shows a terminal command', () => {
    const m = new CopilotChatMapper('c')
    const events = run(
      m,
      line({
        kind: 2,
        k: ['requests', 0, 'response'],
        v: [
          tool('run_in_terminal', {
            invocationMessage: {
              value: 'Running `curl -H "Authorization: file:///token" x` in /Users/me/proj',
            },
          }),
        ],
      }),
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'TOOL_STARTED', toolKind: 'EXEC' })
    expect(events[0]!.detail).toBeUndefined()
  })

  it('does not announce the same tool twice when the log re-sends it', () => {
    const m = new CopilotChatMapper('c')
    const part = tool('copilot_findFiles')
    const events = run(
      m,
      line({ kind: 2, k: ['requests', 0, 'response'], v: [part] }),
      line({ kind: 2, k: ['requests', 0, 'response'], i: 0, v: [{ ...part, isComplete: true }] }),
      line({ kind: 2, k: ['requests', 0, 'response'], i: 0, v: [{ ...part, isComplete: true }] }),
    )
    expect(types(events)).toEqual(['TOOL_STARTED:copilot_findFiles', 'TOOL_COMPLETED'])
  })

  it('needs-input becomes an approval request and resumes afterwards', () => {
    const m = new CopilotChatMapper('c')
    const events = run(
      m,
      line({ kind: 1, k: ['requests', 0, 'modelState'], v: { value: 4 } }),
      line({ kind: 1, k: ['requests', 0, 'modelState'], v: { value: 0 } }),
      line({ kind: 1, k: ['requests', 0, 'modelState'], v: { value: 3 } }),
    )
    expect(types(events)).toEqual(['APPROVAL_REQUIRED', 'TASK_STARTED', 'TASK_FAILED'])
  })

  it('ignores parts the log flushes after the request has ended', () => {
    const m = new CopilotChatMapper('c')
    const events = run(
      m,
      line({ kind: 1, k: ['requests', 0, 'modelState'], v: { value: 1 } }),
      line({
        kind: 2,
        k: ['requests', 0, 'response'],
        v: [tool('copilot_readFile', { isComplete: true })],
      }),
    )
    expect(types(events)).toEqual(['TASK_COMPLETED'])
  })

  it('a request written with its running tool shows that tool and its end', () => {
    const m = new CopilotChatMapper('c')
    const events = run(
      m,
      line({
        kind: 2,
        k: ['requests'],
        v: [{ requestId: 'r1', response: [tool('copilot_findFiles')], modelState: { value: 0 } }],
      }),
      line({ kind: 1, k: ['requests', 0, 'modelState'], v: { value: 1 } }),
    )
    expect(types(events)).toEqual([
      'TASK_STARTED',
      'TOOL_STARTED:copilot_findFiles',
      'TASK_COMPLETED',
    ])
  })

  it('a chat file read from its start shows a running request but not finished history', () => {
    const m = new CopilotChatMapper('c')
    const events = run(
      m,
      line({
        kind: 0,
        v: {
          requests: [
            {
              requestId: 'old',
              response: [tool('copilot_readFile', { isComplete: true })],
              modelState: { value: 1 },
            },
            {
              requestId: 'new',
              response: [tool('copilot_findFiles')],
              modelState: { value: 0 },
            },
          ],
        },
      }),
      line({ kind: 1, k: ['requests', 1, 'response', 0, 'isComplete'], v: true }),
    )
    expect(types(events)).toEqual([
      'TASK_STARTED',
      'TOOL_STARTED:copilot_findFiles',
      'TOOL_COMPLETED',
    ])
  })

  it('tails mid-file: a completion for a tool it never saw still ends the activity', () => {
    const m = new CopilotChatMapper('c')
    expect(
      types(run(m, line({ kind: 1, k: ['requests', 3, 'response', 7, 'isComplete'], v: true }))),
    ).toEqual(['TOOL_COMPLETED'])
  })

  it('survives garbage and unknown shapes', () => {
    const m = new CopilotChatMapper('c')
    expect(
      run(
        m,
        'not json',
        '[]',
        'null',
        line({ kind: 9 }),
        line({ kind: 2, k: 'x', v: 3 }),
        line({ kind: 1, k: ['requests', 'a'], v: {} }),
      ),
    ).toEqual([])
  })

  it('classifies tools and names the chat after its workspace folder only', () => {
    expect(copilotToolKind('copilot_findTextInFiles')).toBe('SEARCH')
    expect(copilotToolKind('run_in_terminal')).toBe('EXEC')
    expect(copilotToolKind('mcp_whatever')).toBe('OTHER')
    expect(copilotAgentName('file:///Users/me/Desktop/my%20app')).toBe('GitHub Copilot · my app')
    expect(copilotAgentName(undefined)).toBe('GitHub Copilot')
  })
})
