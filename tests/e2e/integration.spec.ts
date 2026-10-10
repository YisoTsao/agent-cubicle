import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { join, resolve } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { isolatedEnv } from '../isolatedEnv'

// Phase 4 acceptance (SPEC §10): local server security, webhook + Claude hook command drive the
// characters, hook install/uninstall through the UI with diff preview, transcript fallback,
// multi-agent slots and overflow.

let app: ElectronApplication
let page: Page
let env: Record<string, string>
let port: number
let token: string

const USER_SETTINGS = {
  model: 'opus',
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/my/guard.sh' }] }],
  },
}

type Dev = {
  agents(): { id: string; name: string; state: string; deskId: string }[]
  pose(id: string): { place: string; moving: boolean } | null
}

test.beforeAll(async () => {
  env = isolatedEnv({ CUBICLE_DIAGNOSTICS: '1', CUBICLE_TRANSCRIPTS: 'on' })
  mkdirSync(join(env['CUBICLE_CLAUDE_SETTINGS']!, '..'), { recursive: true })
  writeFileSync(env['CUBICLE_CLAUDE_SETTINGS']!, JSON.stringify(USER_SETTINGS, null, 2) + '\n')
  app = await electron.launch({ args: [resolve(__dirname, '../..')], env })
  page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  const endpointFile = join(env['CUBICLE_HOME']!, 'endpoint.json')
  await expect.poll(() => existsSync(endpointFile)).toBe(true)
  port = (JSON.parse(readFileSync(endpointFile, 'utf8')) as { port: number }).port
  token = readFileSync(join(env['CUBICLE_HOME']!, 'token'), 'utf8').trim()
})

test.afterAll(async () => {
  await app?.close()
})

test.beforeEach(async () => {
  await page.evaluate(() => window.cubicle.dev.reset())
})

/** Raw HTTP so tests control every header (fetch would add Origin-less defaults but fixes Host). */
function http(
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; body: string }> {
  return new Promise((done, fail) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: opts.method ?? 'POST', headers: opts.headers ?? {} },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => done({ status: res.statusCode ?? 0, body }))
      },
    )
    req.on('error', fail)
    req.end(opts.body)
  })
}

const auth = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })
const agents = () =>
  page.evaluate(() => (window as unknown as { __cubicleDev: Dev }).__cubicleDev.agents())

let n = 0
function event(type: string, extra: Record<string, unknown> = {}) {
  n++
  return JSON.stringify({
    eventId: `e2e-${n}`,
    agentId: 'my-agent',
    agentName: 'My Agent',
    sessionId: 'run-1',
    type,
    timestamp: Date.now(),
    source: 'webhook',
    ...extra,
  })
}

test.describe('local server security', () => {
  test('health is public and leaks nothing', async () => {
    const r = await http('/api/health', { method: 'GET' })
    expect(r.status).toBe(200)
    expect(JSON.parse(r.body)).toEqual({ ok: true, name: 'agentcubicle' })
  })

  const cases: [string, Record<string, string>, number][] = [
    ['missing token', { 'content-type': 'application/json' }, 401],
    ['wrong token', { authorization: 'Bearer nope', 'content-type': 'application/json' }, 401],
    ['browser Origin', { origin: 'https://evil.example' }, 403],
    ['DNS-rebinding Host', { host: 'evil.example:80' }, 421],
    ['form content-type', { 'content-type': 'text/plain' }, 415],
  ]
  for (const [name, headers, status] of cases) {
    test(`rejects ${name}`, async () => {
      const base = name.includes('token') ? {} : auth()
      const r = await http('/api/event', {
        headers: { ...base, ...headers },
        body: event('TASK_STARTED'),
      })
      expect(r.status).toBe(status)
    })
  }

  test('rejects invalid JSON, invalid events, oversize bodies, wrong method/path', async () => {
    expect((await http('/api/event', { headers: auth(), body: '{' })).status).toBe(400)
    expect((await http('/api/event', { headers: auth(), body: '{"type":"NOPE"}' })).status).toBe(
      400,
    )
    expect((await http('/api/event', { headers: auth(), body: 'x'.repeat(20_000) })).status).toBe(
      413,
    )
    expect((await http('/api/event', { method: 'GET', headers: auth() })).status).toBe(405)
    expect((await http('/etc/passwd', { headers: auth(), body: '{}' })).status).toBe(404)
    // The app is still alive and healthy afterwards.
    expect((await http('/api/health', { method: 'GET' })).status).toBe(200)
  })
})

