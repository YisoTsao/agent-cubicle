import { appendFileSync, mkdirSync, mkdtempSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 15_000 })
import { TranscriptWatcher } from './transcriptWatcher'

// Generous: under load fs events can be late; the 2 s poll is the backstop.
const waitFor = async (cond: () => boolean, ms = 7000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 20))
  }
}

let watcher: TranscriptWatcher | null = null
afterEach(async () => {
  await watcher?.stop()
  watcher = null
})

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'cubicle-transcripts-'))
  const project = join(root, '-Users-me-app')
  mkdirSync(project)
  const lines: string[] = []
  const recent: string[] = []
  return { root, project, lines, recent }
}

describe('TranscriptWatcher', () => {
  it('does not replay history, announces recent sessions, then tails appends', async () => {
    const t = setup()
    const file = join(t.project, 'sess-1.jsonl')
    writeFileSync(file, '{"old":1}\n{"old":2}\n')
    watcher = new TranscriptWatcher({
      root: t.root,
      onLine: (l) => t.lines.push(l),
      onRecentSession: (id, last) => t.recent.push(`${id}|${last}`),
    })
    await watcher.start()
    expect(t.lines).toEqual([])
    expect(t.recent).toEqual(['sess-1|{"old":2}'])

    appendFileSync(file, '{"new":1}\n')
    await waitFor(() => t.lines.length === 1)
    expect(t.lines).toEqual(['{"new":1}'])
  })

  it('reads new files from the start and buffers partial lines', async () => {
    const t = setup()
    watcher = new TranscriptWatcher({ root: t.root, onLine: (l) => t.lines.push(l) })
    await watcher.start()
    const file = join(t.project, 'sess-2.jsonl')
    writeFileSync(file, '{"a":1}\n{"b":')
    await waitFor(() => t.lines.length === 1)
    appendFileSync(file, '2}\n')
    await waitFor(() => t.lines.length === 2)
    expect(t.lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('restarts from the beginning after truncation', async () => {
    const t = setup()
    const file = join(t.project, 'sess-3.jsonl')
    watcher = new TranscriptWatcher({ root: t.root, onLine: (l) => t.lines.push(l) })
    await watcher.start()
    writeFileSync(file, '{"x":1}\n{"x":2}\n')
    await waitFor(() => t.lines.length === 2)
    truncateSync(file, 0)
    appendFileSync(file, '{"y":1}\n')
    await waitFor(() => t.lines.includes('{"y":1}'))
  })

  it('ignores non-jsonl files and subagent transcripts', async () => {
    const t = setup()
    watcher = new TranscriptWatcher({ root: t.root, onLine: (l) => t.lines.push(l) })
    await watcher.start()
    writeFileSync(join(t.project, 'notes.txt'), 'hello\n')
    mkdirSync(join(t.project, 'sess-4', 'subagents'), { recursive: true })
    writeFileSync(join(t.project, 'sess-4', 'subagents', 'agent-x.jsonl'), '{"sub":1}\n')
    writeFileSync(join(t.project, 'sess-5.jsonl'), '{"main":1}\n')
    await waitFor(() => t.lines.length >= 1)
    await new Promise((r) => setTimeout(r, 200))
    expect(t.lines).toEqual(['{"main":1}'])
  })

  it('watches nested files that match a filter (VS Code chatSessions)', async () => {
    const t = setup()
    const chats = join(t.root, 'abc123', 'chatSessions')
    mkdirSync(chats, { recursive: true })
    const other = join(t.root, 'abc123', 'GitHub.copilot-chat')
    mkdirSync(other)
    watcher = new TranscriptWatcher({
      root: t.root,
      depth: 2,
      accept: (p) => /chatSessions[\\/][^\\/]+\.jsonl$/.test(p),
      onLine: (l, f) => t.lines.push(`${f.endsWith('c1.jsonl') ? 'c1' : 'other'}:${l}`),
    })
    await watcher.start()
    writeFileSync(join(chats, 'c1.jsonl'), '{"kind":0}\n')
    writeFileSync(join(other, 'x.jsonl'), '{"no":1}\n')
    await waitFor(() => t.lines.length === 1)
    await new Promise((r) => setTimeout(r, 300))
    expect(t.lines).toEqual(['c1:{"kind":0}'])
  })
})
