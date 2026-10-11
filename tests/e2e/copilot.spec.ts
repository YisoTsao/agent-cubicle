import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { isolatedEnv } from '../isolatedEnv'

// VS Code Copilot Chat: a chat session file appearing under workspaceStorage/<hash>/chatSessions
// shows up as an agent, follows its tools, and finishes with its request.

type Agent = { name: string; state: string; deskId: string }
const agents = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __cubicleDev?: { agents(): Agent[] } }).__cubicleDev?.agents() ?? [],
  )

const line = (o: unknown) => JSON.stringify(o) + '\n'

test('a Copilot chat file becomes an agent that follows the chat', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cubicle-copilot-'))
  const workspace = join(root, 'abc123')
  const chats = join(workspace, 'chatSessions')
  mkdirSync(chats, { recursive: true })
  writeFileSync(
    join(workspace, 'workspace.json'),
    JSON.stringify({ folder: 'file:///Users/me/demo-proj' }),
  )

  const app = await electron.launch({
    args: [resolve(__dirname, '../..')],
    env: isolatedEnv({ CUBICLE_DIAGNOSTICS: '1', CUBICLE_COPILOT_ROOT: root }),
  })
  const page = await app.firstWindow()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true')
  expect(await agents(page)).toHaveLength(0)

  // Copilot starts a chat: snapshot, a request, then a tool that edits a file.
  const file = join(chats, 'session-1.jsonl')
  writeFileSync(file, line({ kind: 0, v: { requests: [], sessionId: 'session-1' } }))
  appendFileSync(
    file,
    line({
      kind: 2,
      k: ['requests'],
      v: [{ requestId: 'r1', message: { text: 'PRIVATE PROMPT' } }],
    }),
  )
  appendFileSync(
    file,
    line({
      kind: 2,
      k: ['requests', 0, 'response'],
      v: [
        {
          kind: 'toolInvocationSerialized',
          toolId: 'copilot_replaceString',
          isComplete: false,
          invocationMessage: { value: 'Editing [](file:///Users/me/demo-proj/src/store.ts)' },
        },
      ],
    }),
  )
  await expect
    .poll(async () => (await agents(page))[0], { timeout: 15_000 })
    .toMatchObject({ name: 'GitHub Copilot · demo-proj', state: 'WRITE' })
  expect(JSON.stringify(await agents(page))).not.toContain('PRIVATE')

  // The request finishes.
  appendFileSync(file, line({ kind: 1, k: ['requests', 0, 'response', 0, 'isComplete'], v: true }))
  appendFileSync(file, line({ kind: 1, k: ['requests', 0, 'modelState'], v: { value: 1 } }))
  await expect
    .poll(async () => (await agents(page))[0]?.state, { timeout: 15_000 })
    .toBe('COMPLETED')
  await app.close()
})
