import { watch, type FSWatcher } from 'chokidar'
import { open, stat } from 'node:fs/promises'
import { basename, sep } from 'node:path'

// Tails Claude Code transcripts (~/.claude/projects/<project>/<session>.jsonl) — SPEC §5.2.
//  - Files present at startup are tailed from their END (history is never replayed); the last
//    line of recently modified ones is read once to announce the session.
//  - New files are read from the start.
//  - Handles partial lines, truncation (offset reset) and deletion. Read errors are logged and
//    skipped; nothing here can crash the main process.

export interface TranscriptWatcherOptions {
  root: string
  onLine(line: string, file: string): void
  /** A transcript modified within `recentMs` before startup (an already running session). */
  onRecentSession?(sessionId: string, lastLine: string | null): void
  recentMs?: number
}

interface FileState {
  offset: number
  partial: string
  queue: Promise<void>
}

const MAX_READ = 4 * 1024 * 1024

export class TranscriptWatcher {
  private watcher: FSWatcher | null = null
  private readonly files = new Map<string, FileState>()
  private ready = false
  /** Startup scans of pre-existing files; start() resolves once they are done. */
  private readonly initial: Promise<void>[] = []
  readonly stats = { files: 0, lines: 0, errors: 0 }

  constructor(private readonly opts: TranscriptWatcherOptions) {}

  start(): Promise<void> {
    return new Promise((resolve) => {
      const w = watch(this.opts.root, {
        depth: 1, // root/<project>/<session>.jsonl — skip subagents/ transcripts
        ignoreInitial: false,
        ignored: (path, stats) => !!stats?.isFile() && !path.endsWith('.jsonl'),
      })
      w.on('add', (path) => {
        const p = this.onAdd(path)
        if (!this.ready) this.initial.push(p)
      })
      w.on('change', (path) => this.enqueue(path))
      w.on('unlink', (path) => {
        this.files.delete(path)
        this.stats.files = this.files.size
      })
      w.on('error', (err) => {
        this.stats.errors++
        console.warn('[transcripts] watcher error', err)
      })
      w.on('ready', () => {
        this.ready = true
        void Promise.allSettled(this.initial).then(() => resolve())
      })
      this.watcher = w
    })
  }

  async stop(): Promise<void> {
    await this.watcher?.close()
    this.watcher = null
    this.files.clear()
  }

  private async onAdd(path: string): Promise<void> {
    if (!path.endsWith('.jsonl') || this.files.has(path)) return
    if (!this.ready) {
      // Existing file at startup: start at the end.
      try {
        const s = await stat(path)
        this.files.set(path, { offset: s.size, partial: '', queue: Promise.resolve() })
        this.stats.files = this.files.size
        const recentMs = this.opts.recentMs ?? 2 * 60_000
        if (this.opts.onRecentSession && Date.now() - s.mtimeMs < recentMs) {
          this.opts.onRecentSession(basename(path, '.jsonl'), await lastLine(path, s.size))
        }
      } catch (err) {
        this.stats.errors++
        console.warn('[transcripts] stat failed', path, err)
      }
      return
    }
    this.files.set(path, { offset: 0, partial: '', queue: Promise.resolve() })
    this.stats.files = this.files.size
    this.enqueue(path)
  }

  /** Serialize reads per file so appends are processed in order. */
  private enqueue(path: string): void {
    const f = this.files.get(path)
    if (!f) return void this.onAdd(path)
    f.queue = f.queue
      .then(() => this.readNew(path, f))
      .catch((err) => {
        this.stats.errors++
        console.warn('[transcripts] read failed', path, err)
      })
  }

  private async readNew(path: string, f: FileState): Promise<void> {
    const handle = await open(path, 'r')
    try {
      const { size } = await handle.stat()
      if (size < f.offset) {
        // Truncated or replaced: start over from the beginning.
        f.offset = 0
        f.partial = ''
      }
      while (f.offset < size) {
        const len = Math.min(size - f.offset, MAX_READ)
        const buf = Buffer.alloc(len)
        const { bytesRead } = await handle.read(buf, 0, len, f.offset)
        if (bytesRead === 0) break
        f.offset += bytesRead
        const text = f.partial + buf.subarray(0, bytesRead).toString('utf8')
        const lines = text.split('\n')
        f.partial = lines.pop() ?? '' // incomplete last line waits for the next append
        for (const line of lines) {
          if (!line.trim()) continue
          this.stats.lines++
          this.opts.onLine(line, path)
        }
      }
    } finally {
      await handle.close()
    }
  }
}

async function lastLine(path: string, size: number): Promise<string | null> {
  const len = Math.min(size, 64 * 1024)
  if (len === 0) return null
  const handle = await open(path, 'r')
  try {
    const buf = Buffer.alloc(len)
    await handle.read(buf, 0, len, size - len)
    const lines = buf
      .toString('utf8')
      .split('\n')
      .filter((l) => l.trim())
    return lines.at(-1) ?? null
  } finally {
    await handle.close()
  }
}

/** Project directory name of a transcript path (for diagnostics). */
export function projectOf(file: string): string {
  return file.split(sep).at(-2) ?? ''
}
