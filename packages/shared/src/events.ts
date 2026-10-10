import { z } from 'zod'

// Raw facts emitted by adapters (SPEC §4). Presentation state is derived later by the reducer.

export const AgentEventType = z.enum([
  'SESSION_STARTED',
  'TASK_STARTED',
  'TOOL_STARTED',
  'TOOL_COMPLETED',
  'APPROVAL_REQUIRED',
  'TASK_COMPLETED',
  'TASK_FAILED',
  'SESSION_ENDED',
  'HEARTBEAT',
])
export type AgentEventType = z.infer<typeof AgentEventType>

export const ToolKind = z.enum(['READ', 'WRITE', 'EXEC', 'SEARCH', 'OTHER'])
export type ToolKind = z.infer<typeof ToolKind>

export const EventSource = z.enum(['hook', 'log', 'webhook', 'simulator'])
export type EventSource = z.infer<typeof EventSource>

const id = z.string().min(1).max(128)

export const AgentEvent = z.object({
  eventId: id,
  agentId: id,
  agentName: z.string().max(64).optional(),
  sessionId: id,
  type: AgentEventType,
  timestamp: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative().optional(),
  toolName: z.string().max(64).optional(),
  toolKind: ToolKind.optional(),
  detail: z.string().max(256).optional(),
  success: z.boolean().optional(),
  source: EventSource,
})
export type AgentEvent = z.infer<typeof AgentEvent>

export type Presence = 'ACTIVE' | 'WAITING_APPROVAL' | 'COMPLETED' | 'ERROR' | 'IDLE' | 'STALE'
export type Activity = 'THINKING' | 'READ' | 'WRITE' | 'EXEC' | 'NONE'

export interface SessionState {
  agentId: string
  agentName: string
  sessionId: string
  presence: Presence
  activity: Activity
  /** True when the activity is inferred (e.g. THINKING) rather than directly observed. */
  inferred: boolean
  since: number
  lastEventAt: number
  detail?: string
  seat?: number
}
