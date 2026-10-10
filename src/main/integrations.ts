import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IntegrationStatus } from '@shared/ipc'
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
  private readonly transcriptsEnabled = process.env['CUBICLE_TRANSCRIPTS'] !== 'off'

  constructor(hub: HubService) {
    this.router = new IngestRouter(hub.hub)
  }

  async start(): Promise<void> {
    await Promise.all([this.startServer(), this.startTranscripts()])
  }

  async stop(): Promise<void> {
    await Promise.all([this.server?.stop(), this.watcher?.stop()])
  }

  /**
   * After system sleep, file watchers may have missed events (and fsevents handles can go
   * stale): rebuild the transcript watcher. It re-tails from the end, so nothing is replayed.
   */
  async onResume(): Promise<void> {
    await this.watcher?.stop()
    this.watcher = null
    await this.startTranscripts()
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

  private async startTranscripts(): Promise<void> {
    if (!this.transcriptsEnabled) return
    try {
      const watcher = new TranscriptWatcher({
        root: claudeProjectsRoot(),
        onLine: (line) => this.router.fromTranscriptLine(line),
        onRecentSession: (id, last) => this.router.fromRecentTranscript(id, last),
      })
      await watcher.start()
      this.watcher = watcher
    } catch (err) {
      console.error('[transcripts] failed to start', err)
    }
  }
}
