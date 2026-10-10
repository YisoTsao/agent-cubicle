import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLAUDE_HOOK_EVENTS } from './adapters/claudeHooks'
import {
  MARKER,
  SettingsShapeError,
  hasOurHooks,
  hookCommand,
  lineDiff,
  withOurHooks,
  withoutOurHooks,
} from './hookConfig'

const CMD = hookCommand('/home/me/.agentcubicle', 'http://127.0.0.1:9876/hooks/claude-code')

const userSettings = {
  model: 'opus',
  permissions: { allow: ['Bash(pnpm test)'] },
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/my/guard.sh' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
  },
}

describe('hook settings editing', () => {
  it('adds one observer hook per subscribed event and keeps everything else', () => {
    const next = withOurHooks(userSettings, CMD) as typeof userSettings & {
      hooks: Record<string, unknown[]>
    }
    expect(next.model).toBe('opus')
    expect(next.permissions).toEqual(userSettings.permissions)
    for (const { event } of CLAUDE_HOOK_EVENTS)
      expect(JSON.stringify(next.hooks[event])).toContain(MARKER)
    expect(next.hooks['PreToolUse']![0]).toEqual(userSettings.hooks.PreToolUse[0])
    expect(next.hooks['Stop']![0]).toEqual(userSettings.hooks.Stop[0])
    expect(hasOurHooks(next)).toBe(true)
  })

  it('is idempotent', () => {
    const once = withOurHooks(userSettings, CMD)
    expect(withOurHooks(once, CMD)).toEqual(once)
  })

  it('uninstall restores the original exactly', () => {
    expect(withoutOurHooks(withOurHooks(userSettings, CMD))).toEqual(userSettings)
    expect(withoutOurHooks(withOurHooks({}, CMD))).toEqual({})
  })

  it('refuses a malformed hooks section instead of overwriting it', () => {
    expect(() => withOurHooks({ hooks: 'oops' }, CMD)).toThrow(SettingsShapeError)
  })

  it('never blocks: the command always ends with exit 0 and discards output', () => {
    expect(CMD).toMatch(/>\/dev\/null 2>&1; exit 0 # agentcubicle-hook$/)
    expect(CMD).toContain('--connect-timeout 0.3 -m 0.5')
  })

  it('quotes paths safely', () => {
    const cmd = hookCommand("/Users/o'brien/my home/.agentcubicle", 'http://127.0.0.1:1/h')
    expect(cmd).toContain(`'/Users/o'\\''brien/my home/.agentcubicle/token'`)
  })

  it('renders a readable diff', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toBe('  a\n+ x\n- b\n  c')
  })
})

describe('hook command (real shell + curl)', () => {
  it('delivers stdin JSON with the token, and exits 0 silently when the app is down', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cubicle-hookcmd-'))
    writeFileSync(join(home, 'token'), 'T0K3N\n')
    const received: { auth: string | undefined; body: string }[] = []
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        received.push({ auth: req.headers.authorization, body })
        res.writeHead(204).end()
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    writeFileSync(join(home, 'hook-url'), `http://127.0.0.1:${port}/hooks/claude-code\n`)
    const cmd = hookCommand(home, 'http://127.0.0.1:1/unused')

    const out = await new Promise<string>((resolve) => {
      const child = spawn('sh', ['-c', cmd])
      let stdout = ''
      child.stdout.on('data', (d) => (stdout += d))
      child.on('exit', (code) => resolve(`${code}|${stdout}`))
      child.stdin.end('{"hook_event_name":"Stop","session_id":"s"}')
    })
    expect(out).toBe('0|')
    expect(received).toEqual([
      { auth: 'Bearer T0K3N', body: '{"hook_event_name":"Stop","session_id":"s"}' },
    ])
    server.close()

    // App closed: still exit 0, no output, fast.
    const started = Date.now()
    const result = execFileSync('sh', ['-c', cmd], { input: '{}', encoding: 'utf8' })
    expect(result).toBe('')
    expect(Date.now() - started).toBeLessThan(1500)
  })
})
