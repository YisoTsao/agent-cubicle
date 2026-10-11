import { AgentEvent, type SessionState } from './events'
import {
  DEFAULT_REDUCER_CONFIG,
  createSession,
  reduceSession,
  tickSession,
  toPublic,
  type ReducerConfig,
  type SessionRecord,
} from './reducer'

// Event Hub (SPEC §3/§4): validate → dedupe → order → reduce → snapshot. Clock-injected and
// timer-free so it runs identically in the main process and in unit tests.

export interface HubConfig extends ReducerConfig {
  /** Number of workstations; sessions beyond this have no seat (overflow). */
  seats: number
  /** Ended sessions linger this long (so the UI can show them leaving) before removal. */
  endedLingerMs: number
  /**
   * IDLE sessions silent for this long are removed. Sessions whose terminal was simply closed
   * never send SESSION_ENDED; without this they would accumulate forever (found by the soak test).
   */
  idleExpireMs: number
  /** How many recent eventIds to remember for de-duplication. */
  dedupeWindow: number
  /** 'basename' keeps only the last path segment of `detail` (privacy default, SPEC §8). */
  detailMode: 'basename' | 'full' | 'none'
  /** Size of the diagnostics ring buffer. */
  diagnosticsSize: number
}

export const DEFAULT_HUB_CONFIG: HubConfig = {
  ...DEFAULT_REDUCER_CONFIG,
  seats: 2,
  endedLingerMs: 15_000,
  idleExpireMs: 30 * 60_000,
  dedupeWindow: 2_000,
  detailMode: 'basename',
  diagnosticsSize: 50,
}

export type IngestOutcome = 'applied' | 'invalid' | 'duplicate' | 'out-of-order'

export interface DiagnosticEntry {
  at: number
  outcome: IngestOutcome
  type?: string
  sessionKey?: string
  reason?: string
}

export interface HubSnapshot {
  sessions: SessionState[]
  /** Sessions without a free seat (rendered as an overflow count). */
  overflow: number
}

export function sessionKey(agentId: string, sessionId: string): string {
  return `${agentId}:${sessionId}`
}

export class EventHub {
  private cfg: HubConfig
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly seen = new Set<string>()
  private readonly seenOrder: string[] = []
  private readonly diag: DiagnosticEntry[] = []
  private readonly listeners = new Set<() => void>()
  /** agentId → seat it last used, so an agent tends to come back to "its" desk. */
  private readonly preferredSeat = new Map<string, number>()

