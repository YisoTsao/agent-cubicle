import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

// Local event server (SPEC §5): POST /api/event (AgentEvent JSON, custom agents / simulator),
// POST /hooks/claude-code (raw Claude Code hook payloads), GET /api/health.
//
// Threat model: any web page in a browser and any local process can try to reach this port.
// Defences: loopback-only bind and peer check, bearer token (timing-safe), reject requests with
// an Origin header (browsers always send one cross-origin), Host allow-list (DNS rebinding),
// JSON-only, body limits, rate limit. It only *accepts observations*; nothing here reads files
// or runs commands.

export interface ServerHandlers {
  onEvent(body: unknown): { status: number; outcome: string }
  onHook(body: unknown): void
}

export interface ServerOptions {
  port: number
  token: string
  handlers: ServerHandlers
  /** Requests per second allowed (token bucket, burst = 2×). */
  rateLimit?: number
}

const LIMITS = { event: 16 * 1024, hook: 1024 * 1024 }
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export type ServerStatus =
  { state: 'stopped' } | { state: 'listening'; port: number } | { state: 'error'; message: string }

export class LocalServer {
  private server: Server | null = null
  private status_: ServerStatus = { state: 'stopped' }
  private readonly token: Buffer
  private bucket: { tokens: number; at: number }
  private readonly rate: number
  /** Counters for diagnostics. */
  readonly stats = { accepted: 0, rejected: 0, hooks: 0, lastHookAt: 0, lastEventAt: 0 }

  constructor(private readonly opts: ServerOptions) {
    this.token = Buffer.from(opts.token)
    this.rate = opts.rateLimit ?? 200
    this.bucket = { tokens: this.rate * 2, at: Date.now() }
  }

  get status(): ServerStatus {
    return this.status_
  }

  start(): Promise<ServerStatus> {
    return new Promise((resolve) => {
      const server = createServer((req, res) => this.handle(req, res))
      server.requestTimeout = 5_000
      server.headersTimeout = 5_000
      server.on('error', (err: NodeJS.ErrnoException) => {
        this.status_ = {
          state: 'error',
          message:
            err.code === 'EADDRINUSE' ? `Port ${this.opts.port} is already in use` : err.message,
        }
        resolve(this.status_)
      })
      server.listen(this.opts.port, '127.0.0.1', () => {
        this.server = server
        this.status_ = { state: 'listening', port: (server.address() as AddressInfo).port }
        resolve(this.status_)
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      this.server.closeAllConnections()
      this.server = null
      this.status_ = { state: 'stopped' }
    })
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    try {
      const reject = this.screen(req)
      if (reject) return this.send(res, reject[0], { error: reject[1] }, true)

      const path = (req.url ?? '').split('?')[0]
      if (req.method === 'GET' && path === '/api/health') {
        return this.send(res, 200, { ok: true, name: 'agentcubicle' })
      }
      if (req.method !== 'POST') return this.send(res, 405, { error: 'method not allowed' }, true)
      if (path !== '/api/event' && path !== '/hooks/claude-code')
        return this.send(res, 404, { error: 'not found' }, true)
      if (!this.authorized(req)) return this.send(res, 401, { error: 'unauthorized' }, true)
      if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
        return this.send(res, 415, { error: 'content-type must be application/json' }, true)
      }
      if (!this.takeToken()) return this.send(res, 429, { error: 'rate limited' }, true)

      const isHook = path === '/hooks/claude-code'
      this.readJson(req, isHook ? LIMITS.hook : LIMITS.event, (err, body) => {
        if (err) return this.send(res, err.status, { error: err.message }, true)
        if (isHook) {
          this.opts.handlers.onHook(body)
          this.stats.hooks++
          this.stats.lastHookAt = Date.now()
          // Empty 2xx: Claude Code treats it as "no decision" (never blocks the agent).
          res.writeHead(204, { 'cache-control': 'no-store' }).end()
          return
        }
        const result = this.opts.handlers.onEvent(body)
        this.stats.lastEventAt = Date.now()
        this.send(res, result.status, { outcome: result.outcome }, result.status >= 400)
      })
    } catch (err) {
      console.error('[server] request failed', err)
      if (!res.headersSent) this.send(res, 500, { error: 'internal error' }, true)
    }
  }

  /** Transport-level checks shared by every route. Returns [status, reason] to reject. */
  private screen(req: IncomingMessage): [number, string] | null {
    if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return [403, 'loopback only']
    // Browsers attach Origin to cross-origin requests; legitimate clients (curl, hooks, SDKs) don't.
    if (req.headers.origin !== undefined) return [403, 'browser requests are not allowed']
    const port = this.status_.state === 'listening' ? this.status_.port : this.opts.port
    const host = req.headers.host ?? ''
    const allowed = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]
    if (!allowed.includes(host.toLowerCase())) return [421, 'unexpected host']
    return null
  }

  private authorized(req: IncomingMessage): boolean {
    const header = req.headers.authorization ?? ''
    const match = /^Bearer\s+(\S+)$/i.exec(header)
    if (!match) return false
    const given = Buffer.from(match[1]!)
    return given.length === this.token.length && timingSafeEqual(given, this.token)
  }

  private takeToken(): boolean {
    const now = Date.now()
    const b = this.bucket
    b.tokens = Math.min(this.rate * 2, b.tokens + ((now - b.at) / 1000) * this.rate)
    b.at = now
    if (b.tokens < 1) return false
    b.tokens -= 1
    return true
  }

  private readJson(
    req: IncomingMessage,
    limit: number,
    done: (err: { status: number; message: string } | null, body?: unknown) => void,
  ): void {
    const declared = Number(req.headers['content-length'] ?? NaN)
    if (Number.isFinite(declared) && declared > limit) {
      req.resume()
      return done({ status: 413, message: 'payload too large' })
    }
    const chunks: Buffer[] = []
    let size = 0
    let finished = false
    req.on('data', (chunk: Buffer) => {
      if (finished) return
      size += chunk.length
      if (size > limit) {
        finished = true
        req.resume()
        return done({ status: 413, message: 'payload too large' })
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (finished) return
      finished = true
      try {
        done(null, JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        done({ status: 400, message: 'invalid JSON' })
      }
    })
    req.on('error', () => {
      if (!finished) {
        finished = true
        done({ status: 400, message: 'read error' })
      }
    })
  }

  private send(res: ServerResponse, status: number, body: unknown, rejected = false): void {
    if (rejected) this.stats.rejected++
    else if (status < 300) this.stats.accepted++
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }
}
