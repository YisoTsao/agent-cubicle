import type { AgentEvent, AgentEventType, ToolKind } from '../events'
import type { HubConfig } from '../hub'

// Simulator scenarios (SPEC §10 Phase 3): timed event scripts covering the normal path and every
// tricky case the reducer must handle. Pure data; `runScenario` turns them into AgentEvents.

export interface ScenarioStep {
  /** Delivery time in ms from scenario start. */
  at: number
  /** Session alias within the scenario (defaults to "main"). */
  session?: string
  type: AgentEventType
  toolName?: string
  toolKind?: ToolKind
  detail?: string
  success?: boolean
  /** Explicit sequence number (out-of-order scenarios); otherwise auto-incremented per session. */
  sequence?: number
  /** Re-deliver the event of an earlier step (same eventId) to test de-duplication. */
  duplicateOf?: number
  /** Timestamp offset relative to `at` (negative = the event claims to be older). */
  skewMs?: number
}

export interface ScenarioAgent {
  agentId: string
  agentName: string
}

export interface Scenario {
  name: string
  description: string
  /** Session alias → agent identity. */
  agents: Record<string, ScenarioAgent>
  steps: ScenarioStep[]
  /** Hub timing overrides so slow behaviours (stale) are watchable in a demo. */
  hubConfig?: Partial<HubConfig>
}

const CLAUDE: ScenarioAgent = { agentId: 'claude-code', agentName: 'Claude Code' }
const CODEX: ScenarioAgent = { agentId: 'codex', agentName: 'Codex CLI' }

/** Helper: a tool call that starts at `at` and completes `dur` ms later. */
function tool(
  at: number,
  dur: number,
  toolName: string,
  toolKind: ToolKind,
  detail: string,
  extra: Partial<ScenarioStep> = {},
): ScenarioStep[] {
  return [
    { at, type: 'TOOL_STARTED', toolName, toolKind, detail, ...extra },
    { at: at + dur, type: 'TOOL_COMPLETED', toolName, toolKind, success: true, ...extra },
  ]
}

