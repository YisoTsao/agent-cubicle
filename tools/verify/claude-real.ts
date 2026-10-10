// Real Claude Code end-to-end check (SPEC §10 Phase 4 acceptance).
//
//   pnpm build && pnpm verify:claude
//
// Launches an isolated AgentCubicle, installs the hooks into a TEMPORARY settings file through
// the app's own installer, then runs a tiny read-only `claude -p` task with `--settings <temp>`.
// Your real ~/.claude/settings.json is never touched. Uses a small amount of Claude usage.
import { _electron as electron } from '@playwright/test'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isolatedEnv } from '../../tests/isolatedEnv'

const ROOT = resolve(__dirname, '../..')
const PROMPT =
  'Use the Read tool to read package.json, then reply with only the value of its "name" field.'

async function main() {
  const env = isolatedEnv({ CUBICLE_DIAGNOSTICS: '1' })
  const settingsPath = env['CUBICLE_CLAUDE_SETTINGS']!
  mkdirSync(join(settingsPath, '..'), { recursive: true })

  const app = await electron.launch({ args: [ROOT], env })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as unknown as { __cubicleDev?: unknown }).__cubicleDev)
  while (!existsSync(join(env['CUBICLE_HOME']!, 'endpoint.json')))
    await new Promise((r) => setTimeout(r, 100))

  // Install through the same two-step flow the UI uses.
  const plan = await page.evaluate(() => window.cubicle.integration.planHooks('install'))
  await page.evaluate((id) => window.cubicle.integration.applyHooks(id), plan.planId)
  console.log(`hooks installed into temporary settings: ${settingsPath}`)

  // Record every distinct state the Claude character goes through.
  const seen: string[] = []
  let detail = ''
  const poll = setInterval(() => {
    void page
      .evaluate(() =>
        (
          window as unknown as { __cubicleDev: { agents(): { name: string; state: string }[] } }
        ).__cubicleDev.agents(),
      )
      .then(async (agents) => {
        const claude = agents.find((a) => a.name.startsWith('Claude Code'))
        if (claude && seen.at(-1) !== claude.state) {
          seen.push(claude.state)
          console.log(`  character → ${claude.state}`)
        }
        const snap = await page.evaluate(() => window.cubicle.getSnapshot())
        detail = snap.sessions.find((s) => s.agentId === 'claude-code')?.detail ?? detail
      })
      .catch(() => undefined)
  }, 100)

  const started = Date.now()
  const output = await new Promise<{ code: number | null; out: string }>((done) => {
    const child = spawn(
      'claude',
      ['--settings', settingsPath, '-p', PROMPT, '--allowedTools', 'Read'],
      {
        cwd: ROOT,
        env: process.env,
      },
    )
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('exit', (code) => done({ code, out }))
  })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  await new Promise((r) => setTimeout(r, 1500)) // let the final hook land
  clearInterval(poll)
  const status = await page.evaluate(() => window.cubicle.integration.status())
  await app.close()

  console.log(
    `\nclaude exited ${output.code} after ${seconds}s, answered: ${output.out.trim().split('\n').at(-1)}`,
  )
  console.log(`hook events received: ${status.hooks.count}`)
  console.log(`states: ${seen.join(' → ')}`)
  console.log(`last detail on name tag: ${detail || '(none)'}`)

  const ok =
    output.code === 0 &&
    status.hooks.count > 0 &&
    seen.includes('READ') &&
    (seen.includes('COMPLETED') || seen.at(-1) === 'IDLE') &&
    seen.indexOf('READ') < Math.max(seen.indexOf('COMPLETED'), seen.lastIndexOf('IDLE'))
  console.log(ok ? '\nPASS' : '\nFAIL')
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
