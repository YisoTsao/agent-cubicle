import { watch, type FSWatcher } from 'chokidar'
import { open, readdir, stat } from 'node:fs/promises'
import { basename, join, sep } from 'node:path'

// Tails Claude Code transcripts (~/.claude/projects/<project>/<session>.jsonl) — SPEC §5.2.
//  - Files present at startup are tailed from their END (history is never replayed); the last
//    line of recently modified ones is read once to announce the session.
//  - New files are read from the start.
//  - Handles partial lines, truncation (offset reset) and deletion. Read errors are logged and
//    skipped; nothing here can crash the main process.
//  - A light size poll backs up file-system events, which can be delayed or dropped under load
//    or across sleep.

export interface TranscriptWatcherOptions {
  root: string
  /** How many directory levels below `root` hold transcripts (Claude: 1; VS Code chats: 2). */
  depth?: number
  /** Which files to tail (default: every `.jsonl`). */
  accept?(path: string): boolean
  onLine(line: string, file: string): void
  /** A transcript modified within `recentMs` before startup (an already running session). */
  /** `tail` = the last 64 KB, `head` = the first 64 KB (either may be null for an empty file). */
  onRecentSession?(sessionId: string, tail: string | null, head: string | null): void
  /** Same moment, but gets the file path (for adapters that need more than the session id). */
  onRecentFile?(file: string): void
  recentMs?: number
}

interface FileState {
  offset: number
  partial: string
  queue: Promise<void>
}

const MAX_READ = 4 * 1024 * 1024
const POLL_MS = 2000

export class TranscriptWatcher {
  private watcher: FSWatcher | null = null
  private readonly files = new Map<string, FileState>()
  private ready = false
  private poll: ReturnType<typeof setInterval> | null = null
  /** Startup scans of pre-existing files; start() resolves once they are done. */
  private readonly initial: Promise<void>[] = []
  readonly stats = { files: 0, lines: 0, errors: 0 }

  constructor(private readonly opts: TranscriptWatcherOptions) {}

  private get depth(): number {
    return this.opts.depth ?? 1
  }

  private accepts(path: string): boolean {
    return this.opts.accept ? this.opts.accept(path) : path.endsWith('.jsonl')
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      const w = watch(this.opts.root, {
        depth: this.depth, // Claude: root/<project>/<session>.jsonl — skips subagents/
        ignoreInitial: false,
        ignored: (path, stats) => !!stats?.isFile() && !this.accepts(path),
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
        this.poll = setInterval(() => void this.pollSizes(), POLL_MS)
        void Promise.allSettled(this.initial).then(() => resolve())
      })
      this.watcher = w
    })
  }

  async stop(): Promise<void> {
    if (this.poll) clearInterval(this.poll)
    this.poll = null
    await this.watcher?.close()
    this.watcher = null
    this.files.clear()
  }

  private async onAdd(path: string): Promise<void> {
    if (!this.accepts(path) || this.files.has(path)) return
    if (!this.ready) {
      // Existing file at startup: start at the end.
      try {
        const s = await stat(path)
        this.files.set(path, { offset: s.size, partial: '', queue: Promise.resolve() })
        this.stats.files = this.files.size
        const recentMs = this.opts.recentMs ?? 2 * 60_000
        if (Date.now() - s.mtimeMs < recentMs) {
          this.opts.onRecentFile?.(path)
          if (this.opts.onRecentSession)
            this.opts.onRecentSession(
              basename(path, '.jsonl'),
              await readSpan(path, Math.max(0, s.size - SPAN), Math.min(s.size, SPAN)),
              await readSpan(path, 0, Math.min(s.size, SPAN)),
            )
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

  /** Safety net: pick up new files and missed appends even if no fs event arrived. */
  private async pollSizes(): Promise<void> {
    try {
      for (const path of await this.listFiles(this.opts.root, this.depth)) {
        if (this.accepts(path) && !this.files.has(path)) void this.onAdd(path)
      }
    } catch {
      // root missing (the tool is not installed yet): nothing to do
    }
    for (const [path, f] of this.files) {
      try {
        const { size } = await stat(path)
        if (size !== f.offset) this.enqueue(path)
      } catch {
        // deleted between polls: chokidar's unlink will clean up
      }
    }
  }

  /** Files `levels` directory levels below `dir` (levels = 0: files directly inside). */
  private async listFiles(dir: string, levels: number): Promise<string[]> {
    const out: string[] = []
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (levels > 0) out.push(...(await this.listFiles(path, levels - 1)))
      } else if (levels === 0) out.push(path)
    }
    return out
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

const SPAN = 64 * 1024

/** `len` bytes of a file from `start`, as text (a cut first or last line must be tolerated). */
async function readSpan(path: string, start: number, len: number): Promise<string | null> {
  if (len <= 0) return null
  const handle = await open(path, 'r')
  try {
    const buf = Buffer.alloc(len)
    await handle.read(buf, 0, len, start)
    return buf.toString('utf8')
  } finally {
    await handle.close()
  }
}

/** Project directory name of a transcript path (for diagnostics). */
export function projectOf(file: string): string {
  return file.split(sep).at(-2) ?? ''
}