export const SCENARIOS: Scenario[] = [
  {
    name: 'normal-task',
    description: 'Prompt → think → read/search → edit → run tests → done → idle',
    agents: { main: CLAUDE },
    steps: [
      { at: 0, type: 'SESSION_STARTED' },
      { at: 500, type: 'TASK_STARTED' },
      ...tool(2_500, 3_000, 'Read', 'READ', 'src/renderer/src/App.tsx'),
      ...tool(6_500, 2_000, 'Grep', 'SEARCH', 'useAgents'),
      ...tool(10_000, 6_000, 'Edit', 'WRITE', 'src/renderer/src/store/agents.ts'),
      ...tool(17_500, 7_000, 'Bash', 'EXEC', 'pnpm test'),
      { at: 26_000, type: 'TASK_COMPLETED' },
      { at: 32_000, type: 'SESSION_ENDED' },
    ],
  },
  {
    name: 'approval',
    description: 'A command needs permission: the agent waits (sticky) until approved',
    agents: { main: CLAUDE },
    steps: [
      { at: 0, type: 'SESSION_STARTED' },
      { at: 300, type: 'TASK_STARTED' },
      ...tool(2_000, 3_000, 'Edit', 'WRITE', 'package.json'),
      {
        at: 6_000,
        type: 'TOOL_STARTED',
        toolName: 'Bash',
        toolKind: 'EXEC',
        detail: 'rm -rf dist',
      },
      { at: 6_500, type: 'APPROVAL_REQUIRED', detail: 'Bash: rm -rf dist' },
      // Heartbeats must NOT release the approval wait.
      { at: 9_000, type: 'HEARTBEAT' },
      { at: 13_000, type: 'TOOL_COMPLETED', toolName: 'Bash', toolKind: 'EXEC', success: true },
      { at: 15_000, type: 'TASK_COMPLETED' },
      { at: 21_000, type: 'SESSION_ENDED' },
    ],
  },
  {
    name: 'failure-recovery',
    description: 'A failing tool is a hiccup; a failed task is sticky ERROR until the next prompt',
    agents: { main: CLAUDE },
    steps: [
      { at: 0, type: 'SESSION_STARTED' },
      { at: 300, type: 'TASK_STARTED' },
      { at: 2_000, type: 'TOOL_STARTED', toolName: 'Bash', toolKind: 'EXEC', detail: 'pnpm build' },
      { at: 6_000, type: 'TOOL_COMPLETED', toolName: 'Bash', toolKind: 'EXEC', success: false },
      ...tool(7_500, 3_000, 'Edit', 'WRITE', 'src/main/index.ts'),
      { at: 12_000, type: 'TASK_FAILED', detail: 'Build failed: TS2345' },
      // Tool noise after failure must not clear ERROR.
      { at: 14_000, type: 'TOOL_STARTED', toolName: 'Read', toolKind: 'READ', detail: 'error.log' },
      { at: 19_000, type: 'TASK_STARTED' },
      ...tool(20_500, 4_000, 'Edit', 'WRITE', 'src/main/index.ts'),
      { at: 26_000, type: 'TASK_COMPLETED' },
      { at: 32_000, type: 'SESSION_ENDED' },
    ],
  },
  {
    name: 'out-of-order',
    description:
      'Shuffled and duplicated delivery: the newest sequence wins, stale events are dropped',
    agents: { main: CLAUDE },
    steps: [
      { at: 0, type: 'SESSION_STARTED', sequence: 1 },
      { at: 500, type: 'TASK_STARTED', sequence: 2 },
      {
        at: 2_000,
        type: 'TOOL_STARTED',
        toolName: 'Edit',
        toolKind: 'WRITE',
        detail: 'a.ts',
        sequence: 4,
      },
      // seq 3 (READ) arrives late → dropped; character must keep writing.
      {
        at: 2_600,
        type: 'TOOL_STARTED',
        toolName: 'Read',
        toolKind: 'READ',
        detail: 'b.ts',
        sequence: 3,
      },
      { at: 3_000, duplicateOf: 2, type: 'TOOL_STARTED' },
      { at: 3_200, duplicateOf: 1, type: 'TASK_STARTED' },
      {
        at: 8_000,
        type: 'TOOL_COMPLETED',
        toolName: 'Edit',
        toolKind: 'WRITE',
        success: true,
        sequence: 5,
      },
      { at: 8_500, type: 'TASK_COMPLETED', sequence: 6 },
      { at: 9_000, duplicateOf: 6, type: 'TOOL_COMPLETED' },
      { at: 14_000, type: 'SESSION_ENDED', sequence: 7 },
    ],
  },
  {
    name: 'disconnect',
    description:
      'Events stop mid-task: ACTIVE → STALE ("?"), never a fake success; resumes on next event',
    agents: { main: CLAUDE },
    hubConfig: { staleAfterMs: 8_000, staleAfterToolMs: 8_000, idleAfterStaleMs: 30_000 },
    steps: [
      { at: 0, type: 'SESSION_STARTED' },
      { at: 300, type: 'TASK_STARTED' },
      {
        at: 1_500,
        type: 'TOOL_STARTED',
        toolName: 'Edit',
        toolKind: 'WRITE',
        detail: 'big-refactor.ts',
      },
      // ...silence... (stale after 8 s with the demo config)
      { at: 18_000, type: 'TOOL_COMPLETED', toolName: 'Edit', toolKind: 'WRITE', success: true },
      { at: 20_000, type: 'TASK_COMPLETED' },
      { at: 26_000, type: 'SESSION_ENDED' },
    ],
  },
  {
    name: 'multi-session',
    description: 'Two agents in parallel: separate seats, states never overwrite each other',
    agents: { a: CLAUDE, b: CODEX },
    steps: [
      { at: 0, session: 'a', type: 'SESSION_STARTED' },
      { at: 200, session: 'b', type: 'SESSION_STARTED' },
      { at: 500, session: 'a', type: 'TASK_STARTED' },
      { at: 900, session: 'b', type: 'TASK_STARTED' },
      ...tool(2_500, 5_000, 'Edit', 'WRITE', 'ui.tsx', { session: 'a' }),
      ...tool(3_000, 3_000, 'read_file', 'READ', 'README.md', { session: 'b' }),
      ...tool(7_000, 6_000, 'shell', 'EXEC', 'cargo test', { session: 'b' }),
      ...tool(8_500, 4_000, 'Read', 'READ', 'api.ts', { session: 'a' }),
      { at: 13_500, session: 'b', type: 'TASK_FAILED', detail: '3 tests failed' },
      { at: 14_000, session: 'a', type: 'TASK_COMPLETED' },
      { at: 22_000, session: 'b', type: 'TASK_STARTED' },
      ...tool(23_000, 4_000, 'apply_patch', 'WRITE', 'lib.rs', { session: 'b' }),
      { at: 28_000, session: 'b', type: 'TASK_COMPLETED' },
      { at: 30_000, session: 'a', type: 'SESSION_ENDED' },
      { at: 34_000, session: 'b', type: 'SESSION_ENDED' },
    ],
  },
]