test('webhook events drive a character', async () => {
  const send = (type: string, extra = {}) =>
    http('/api/event', { headers: auth(), body: event(type, extra) })
  const first = event('SESSION_STARTED')
  expect((await http('/api/event', { headers: auth(), body: first })).status).toBe(202)
  await send('TOOL_STARTED', {
    toolKind: 'WRITE',
    toolName: 'write_file',
    detail: '/secret/path/app.py',
  })
  await expect
    .poll(agents)
    .toEqual([expect.objectContaining({ name: 'My Agent', state: 'WRITE', deskId: 'desk-a' })])
  await expect(page.getByTestId('name-tag')).toContainText('app.py')
  await expect(page.getByTestId('name-tag')).not.toContainText('secret')
  // The exact same event again → duplicate, not re-applied.
  const dup = await http('/api/event', { headers: auth(), body: first })
  expect(dup.status).toBe(200)
  expect(JSON.parse(dup.body).outcome).toBe('duplicate')
})

test('connect Claude Code through the UI: diff preview, apply, hook command drives the character, disconnect restores', async () => {
  test.setTimeout(60_000)
  const settingsPath = env['CUBICLE_CLAUDE_SETTINGS']!

  await page.getByTestId('connect-button').click()
  await expect(page.getByTestId('integration-panel')).toBeVisible()
  await page.getByTestId('hooks-toggle').click()
  const diff = page.getByTestId('hook-diff')
  await expect(diff).toContainText('agentcubicle-hook')
  await expect(diff).toContainText('PermissionRequest')
  // Nothing written until the user confirms.
  expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual(USER_SETTINGS)
  await page.getByTestId('hook-apply').click()
  await expect(page.getByTestId('integration-panel')).toContainText('已連接')

  const installed = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
    model: string
    hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>
  }
  expect(installed.model).toBe('opus')
  expect(installed.hooks['PreToolUse']![0]).toEqual(USER_SETTINGS.hooks.PreToolUse[0])
  const command = installed.hooks['Stop']![0]!.hooks[0]!.command

  // Run the exact installed command the way Claude Code would: payload on stdin, via sh.
  const fire = (payload: object) =>
    new Promise<{ code: number | null; out: string; ms: number }>((done) => {
      const started = Date.now()
      const child = spawn('sh', ['-c', command])
      let out = ''
      child.stdout.on('data', (d) => (out += d))
      child.on('exit', (code) => done({ code, out, ms: Date.now() - started }))
      child.stdin.end(
        JSON.stringify({
          session_id: 'claude-1',
          cwd: '/Users/me/shop',
          transcript_path: '/t.jsonl',
          ...payload,
        }),
      )
    })
  const state = async () => (await agents()).find((a) => a.name.startsWith('Claude Code'))?.state

  for (const p of [
    { hook_event_name: 'SessionStart', source: 'startup' },
    { hook_event_name: 'UserPromptSubmit', prompt: 'top secret' },
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/Users/me/shop/cart.ts' },
    },
  ]) {
    const r = await fire(p)
    expect(r).toMatchObject({ code: 0, out: '' })
    expect(r.ms).toBeLessThan(1000)
  }
  await expect.poll(state).toBe('WRITE')
  const tag = page.getByTestId('name-tag')
  await expect(tag).toContainText('Claude Code · shop')
  await expect(tag).toContainText('cart.ts')
  await expect(tag).not.toContainText('top secret')

  await fire({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_response: {} })
  await fire({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf dist' },
  })
  await fire({
    hook_event_name: 'PermissionRequest',
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf dist' },
  })
  await expect.poll(state).toBe('WAITING_APPROVAL')
  await fire({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: {} })
  await fire({ hook_event_name: 'Stop', stop_hook_active: false })
  await expect.poll(state).toBe('COMPLETED')

  // Disconnect: same flow, and the user's original settings come back exactly.
  await page.getByTestId('hooks-toggle').click()
  await expect(page.getByTestId('hook-diff')).toContainText('- ')
  await page.getByTestId('hook-apply').click()
  await expect(page.getByTestId('integration-panel')).toContainText('未連接')
  expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual(USER_SETTINGS)
  await page.getByRole('button', { name: '關閉' }).click()
})

