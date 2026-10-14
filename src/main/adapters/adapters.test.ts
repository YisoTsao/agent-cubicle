import { describe, expect, it } from 'vitest'
import { AgentEvent } from '@shared/events'
import { mapClaudeHook } from './claudeHooks'
import { mapTranscriptLine, projectCwdIn, sessionExitedIn } from './claudeTranscript'
import { claudeAgentName, toolDetail, toolKind } from './claudeTools'

const common = { session_id: 'abc', cwd: '/Users/me/projects/shop', transcript_path: '/x.jsonl' }
const map = (payload: object, seq = 1) => mapClaudeHook({ ...common, ...payload }, 1000, seq)

function eventOf(r: ReturnType<typeof mapClaudeHook>) {
  if (!('event' in r)) throw new Error(`ignored: ${r.ignored}`)
  expect(AgentEvent.safeParse(r.event).success).toBe(true)
  return r.event
}

describe('Claude hook adapter', () => {
  it.each([
    ['SessionStart', {}, 'SESSION_STARTED'],
    ['UserPromptSubmit', { prompt: 'secret plans' }, 'TASK_STARTED'],
    ['PreToolUse', { tool_name: 'Read', tool_input: { file_path: '/a/b.ts' } }, 'TOOL_STARTED'],
    ['PostToolUse', { tool_name: 'Read', tool_response: {} }, 'TOOL_COMPLETED'],
    ['PostToolUseFailure', { tool_name: 'Bash', error: 'Exit code 1' }, 'TOOL_COMPLETED'],
    [
      'PermissionRequest',
      { tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } },
      'APPROVAL_REQUIRED',
    ],
    ['Notification', { notification_type: 'permission_prompt', message: 'x' }, 'APPROVAL_REQUIRED'],
    ['Stop', { stop_hook_active: false }, 'TASK_COMPLETED'],
    ['StopFailure', { error: 'rate_limit' }, 'TASK_FAILED'],
    ['SessionEnd', { reason: 'other' }, 'SESSION_ENDED'],
  ] as const)('%s → %s', (hook, extra, type) => {
    const e = eventOf(map({ hook_event_name: hook, ...extra }))
    expect(e.type).toBe(type)
    expect(e.agentId).toBe('claude-code')
    expect(e.sessionId).toBe('abc')
    expect(e.agentName).toBe('Claude Code · shop')
  })

  it('never forwards the prompt text', () => {
    const e = eventOf(map({ hook_event_name: 'UserPromptSubmit', prompt: 'my secret prompt' }))
    expect(JSON.stringify(e)).not.toContain('secret')
  })

  it('marks failed tools as unsuccessful, successful ones as successful', () => {
    expect(eventOf(map({ hook_event_name: 'PostToolUse', tool_name: 'Edit' })).success).toBe(true)
    expect(eventOf(map({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash' })).success).toBe(
      false,
    )
  })

  it('carries tool kind and a short detail on tool events', () => {
    const e = eventOf(
      map({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'pnpm test\necho hi' },
      }),
    )
    expect(e).toMatchObject({ toolName: 'Bash', toolKind: 'EXEC' })
    expect(e).not.toHaveProperty('detail') // commands never reach the name tag
  })

  it('ignores non-permission notifications and unknown hooks', () => {
    expect(
      map({ hook_event_name: 'Notification', notification_type: 'idle_prompt' }),
    ).toHaveProperty('ignored')
    expect(map({ hook_event_name: 'CwdChanged' })).toHaveProperty('ignored')
  })

  it('ignores garbage without throwing', () => {
    for (const bad of [null, 1, 'x', [], {}, { hook_event_name: 'Stop' }]) {
      expect(mapClaudeHook(bad, 0, 1)).toHaveProperty('ignored')
    }
  })

  it('passes the caller-provided sequence through', () => {
    expect(eventOf(map({ hook_event_name: 'Stop' }, 42)).sequence).toBe(42)
  })
})

describe('Claude tool helpers', () => {
  it.each([
    ['Read', 'READ'],
    ['Grep', 'SEARCH'],
    ['WebFetch', 'SEARCH'],
    ['Edit', 'WRITE'],
    ['Write', 'WRITE'],
    ['Bash', 'EXEC'],
    ['Task', 'OTHER'],
    ['mcp__github__create_issue', 'OTHER'],
  ])('%s is %s', (name, kind) => {
    expect(toolKind(name)).toBe(kind)
  })

  it('picks the most useful detail field and never file contents', () => {
    expect(toolDetail('Write', { file_path: '/p/a.ts', content: 'SECRET' })).toBe('/p/a.ts')
    // Only file / folder names are shown; commands, patterns, URLs and descriptions never are.
    expect(toolDetail('Bash', { command: 'rm -rf dist', description: 'clean' })).toBeUndefined()
    expect(toolDetail('Grep', { pattern: 'useAgents' })).toBeUndefined()
    expect(toolDetail('Grep', { pattern: 'x', path: '/p/src' })).toBe('/p/src')
    expect(toolDetail('WebFetch', { url: 'https://x.dev', prompt: 'p' })).toBeUndefined()
    expect(toolDetail('Task', { description: 'Find bugs', prompt: 'long' })).toBeUndefined()
    expect(toolDetail('Read', null)).toBeUndefined()
  })

  it('names agents by project', () => {
    expect(claudeAgentName('/Users/me/work/api/')).toBe('Claude Code · api')
    expect(claudeAgentName(undefined)).toBe('Claude Code')
  })
})

describe('Claude transcript adapter', () => {
  it('finds the newest cwd in a text span, skipping lines without one or cut at the edge', () => {
    const text = [
      'cut-line-at-the-start-of-the-span',
      JSON.stringify({ type: 'user', cwd: '/Users/me/work/api', sessionId: 's' }),
      JSON.stringify({ type: 'summary', summary: 'x' }),
      JSON.stringify({ type: 'file-history-snapshot' }),
      '{"type":"assis',
    ].join('\n')
    expect(projectCwdIn(text)).toBe('/Users/me/work/api')
    expect(projectCwdIn('{"type":"summary"}')).toBeUndefined()
    expect(projectCwdIn(null)).toBeUndefined()
  })

  it('recognises a transcript whose last complete line is the exit record', () => {
    expect(sessionExitedIn('{"type":"user"}\n{"type":"cost-state"}\n')).toBe(true)
    expect(sessionExitedIn('{"type":"cost-state"}\n{"type":"user"}')).toBe(false)
    expect(sessionExitedIn('{"type":"user"}\n{"type":"cost-st')).toBe(false)
    expect(sessionExitedIn(null)).toBe(false)
  })

  const line = (o: object) =>
    JSON.stringify({
      sessionId: 's',
      cwd: '/w/app',
      timestamp: '2026-10-10T10:00:00.000Z',
      uuid: 'u1',
      ...o,
    })

  it('ends the session when Claude Code writes its exit record', () => {
    const [e] = mapTranscriptLine(JSON.stringify({ type: 'cost-state', sessionId: 's9' }), 5)
    expect(e).toMatchObject({ type: 'SESSION_ENDED', sessionId: 's9', agentId: 'claude-code' })
  })

  it('leaves the agent name out of lines without a cwd, so the session keeps its project name', () => {
    const [e] = mapTranscriptLine(
      JSON.stringify({ type: 'user', sessionId: 's', uuid: 'u2', message: { content: 'hi' } }),
      0,
    )
    expect(e?.type).toBe('TASK_STARTED')
    expect(e).not.toHaveProperty('agentName')
  })

  it('maps prompts, tool calls, results and end of turn', () => {
    expect(
      mapTranscriptLine(line({ type: 'user', message: { content: 'do it' } }), 0)[0]?.type,
    ).toBe('TASK_STARTED')
    const start = mapTranscriptLine(
      line({
        type: 'assistant',
        message: {
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/w/app/x.ts' } },
          ],
        },
      }),
      0,
    )
    expect(start).toMatchObject([
      { type: 'TOOL_STARTED', toolKind: 'WRITE', detail: '/w/app/x.ts', eventId: 'log:t1:start' },
    ])
    const done = mapTranscriptLine(
      line({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }] },
      }),
      0,
    )
    expect(done).toMatchObject([{ type: 'TOOL_COMPLETED', success: false }])
    const end = mapTranscriptLine(
      line({
        type: 'assistant',
        message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] },
      }),
      0,
    )
    expect(end).toMatchObject([{ type: 'TASK_COMPLETED' }])
    for (const e of [...start, ...done, ...end]) {
      expect(AgentEvent.safeParse(e).success).toBe(true)
      expect(e.timestamp).toBe(Date.parse('2026-10-10T10:00:00.000Z'))
    }
  })

  it('ignores meta prompts, sidechain completions and other line types', () => {
    expect(
      mapTranscriptLine(line({ type: 'user', isMeta: true, message: { content: 'x' } }), 0),
    ).toEqual([])
    expect(
      mapTranscriptLine(
        line({
          type: 'assistant',
          isSidechain: true,
          message: { stop_reason: 'end_turn', content: [] },
        }),
        0,
      ),
    ).toEqual([])
    for (const t of ['mode', 'ai-title', 'attachment', 'file-history-snapshot', 'system']) {
      expect(mapTranscriptLine(line({ type: t }), 0)).toEqual([])
    }
  })

  it('never throws on malformed input', () => {
    for (const bad of [
      '',
      '{',
      'null',
      '[]',
      '{"type":"assistant"}',
      '{"type":"user","sessionId":"s","message":{"content":[null,1]}}',
    ]) {
      expect(() => mapTranscriptLine(bad, 0)).not.toThrow()
    }
  })
})
