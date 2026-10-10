import { useEffect, useState } from 'react'
import { PRESENTATION_STATES, type PresentationState } from '../characters/presentation'
import { useAgents } from '../store/agents'

// Phase 2 driver: switch an agent's presentation state by hand or run a scripted demo loop.
// Phase 3 replaces this with simulated events flowing through the real reducer.

const DEMO_SCRIPT: [PresentationState, number][] = [
  ['THINKING', 3],
  ['READ', 5],
  ['WRITE', 6],
  ['EXEC', 6],
  ['WAITING_APPROVAL', 4],
  ['WRITE', 4],
  ['ERROR', 4],
  ['THINKING', 3],
  ['WRITE', 4],
  ['COMPLETED', 3],
  ['IDLE', 8],
]

export function DevPanel() {
  const agent = useAgents((s) => s.agents[0])
  const setState = useAgents((s) => s.setState)
  const [demo, setDemo] = useState(() => new URLSearchParams(window.location.search).has('demo'))

  useEffect(() => {
    if (!demo || !agent) return
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      const [state, seconds] = DEMO_SCRIPT[i % DEMO_SCRIPT.length]!
      setState(agent.id, state)
      i++
      timer = setTimeout(step, seconds * 1000)
    }
    step()
    return () => clearTimeout(timer)
  }, [demo, agent?.id, setState]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!agent) return null
  return (
    <div className="dev-panel" data-testid="dev-panel">
      <div className="dev-panel__title">{agent.name}</div>
      <div className="dev-panel__grid">
        {PRESENTATION_STATES.map((s) => (
          <button
            key={s}
            className={s === agent.state ? 'active' : ''}
            onClick={() => {
              setDemo(false)
              setState(agent.id, s)
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="dev-panel__demo">
        <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> demo
        loop
      </label>
    </div>
  )
}