test('a stale preview is refused if settings.json changed meanwhile', async () => {
  const settingsPath = env['CUBICLE_CLAUDE_SETTINGS']!
  const plan = await page.evaluate(() => window.cubicle.integration.planHooks('install'))
  writeFileSync(settingsPath, JSON.stringify({ ...USER_SETTINGS, theme: 'dark' }, null, 2))
  await expect(
    page.evaluate((id) => window.cubicle.integration.applyHooks(id), plan.planId),
  ).rejects.toThrow(/changed since the preview/)
  expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
    ...USER_SETTINGS,
    theme: 'dark',
  })
  writeFileSync(settingsPath, JSON.stringify(USER_SETTINGS, null, 2) + '\n')
})

test('transcript fallback: a new Claude session file drives a character', async () => {
  const dir = join(env['CUBICLE_CLAUDE_PROJECTS']!, '-Users-me-blog')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'log-session.jsonl')
  const line = (o: object) =>
    JSON.stringify({
      sessionId: 'log-session',
      cwd: '/Users/me/blog',
      timestamp: new Date().toISOString(),
      uuid: `u${++n}`,
      ...o,
    }) + '\n'
  writeFileSync(file, line({ type: 'user', message: { content: 'write a post' } }))
  appendFileSync(
    file,
    line({
      type: 'assistant',
      message: {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tu1',
            name: 'Read',
            input: { file_path: '/Users/me/blog/draft.md' },
          },
        ],
      },
    }),
  )
  const find = async () => (await agents()).find((a) => a.name === 'Claude Code · blog')?.state
  await expect.poll(find, { timeout: 10_000 }).toBe('READ')
  appendFileSync(
    file,
    line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1' }] } }),
  )
  appendFileSync(
    file,
    line({
      type: 'assistant',
      message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] },
    }),
  )
  await expect.poll(find, { timeout: 10_000 }).toBe('COMPLETED')
})

test('multi-agent: shared spots get separate slots; extra agents wait or show +N', async () => {
  test.setTimeout(60_000)
  const send = (session: string, type: string, extra = {}) =>
    http('/api/event', {
      headers: auth(),
      body: event(type, {
        agentId: `agent-${session}`,
        agentName: `Agent ${session}`,
        sessionId: session,
        ...extra,
      }),
    })
  for (const s of ['a', 'b', 'c', 'd', 'e']) await send(s, 'SESSION_STARTED')
  await expect
    .poll(async () => (await agents()).map((a) => a.deskId).sort())
    .toEqual(['desk-a', 'desk-b', 'wait', 'wait'])
  await expect(page.getByTestId('overflow-badge')).toHaveText('+1 more agent')

  // Both seated agents run commands at once → two different terminal slots.
  await send('a', 'TOOL_STARTED', { toolKind: 'EXEC', toolName: 'sh' })
  await send('b', 'TOOL_STARTED', { toolKind: 'EXEC', toolName: 'sh' })
  const places = async () => {
    const list = await agents()
    const out: string[] = []
    for (const a of list.filter((x) => x.state === 'EXEC')) {
      const p = await page.evaluate(
        (id) => (window as unknown as { __cubicleDev: Dev }).__cubicleDev.pose(id),
        a.id,
      )
      if (p && !p.moving) out.push(p.place)
    }
    return out.sort()
  }
  await expect.poll(places, { timeout: 20_000 }).toEqual(['terminal:0', 'terminal:1'])
})
