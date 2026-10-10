import { useEffect, useState } from 'react'
import type { DiagnosticsView, ScenarioInfo } from '@shared/ipc'
import { PRESENTATION_STATES } from '../characters/presentation'
import { MANUAL_AGENT_ID, useAgents } from '../store/agents'

// Dev panel (F3): play simulator scenarios through the real main-process hub, or switch to manual
// mode to pose a single agent directly. Also shows live sessions and recent hub diagnostics.

const SPEEDS = [1, 2, 4]

export function DevPanel() {
  const source = useAgents((s) => s.source)
  const agents = useAgents((s) => s.agents)
  const overflow = useAgents((s) => s.overflow)
  const setSource = useAgents((s) => s.setSource)
  const setState = useAgents((s) => s.setState)
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([])
  const [speed, setSpeed] = useState(1)
  const [running, setRunning] = useState<string | null>(null)
  const [diag, setDiag] = useState<DiagnosticsView | null>(null)

  useEffect(() => {
    window.cubicle.dev.listScenarios().then(setScenarios, () => setScenarios([]))
    const poll = setInterval(() => {
      window.cubicle.dev.diagnostics().then(setDiag, () => setDiag(null))
    }, 1000)
    return () => clearInterval(poll)
  }, [])

  const run = async (name: string) => {
    setSource('live')
    const r = await window.cubicle.dev.runScenario(name, speed)
    setRunning(r.name)
  }

  const counts = (diag?.entries ?? []).reduce<Record<string, number>>((acc, e) => {
    acc[e.outcome] = (acc[e.outcome] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="dev-panel" data-testid="dev-panel">
      <div className="dev-panel__row">
        <span className="dev-panel__title">Source</span>
        {(['live', 'manual'] as const).map((s) => (
          <button key={s} className={source === s ? 'active' : ''} onClick={() => setSource(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="dev-panel__title">Scenarios {running && <em>· {running}</em>}</div>
      <div className="dev-panel__grid">
        {scenarios.map((s) => (
          <button key={s.name} title={s.description} onClick={() => void run(s.name)}>
            {s.name}
          </button>
        ))}
      </div>
      <div className="dev-panel__row">
        <span>speed</span>
        {SPEEDS.map((x) => (
          <button key={x} className={speed === x ? 'active' : ''} onClick={() => setSpeed(x)}>
            {x}×
          </button>
        ))}
        <button
          onClick={() => {
            setRunning(null)
            void window.cubicle.dev.reset()
          }}
        >
          reset
        </button>
      </div>

      <div className="dev-panel__title">Manual state</div>
      <div className="dev-panel__grid">
        {PRESENTATION_STATES.map((s) => (
          <button
            key={s}
            className={source === 'manual' && agents[0]?.state === s ? 'active' : ''}
            onClick={() => setState(MANUAL_AGENT_ID, s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="dev-panel__title">
        Agents ({agents.length}
        {overflow ? ` +${overflow} waiting` : ''})
      </div>
      <ul className="dev-panel__list" data-testid="agent-list">
        {agents.map((a) => (
          <li key={a.id}>
            <b>{a.name}</b> {a.state}
            {a.inferred ? '?' : ''} <span className="muted">{a.deskId}</span>
            {a.detail && <span className="muted"> · {a.detail}</span>}
          </li>
        ))}
      </ul>
      {diag?.enabled && (
        <div className="muted">
          hub:{' '}
          {Object.entries(counts)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ') || 'no events'}
        </div>
      )}
    </div>
  )
}
