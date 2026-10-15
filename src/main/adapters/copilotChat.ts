import { basename } from 'node:path'
import type { AgentEvent, ToolKind } from '@shared/events'

// VS Code Copilot Chat → AgentEvents.
//
// Copilot Chat keeps every chat as an append-only mutation log in
//   <VS Code user dir>/workspaceStorage/<workspace hash>/chatSessions/<session id>.jsonl
// Line 0 is a snapshot ({kind:0,v:{…}}); each later line changes it:
//   {kind:1,k:[path…],v}        set the value at that path
//   {kind:2,k:[path…],v:[…],i?} truncate the array at the path to `i` items (if given), then append
// The file grows while Copilot works, so tailing it gives a live view. Interpreted:
//   a request appended to `requests`            → TASK_STARTED
//   a toolInvocationSerialized response part    → TOOL_STARTED (+ TOOL_COMPLETED when complete)
//   requests[n].modelState.value                → 1/2 TASK_COMPLETED, 3 TASK_FAILED,
//                                                 4 (needs input) APPROVAL_REQUIRED,
//                                                 0 after 4 (user answered) TASK_STARTED
// Prompts, answers, thinking text and tool arguments are never read into an event; the only text
// that leaves this module is a file *name* taken from a tool's "Reading [](file:///…)" message.
// This is an undocumented format (written by the Copilot Chat extension, observed on 0.48): every
// access is defensive and unknown shapes are ignored.

export const COPILOT_AGENT_ID = 'copilot'

const KIND: Record<string, ToolKind> = {
  copilot_readFile: 'READ',
  copilot_listDirectory: 'READ',
  copilot_getErrors: 'READ',
  copilot_viewImage: 'READ',
  copilot_getChangedFiles: 'READ',
  get_terminal_output: 'READ',
  terminal_last_command: 'READ',
  copilot_findFiles: 'SEARCH',
  copilot_findTextInFiles: 'SEARCH',
  copilot_searchCodebase: 'SEARCH',
  copilot_fetchWebPage: 'SEARCH',
  vscode_fetchWebPage_internal: 'SEARCH',
  tool_search: 'SEARCH',
  copilot_replaceString: 'WRITE',
  copilot_multiReplaceString: 'WRITE',
  copilot_insertEdit: 'WRITE',
  copilot_createFile: 'WRITE',
  copilot_createDirectory: 'WRITE',
  copilot_applyPatch: 'WRITE',
  run_in_terminal: 'EXEC',
  send_to_terminal: 'EXEC',
  kill_terminal: 'EXEC',
  run_playwright_code: 'EXEC',
}

export function copilotToolKind(toolId: string): ToolKind {
  return KIND[toolId] ?? 'OTHER'
}

