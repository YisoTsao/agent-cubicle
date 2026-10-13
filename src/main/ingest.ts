import type { AgentEvent } from '@shared/events'
import type { EventHub, IngestOutcome } from '@shared/hub'
import { mapClaudeHook } from './adapters/claudeHooks'
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { mapTranscriptLine, projectCwdIn } from './adapters/claudeTranscript'
import { claudeAgentName } from './adapters/claudeTools'
import { COPILOT_AGENT_ID, CopilotChatMapper, copilotAgentName } from './adapters/copilotChat'

// Routes every source into the hub (SPEC §3/§5) and arbitrates between them:
// once a Claude session has spoken through hooks (precise, ordered), transcript-derived events
// for that session are dropped so the two sources never fight.

const HOOK_SESSION_MEMORY = 500
const COPILOT_FILE_MEMORY = 200

export class IngestRouter {
  private readonly hookSeq = new Map<string, number>()
  private readonly copilot = new Map<string, CopilotChatMapper>()
  /** VS Code workspace storage dir → id of the Copilot chat most recently seen there. */
  private readonly copilotInWorkspace = new Map<string, string>()
  readonly stats = { hook: 0, hookIgnored: 0, log: 0, logSuperseded: 0, webhook: 0, copilot: 0 }

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
  fromRecentTranscript(sessionId: string, tail: string | null, head: string | null): void {
    this.fromLogEvent({
      eventId: `log:${sessionId}:recent`,
      agentId: 'claude-code',
      agentName: claudeAgentName(projectCwdIn(tail) ?? projectCwdIn(head)),
      sessionId,
      type: 'SESSION_STARTED',
      timestamp: Date.now(),
      source: 'log',
    })
  }

  /** One new line of a VS Code Copilot Chat session file (see adapters/copilotChat.ts). */
  fromCopilotLine(line: string, file: string): void {
    for (const event of this.copilotMapper(file).mapLine(line)) {
      this.stats.copilot++
      this.hub.ingest(event)
    }
  }

  /** A Copilot chat that was active right before startup: show it without replaying history. */
  fromRecentCopilot(file: string): void {
    const m = this.copilotMapper(file)
    this.hub.ingest({
      eventId: `cp:${m.sessionId}:recent`,
      agentId: COPILOT_AGENT_ID,
      agentName: m.agentName,
      sessionId: m.sessionId,
      type: 'SESSION_STARTED',
      timestamp: Date.now(),
      source: 'log',
    })
  }

  private copilotMapper(file: string): CopilotChatMapper {
    let m = this.copilot.get(file)
    if (!m) {
      m = new CopilotChatMapper(basename(file, '.jsonl'), copilotAgentName(workspaceFolder(file)))
      this.copilot.set(file, m)
      if (this.copilot.size > COPILOT_FILE_MEMORY)
        this.copilot.delete(this.copilot.keys().next().value!)
      this.supersedeCopilotChat(file, m.sessionId)
    }
    return m
  }

  /**
   * Copilot Chat starts a new chat file when you switch model, so one conversation would show up
   * as several agents. A new chat in a workspace therefore replaces the previous one there, unless
   * that one is still working (then both stay until it finishes).
   */
  private supersedeCopilotChat(file: string, sessionId: string): void {
    const workspace = dirname(dirname(file)) // workspaceStorage/<hash>
    const previous = this.copilotInWorkspace.get(workspace)
    this.copilotInWorkspace.set(workspace, sessionId)
    if (!previous || previous === sessionId) return
    const old = this.hub
      .snapshot()
      .sessions.find((s) => s.agentId === COPILOT_AGENT_ID && s.sessionId === previous)
    if (!old || old.presence === 'ACTIVE' || old.presence === 'WAITING_APPROVAL') return
    this.hub.ingest({
      eventId: `cp:${previous}:superseded`,
      agentId: COPILOT_AGENT_ID,
      agentName: old.agentName,
      sessionId: previous,
      type: 'SESSION_ENDED',
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

/** The folder a VS Code workspace storage entry belongs to (from its workspace.json). */
function workspaceFolder(chatFile: string): string | undefined {
  try {
    const meta = JSON.parse(
      readFileSync(join(dirname(dirname(chatFile)), 'workspace.json'), 'utf8'),
    ) as { folder?: unknown; workspace?: unknown }
    const target = meta.folder ?? meta.workspace
    return typeof target === 'string' ? target.replace(/\.code-workspace$/, '') : undefined
  } catch {
    return undefined
  }
}