const CROWD_AGENTS: ScenarioAgent[] = [
  CLAUDE,
  CODEX,
  { agentId: 'aider', agentName: 'Aider' },
  { agentId: 'gemini', agentName: 'Gemini CLI' },
  { agentId: 'cursor', agentName: 'Cursor' },
  { agentId: 'cline', agentName: 'Cline' },
  { agentId: 'devin', agentName: 'Devin' },
  { agentId: 'copilot', agentName: 'Copilot' },
]
const CROWD_KINDS: [string, ToolKind, string][] = [
  ['Edit', 'WRITE', 'app.tsx'],
  ['Read', 'READ', 'README.md'],
  ['shell', 'EXEC', 'pnpm test'],
  ['Edit', 'WRITE', 'store.ts'],
  ['Read', 'READ', 'api.ts'],
  ['shell', 'EXEC', 'cargo build'],
  ['Edit', 'WRITE', 'lib.rs'],
  ['Read', 'READ', 'notes.md'],
]

SCENARIOS.push({
  name: 'crowd',
  description: 'Eight agents at once: fills every desk of a big office, the rest wait',
  agents: Object.fromEntries(CROWD_AGENTS.map((a, i) => [`s${i}`, a])),
  steps: [
    ...CROWD_AGENTS.flatMap((_, i): ScenarioStep[] => {
      const [toolName, kind, detail] = CROWD_KINDS[i]!
      const session = `s${i}`
      return [
        { at: i * 200, session, type: 'SESSION_STARTED' },
        { at: i * 200 + 300, session, type: 'TASK_STARTED' },
        ...tool(i * 200 + 800, 55_000, toolName, kind, detail, { session }),
        { at: 70_000 + i * 200, session, type: 'SESSION_ENDED' },
      ]
    }),
  ],
})

export const SCENARIO_NAMES = SCENARIOS.map((s) => s.name)

export function scenarioByName(name: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.name === name)
}

export interface TimedEvent {
  /** Delivery time (ms from start, already divided by speed). */
  at: number
  event: AgentEvent
}

/**
 * Expand a scenario into concrete events. `runId` keeps eventIds/sessionIds unique per run;
 * `startTime` anchors timestamps; `speed` > 1 compresses time for demos/tests.
 */
export function expandScenario(
  scenario: Scenario,
  opts: { runId: string; startTime: number; speed?: number },
): TimedEvent[] {
  const speed = opts.speed ?? 1
  const seq = new Map<string, number>()
  const built: TimedEvent[] = []
  scenario.steps.forEach((step, i) => {
    const at = step.at / speed
    if (step.duplicateOf !== undefined) {
      const original = built[step.duplicateOf]
      if (original) built.push({ at, event: original.event })
      return
    }
    const alias = step.session ?? 'main'
    const agent = scenario.agents[alias]
    if (!agent) throw new Error(`${scenario.name}: unknown session alias "${alias}"`)
    const sequence = step.sequence ?? (seq.get(alias) ?? 0) + 1
    seq.set(alias, Math.max(sequence, seq.get(alias) ?? 0))
    const event: AgentEvent = {
      eventId: `${scenario.name}-${opts.runId}-${i}`,
      agentId: agent.agentId,
      agentName: agent.agentName,
      sessionId: `sim-${scenario.name}-${alias}-${opts.runId}`,
      type: step.type,
      timestamp: Math.round(opts.startTime + at + (step.skewMs ?? 0)),
      sequence,
      source: 'simulator',
    }
    if (step.toolName !== undefined) event.toolName = step.toolName
    if (step.toolKind !== undefined) event.toolKind = step.toolKind
    if (step.detail !== undefined) event.detail = step.detail
    if (step.success !== undefined) event.success = step.success
    built.push({ at, event })
  })
  return built.sort((a, b) => a.at - b.at)
}

/** Total scenario length in ms at the given speed. */
export function scenarioDuration(scenario: Scenario, speed = 1): number {
  return Math.max(...scenario.steps.map((s) => s.at)) / speed
}