  constructor(
    private readonly now: () => number,
    config: Partial<HubConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_HUB_CONFIG, ...config }
  }

  get config(): Readonly<HubConfig> {
    return this.cfg
  }

  /**
   * Change how many desks exist (the user's office size). Sessions on a desk that no longer exists
   * lose their seat; free seats go to the oldest seatless sessions.
   */
  setSeats(seats: number): void {
    if (seats === this.cfg.seats) return
    this.cfg = { ...this.cfg, seats }
    for (const s of this.sessions.values())
      if (s.seat !== undefined && s.seat >= seats) delete s.seat
    this.reseat()
    this.emit()
  }

  /** Adjust timings at runtime (dev simulator / settings). */
  configure(patch: Partial<HubConfig>): void {
    this.cfg = { ...this.cfg, ...patch }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Validate and apply one raw event. Never throws on bad input (SPEC §8 fault tolerance). */
  ingest(raw: unknown): IngestOutcome {
    const parsed = AgentEvent.safeParse(raw)
    if (!parsed.success) {
      this.record({ outcome: 'invalid', reason: parsed.error.issues[0]?.message ?? 'invalid' })
      return 'invalid'
    }
    const event = this.sanitize(parsed.data)
    const key = sessionKey(event.agentId, event.sessionId)

    if (this.seen.has(event.eventId)) {
      this.record({ outcome: 'duplicate', type: event.type, sessionKey: key })
      return 'duplicate'
    }
    this.remember(event.eventId)

    const existing = this.sessions.get(key)
    if (existing && isOlder(event, existing)) {
      this.record({ outcome: 'out-of-order', type: event.type, sessionKey: key })
      return 'out-of-order'
    }

    let session = existing ?? this.open(event)
    session = reduceSession(session, event)
    this.sessions.set(key, session)
    this.record({ outcome: 'applied', type: event.type, sessionKey: key })
    this.emit()
    return 'applied'
  }

  /** Apply time-based transitions and remove lingering ended sessions. Returns true if changed. */
  tick(): boolean {
    const now = this.now()
    let changed = false
    for (const [key, s] of this.sessions) {
      const ended = s.endedAt !== undefined && now - s.endedAt >= this.cfg.endedLingerMs
      const abandoned = s.presence === 'IDLE' && now - s.lastEventAt >= this.cfg.idleExpireMs
      if (ended || abandoned) {
        this.sessions.delete(key)
        changed = true
        continue
      }
      const next = tickSession(s, now, this.cfg)
      if (next !== s) {
        this.sessions.set(key, next)
        changed = true
      }
    }
    if (changed) {
      this.reseat()
      this.emit()
    }
    return changed
  }

  snapshot(): HubSnapshot {
    const sessions = [...this.sessions.values()]
      .sort((a, b) => (a.seat ?? Infinity) - (b.seat ?? Infinity) || a.since - b.since)
      .map(toPublic)
    return { sessions, overflow: sessions.filter((s) => s.seat === undefined).length }
  }

  diagnostics(): readonly DiagnosticEntry[] {
    return this.diag
  }

  /** Drop all sessions (dev reset). */
  clear(): void {
    this.sessions.clear()
    this.emit()
  }

  private open(event: AgentEvent): SessionRecord {
    const s = createSession(event)
    this.assignSeat(s)
    return s
  }

  private assignSeat(s: SessionRecord): void {
    const seat = this.freeSeat(s.agentId)
    if (seat === undefined) return
    s.seat = seat
    this.preferredSeat.set(s.agentId, seat)
  }

  private freeSeat(agentId: string): number | undefined {
    const taken = new Set([...this.sessions.values()].map((s) => s.seat))
    const preferred = this.preferredSeat.get(agentId)
    if (preferred !== undefined && preferred < this.cfg.seats && !taken.has(preferred))
      return preferred
    for (let i = 0; i < this.cfg.seats; i++) if (!taken.has(i)) return i
    return undefined
  }

  /** Give freed seats to the oldest seatless sessions (stable: seated sessions never move). */
  private reseat(): void {
    const waiting = [...this.sessions.values()]
      .filter((s) => s.seat === undefined && s.endedAt === undefined)
      .sort((a, b) => a.since - b.since)
    for (const s of waiting) this.assignSeat(s)
  }

  private sanitize(e: AgentEvent): AgentEvent {
    if (e.detail === undefined) return e
    const mode = this.cfg.detailMode
    if (mode === 'none') {
      const { detail: _d, ...rest } = e
      return rest
    }
    if (mode === 'basename') return { ...e, detail: basename(e.detail).slice(0, 80) }
    return { ...e, detail: e.detail.slice(0, 160) }
  }

  private remember(id: string): void {
    this.seen.add(id)
    this.seenOrder.push(id)
    while (this.seenOrder.length > this.cfg.dedupeWindow) this.seen.delete(this.seenOrder.shift()!)
  }

  private record(entry: Omit<DiagnosticEntry, 'at'>): void {
    this.diag.push({ at: this.now(), ...entry })
    while (this.diag.length > this.cfg.diagnosticsSize) this.diag.shift()
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }
}

/** Sequence wins when both sides have one; otherwise fall back to timestamps. */
function isOlder(event: AgentEvent, s: SessionRecord): boolean {
  if (event.sequence !== undefined && s.lastSequence !== undefined)
    return event.sequence <= s.lastSequence
  return event.timestamp < s.lastEventAt
}

/**
 * Replace every path-like token with its last segment, so `cat /Users/me/secret/a.txt` becomes
 * `cat a.txt` and `src/index.ts` becomes `index.ts`. Works for POSIX and Windows separators.
 */
export function basename(detail: string): string {
  return detail.replace(/\S*[\\/]\S*/g, (token) => {
    const parts = token.split(/[\\/]/).filter(Boolean)
    return parts.at(-1) ?? token
  })
}
