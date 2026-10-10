import type { AgentEvent } from '@shared/events'
import type { EventHub, IngestOutcome } from '@shared/hub'
import { mapClaudeHook } from './adapters/claudeHooks'
import { mapTranscriptLine } from './adapters/claudeTranscript'

// Routes every source into the hub (SPEC §3/§5) and arbitrates between them:
// once a Claude session has spoken through hooks (precise, ordered), transcript-derived events
// for that session are dropped so the two sources never fight.

const HOOK_SESSION_MEMORY = 500

export class IngestRouter {
  private readonly hookSeq = new Map<string, number>()
  readonly stats = { hook: 0, hookIgnored: 0, log: 0, logSuperseded: 0, webhook: 0 }

  constructor(private readonly hub: EventHub) {}

  /** Raw Claude Code hook payload. */
  fromHook(payload: unknown): void {
    const sessionId = (payload as { session_id?: unknown } | null)?.session_id
    const seq = typeof sessionId === 'string' ? this.nextSeq(sessionId) : 0
    const result = mapClaudeHook(payload, Date.now(), seq)
    if ('ignored' in result) {
      this.stats.hookIgnored++
      return
    }
    this.stats.hook++
    this.hub.ingest(result.event)
  }

  /** AgentEvent posted by a custom agent / simulator. Maps the outcome to an HTTP status. */
  fromWebhook(body: unknown): { status: number; outcome: IngestOutcome } {
    this.stats.webhook++
    const candidate = body && typeof body === 'object' ? { ...body, source: 'webhook' } : body
    const outcome = this.hub.ingest(candidate)
    return { status: outcome === 'invalid' ? 400 : outcome === 'applied' ? 202 : 200, outcome }
  }

  /** One transcript line. */
  fromTranscriptLine(line: string): void {
    for (const event of mapTranscriptLine(line, Date.now())) this.fromLogEvent(event)
  }

  /** A session that was active right before startup (announced once from its last line). */
  fromRecentTranscript(sessionId: string, lastLine: string | null): void {
    const sample = lastLine ? mapTranscriptLine(lastLine, Date.now())[0] : undefined
    this.fromLogEvent({
      eventId: `log:${sessionId}:recent`,
      agentId: 'claude-code',
      agentName: sample?.agentName ?? 'Claude Code',
      sessionId,
      type: 'SESSION_STARTED',
      timestamp: Date.now(),
      source: 'log',
    })
  }

  private fromLogEvent(event: AgentEvent): void {
    if (this.hookSeq.has(event.sessionId)) {
      this.stats.logSuperseded++
      return
    }
    this.stats.log++
    this.hub.ingest(event)
  }

  private nextSeq(sessionId: string): number {
    const next = (this.hookSeq.get(sessionId) ?? 0) + 1
    this.hookSeq.delete(sessionId) // re-insert to keep LRU order
    this.hookSeq.set(sessionId, next)
    if (this.hookSeq.size > HOOK_SESSION_MEMORY)
      this.hookSeq.delete(this.hookSeq.keys().next().value!)
    return next
  }
}
