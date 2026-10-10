import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { isolatedEnv } from '../isolatedEnv'

// Phase 4 review captures (not pixel baselines): five agents fed through the real webhook
// (two desks, terminal, two waiting spots, +1 badge) and the 連接 panel with its diff preview.

const OUT = resolve(__dirname, 'baseline')

test('multi-agent office + connect panel', async () => {
  test.setTimeout(90_000)
  const env = isolatedEnv()
  const app = await electron.launch({
    args: ['--force-device-scale-factor=2', resolve(__dirname, '../..')],
    env,
  })
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1600, 900),
    )
    await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
    const endpointFile = join(env['CUBICLE_HOME']!, 'endpoint.json')
    await expect.poll(() => existsSync(endpointFile)).toBe(true)
    const { eventUrl } = JSON.parse(readFileSync(endpointFile, 'utf8')) as { eventUrl: string }
    const token = readFileSync(join(env['CUBICLE_HOME']!, 'token'), 'utf8').trim()

    let n = 0
    const send = (agentId: string, agentName: string, type: string, extra: object = {}) =>
      fetch(eventUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          eventId: `v-${++n}`,
          agentId,
          agentName,
          sessionId: `${agentId}-1`,
          type,
          timestamp: Date.now(),
          source: 'webhook',
          ...extra,
        }),
      })

    const crew = [
      [
        'claude-code',
        'Claude Code · shop',
        'TOOL_STARTED',
        { toolKind: 'WRITE', toolName: 'Edit', detail: 'cart.tsx' },
      ],
      [
        'codex',
        'Codex CLI · api',
        'TOOL_STARTED',
        { toolKind: 'EXEC', toolName: 'shell', detail: 'cargo test' },
      ],
      ['aider', 'Aider · docs', 'APPROVAL_REQUIRED', {}],
      ['copilot', 'Copilot', 'TASK_STARTED', {}],
      ['my-agent', 'My Agent', 'TASK_STARTED', {}],
    ] as const
    for (const [id, name] of crew) await send(id, name, 'SESSION_STARTED')
    for (const [id, name, type, extra] of crew) await send(id, name, type, extra)
    await expect(page.getByTestId('overflow-badge')).toBeVisible()
    await page.waitForTimeout(9000) // let everyone walk to their spots
    await page.screenshot({ path: resolve(OUT, 'phase4-multi-agent.png') })

    await page.getByTestId('connect-button').click()
    await page.getByTestId('hooks-toggle').click()
    await expect(page.getByTestId('hook-diff')).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: resolve(OUT, 'phase4-connect-panel.png') })
  } finally {
    await app.close()
  }
})
