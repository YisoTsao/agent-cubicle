import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IntegrationStatus } from '@shared/ipc'
import { CopilotAgentSessionTracker } from './adapters/copilotAgentSessions'
import { TranscriptWatcher } from './adapters/transcriptWatcher'
import { DEFAULT_PORT, loadOrCreateToken, publishEndpoint, type EndpointInfo } from './endpoint'
import { HookInstaller } from './hookInstaller'
import type { HubService } from './hubService'
import { IngestRouter } from './ingest'
import { LocalServer } from './server'

// Wires the real event sources into the hub (SPEC §5): local server (webhook + Claude hooks),
// Claude transcript watcher, and the hook installer. Each source fails independently.

export function claudeProjectsRoot(): string {
  return process.env['CUBICLE_CLAUDE_PROJECTS'] || join(homedir(), '.claude', 'projects')
}

/** Where VS Code (stable / Insiders) keeps per-workspace chat sessions, if it is installed. */
export function copilotRoots(): string[] {
  const override = process.env['CUBICLE_COPILOT_ROOT']
  if (override) return [override]
  const home = homedir()
  const base =
    process.platform === 'darwin'
      ? join(home, 'Library', 'Application Support')
      : process.platform === 'win32'
        ? (process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'))
        : (process.env['XDG_CONFIG_HOME'] ?? join(home, '.config'))
  return ['Code', 'Code - Insiders']
    .map((flavour) => join(base, flavour, 'User', 'workspaceStorage'))
    .filter((dir) => existsSync(dir))
}

/**
 * Where newer VS Code builds keep agent-host Copilot sessions (one session.db per session). They sit
 * next to the workspaceStorage folder: .../Code/User/workspaceStorage → .../Code/agentSessionData.
 */
export function copilotAgentSessionRoots(): string[] {
  return copilotRoots()
    .map((root) => join(root, '..', '..', 'agentSessionData'))
    .filter((dir) => existsSync(dir))
}

/** How often agent session databases are checked for changes. */
const AGENT_SESSION_POLL_MS = 2000

function configuredPort(): number {
  const raw = process.env['CUBICLE_PORT']
  const n = raw === undefined ? DEFAULT_PORT : Number(raw)
  return Number.isInteger(n) && n >= 0 && n < 65536 ? n : DEFAULT_PORT
}

export class Integrations {
  readonly router: IngestRouter
  readonly installer = new HookInstaller()
  private server: LocalServer | null = null
  private endpoint: EndpointInfo | null = null
  private watcher: TranscriptWatcher | null = null
  private copilotWatchers: TranscriptWatcher[] = []
  private readonly agentSessions = new CopilotAgentSessionTracker()
  private agentSessionTimer: ReturnType<typeof setInterval> | null = null
  private readonly transcriptsEnabled = process.env['CUBICLE_TRANSCRIPTS'] !== 'off'
  /** Copilot chats follow the transcripts switch, unless a root is given explicitly (tests). */
  private readonly copilotEnabled = !!process.env['CUBICLE_COPILOT_ROOT'] || this.transcriptsEnabled

  constructor(hub: HubService) {
    this.router = new IngestRouter(hub.hub)
  }

  async start(): Promise<void> {
    await Promise.all([this.startServer(), this.startTranscripts(), this.startCopilot()])
  }

  async stop(): Promise<void> {
    if (this.agentSessionTimer) clearInterval(this.agentSessionTimer)
    this.agentSessionTimer = null
    await Promise.all([
      this.server?.stop(),
      this.watcher?.stop(),
      ...this.copilotWatchers.map((w) => w.stop()),
    ])
  }

  /**
   * After system sleep, file watchers may have missed events (and fsevents handles can go
   * stale): rebuild the transcript watcher. It re-tails from the end, so nothing is replayed.
   */
  async onResume(): Promise<void> {
    await this.watcher?.stop()
    this.watcher = null
    await Promise.all(this.copilotWatchers.map((w) => w.stop()))
    this.copilotWatchers = []
    await Promise.all([this.startTranscripts(), this.startCopilot()])
  }

  status(): IntegrationStatus {
    const s = this.server?.status ?? { state: 'stopped' as const }
    const hooks = this.installer.status()
    return {
      server:
        s.state === 'listening' && this.endpoint
          ? { state: 'listening', port: s.port, eventUrl: this.endpoint.eventUrl }
          : s.state === 'error'
            ? s
            : { state: 'stopped' },
      hooks: {
        ...hooks,
        lastEventAt: this.server?.stats.lastHookAt ?? 0,
        count: this.router.stats.hook,
      },
      transcripts: {
        enabled: this.transcriptsEnabled,
        root: claudeProjectsRoot(),
        files: this.watcher?.stats.files ?? 0,
        lines: this.watcher?.stats.lines ?? 0,
      },
      copilot: {
        enabled: this.copilotEnabled,
        roots: copilotRoots(),
        files: this.copilotWatchers.reduce((n, w) => n + w.stats.files, 0),
        lines: this.copilotWatchers.reduce((n, w) => n + w.stats.lines, 0),
        events: this.router.stats.copilot,
      },
    }
  }

  private async startServer(): Promise<void> {
    try {
      const server = new LocalServer({
        port: configuredPort(),
        token: loadOrCreateToken(),
        handlers: {
          onEvent: (body) => this.router.fromWebhook(body),
          onHook: (body) => this.router.fromHook(body),
        },
      })
      const status = await server.start()
      this.server = server
      if (status.state === 'listening') this.endpoint = publishEndpoint(status.port)
      else console.error('[server]', status)
    } catch (err) {
      console.error('[server] failed to start', err)
    }
  }

  /** VS Code agent-host Copilot sessions: poll their session databases for running and finished requests. */
  private startCopilotAgentSessions(): void {
    if (!this.copilotEnabled || this.agentSessionTimer) return
    const poll = () => {
      for (const root of copilotAgentSessionRoots()) {
        try {
          this.router.fromCopilotAgentSessions(this.agentSessions.scanRoot(root))
        } catch (err) {
          console.error('[copilot] agent session scan failed', err)
        }
      }
    }
    poll()
    this.agentSessionTimer = setInterval(poll, AGENT_SESSION_POLL_MS)
  }

  /** VS Code Copilot Chat: tail every chat session file (one watcher per VS Code flavour found). */
  private async startCopilot(): Promise<void> {
    if (!this.copilotEnabled) return
    this.startCopilotAgentSessions()
    for (const root of copilotRoots()) {
      try {
        const watcher = new TranscriptWatcher({
          root,
          depth: 2, // workspaceStorage/<workspace>/chatSessions/<session>.jsonl
          accept: (path) => /[\\/]chatSessions[\\/][^\\/]+\.jsonl$/.test(path),
          onLine: (line, file) => this.router.fromCopilotLine(line, file),
          onRecentFile: (file) => this.router.fromRecentCopilot(file),
        })
        await watcher.start()
        this.copilotWatchers.push(watcher)
      } catch (err) {
        console.error('[copilot] failed to start', err)
      }
    }
  }

  private async startTranscripts(): Promise<void> {
    if (!this.transcriptsEnabled) return
    try {
      const watcher = new TranscriptWatcher({
        root: claudeProjectsRoot(),
        onLine: (line) => this.router.fromTranscriptLine(line),
        onRecentSession: (id, tail, head) => this.router.fromRecentTranscript(id, tail, head),
      })
      await watcher.start()
      this.watcher = watcher
    } catch (err) {
      console.error('[transcripts] failed to start', err)
    }
  }
}