/** The first file in a tool message ("Reading [](file:///a/b/c.ts)"), as a bare file name. */
function fileOf(message: unknown): string | undefined {
  const text =
    typeof message === 'string'
      ? message
      : message && typeof message === 'object'
        ? (message as { value?: unknown }).value
        : undefined
  if (typeof text !== 'string') return undefined
  const m = /file:\/\/\/([^\s)#]+)/.exec(text)
  if (!m) return undefined
  try {
    return basename(decodeURIComponent(m[1]!)).slice(0, 80) || undefined
  } catch {
    return undefined
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'

/** The `modelState.value` a request carries, if any. */
function modelValue(req: unknown): unknown {
  const state = isObj(req) ? req['modelState'] : undefined
  return isObj(state) ? state['value'] : undefined
}

type Emit = (type: AgentEvent['type'], key: string, extra?: Partial<AgentEvent>) => void

/** Tracks one chat file and turns its new lines into events. */
export class CopilotChatMapper {
  /** Tools announced so far, by "request:index" → completed? (the log re-sends parts as they change) */
  private readonly tools = new Map<string, boolean>()
  /** Response length per request, to number appended parts. */
  private readonly lengths = new Map<number, number>()
  private readonly needsInput = new Set<number>()
  /** Requests that already ended: the log flushes their last parts late, which must not wake the agent. */
  private readonly finished = new Set<number>()
  /** Number of requests seen so far (a new request's index when the log does not give one). */
  private requestCount = 0
  private seq = 0

  constructor(
    readonly sessionId: string,
    /** Shown on the name tag, e.g. "GitHub Copilot · my-project". */
    public agentName = 'GitHub Copilot',
  ) {}

  mapLine(line: string, now = Date.now()): AgentEvent[] {
    let o: unknown
    try {
      o = JSON.parse(line)
    } catch {
      return []
    }
    if (!isObj(o)) return []
    const { kind, k, v } = o as { kind?: unknown; k?: unknown; v?: unknown; i?: unknown }
    const path = Array.isArray(k) ? k : []
    const events: AgentEvent[] = []
    const emit = (type: AgentEvent['type'], key: string, extra: Partial<AgentEvent> = {}) =>
      events.push({
        eventId: `cp:${this.sessionId}:${key}:${this.seq++}`.slice(0, 128),
        agentId: COPILOT_AGENT_ID,
        agentName: this.agentName.slice(0, 64),
        sessionId: this.sessionId.slice(0, 128),
        type,
        timestamp: now,
        source: 'log',
        ...extra,
      })

    if (kind === 0) {
      const requests = isObj(v) ? v['requests'] : undefined
      const list = Array.isArray(requests) ? requests : []
      this.requestCount = list.length
      list.forEach((req, n) => this.snapshotRequest(n, req, emit))
      return events
    }

    if (kind === 2 && path.length === 1 && path[0] === 'requests' && Array.isArray(v)) {
      const base = typeof (o as { i?: unknown }).i === 'number' ? (o as { i: number }).i : this.requestCount
      v.forEach((req, r) => {
        emit('TASK_STARTED', 'task')
        this.emitRequest(base + r, req, emit)
      })
      this.requestCount = base + v.length
      return events
    }

    if (kind === 2 && path.length === 3 && path[0] === 'requests' && path[2] === 'response') {
      const n = Number(path[1])
      const parts = Array.isArray(v) ? v : []
      const at = typeof (o as { i?: unknown }).i === 'number' ? (o as { i: number }).i : undefined
      let index = at ?? this.lengths.get(n) ?? 0
      for (const part of parts) {
        this.onPart(n, index++, part, emit)
      }
      this.lengths.set(n, index)
      return events
    }

    // A single part replaced / one of its fields changed.
    if (kind === 1 && path[0] === 'requests' && path[2] === 'response' && path.length >= 4) {
      const n = Number(path[1])
      const m = Number(path[3])
      if (path.length === 4) this.onPart(n, m, v, emit)
      else if (path[4] === 'isComplete' && v === true) this.complete(n, m, emit)
      return events
    }

    if (kind === 1 && path[0] === 'requests' && path[2] === 'modelState' && path.length === 3) {
      this.modelState(Number(path[1]), isObj(v) ? v['value'] : undefined, emit)
      return events
    }
    return events
  }

  /** A request already in a file read from its start: its finished history is not replayed. */
  private snapshotRequest(n: number, req: unknown, emit: Emit): void {
    const value = modelValue(req)
    if (value === 1 || value === 2 || value === 3) {
      this.finished.add(n)
      return
    }
    emit('TASK_STARTED', 'task')
    this.emitRequest(n, req, emit)
  }

  /** The response parts and state a request already carries when it is first seen. */
  private emitRequest(n: number, req: unknown, emit: Emit): void {
    const response = isObj(req) ? req['response'] : undefined
    const parts = Array.isArray(response) ? response : []
    parts.forEach((part, index) => this.onPart(n, index, part, emit))
    this.lengths.set(n, parts.length)
    const value = modelValue(req)
    if (value !== undefined) this.modelState(n, value, emit)
  }

  private modelState(n: number, value: unknown, emit: Emit): void {
    if (value === 4) {
      this.needsInput.add(n)
      emit('APPROVAL_REQUIRED', 'approval')
    } else if (value === 0 && this.needsInput.delete(n)) {
      emit('TASK_STARTED', 'resume')
    } else if (value === 1 || value === 2) {
      this.needsInput.delete(n)
      this.finished.add(n)
      emit('TASK_COMPLETED', 'done')
    } else if (value === 3) {
      this.needsInput.delete(n)
      this.finished.add(n)
      emit('TASK_FAILED', 'failed')
    }
  }

  private onPart(
    n: number,
    index: number,
    part: unknown,
    emit: (type: AgentEvent['type'], key: string, extra?: Partial<AgentEvent>) => void,
  ): void {
    if (!isObj(part) || part['kind'] !== 'toolInvocationSerialized') return
    if (this.finished.has(n)) return
    const toolId = typeof part['toolId'] === 'string' ? part['toolId'] : 'tool'
    const key = `${n}:${index}`
    const kind = copilotToolKind(toolId)
    const detail =
      kind === 'EXEC'
        ? undefined // a terminal command is exactly the text the name tag must not show
        : (fileOf(part['pastTenseMessage']) ?? fileOf(part['invocationMessage']))
    if (!this.tools.has(key)) {
      this.tools.set(key, false)
      emit('TOOL_STARTED', `tool-${key}`, {
        toolName: toolId.slice(0, 64),
        toolKind: kind,
        ...(detail ? { detail } : {}),
      })
    }
    if (part['isComplete'] === true) this.complete(n, index, emit)
  }

  private complete(
    n: number,
    index: number,
    emit: (type: AgentEvent['type'], key: string, extra?: Partial<AgentEvent>) => void,
  ): void {
    const key = `${n}:${index}`
    if (this.finished.has(n) || this.tools.get(key) === true) return // ended, or already reported
    // Completion of a tool announced before we started tailing still ends the activity.
    this.tools.set(key, true)
    emit('TOOL_COMPLETED', `done-${key}`, { success: true })
  }
}

/** "GitHub Copilot · project" — tells parallel chats apart on the name tag. */
export function copilotAgentName(workspaceFolder: unknown): string {
  const folder =
    typeof workspaceFolder === 'string'
      ? workspaceFolder.split(/[\\/]/).filter(Boolean).at(-1)
      : undefined
  let name = folder
  try {
    name = folder ? decodeURIComponent(folder) : folder
  } catch {
    // keep the raw segment
  }
  return (name ? `GitHub Copilot · ${name}` : 'GitHub Copilot').slice(0, 64)
}
