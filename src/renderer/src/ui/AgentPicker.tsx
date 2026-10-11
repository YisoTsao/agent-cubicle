import { CHARACTERS } from '../characters/roster'
import { useAgents } from '../store/agents'

/** Human label for a seat key ("desk-a" → "座位 A", "wait:0" → "等待區 1"). */
export function seatLabel(key: string): string {
  if (key.startsWith('desk-')) return `座位 ${key.slice(5).toUpperCase()}`
  if (key.startsWith('wait:')) return `等待區 ${Number(key.slice(5)) + 1}`
  return key
}

/**
 * Opens when a character is clicked: pick which character sits at that seat. The pick belongs to
 * the seat (so it survives the agent going away and coming back), and is saved with the settings.
 */
export function AgentPicker() {
  const selectedId = useAgents((s) => s.selectedId)
  const agent = useAgents((s) => s.agents.find((a) => a.id === s.selectedId))
  const assignments = useAgents((s) => s.assignments)
  const assign = useAgents((s) => s.assign)
  const select = useAgents((s) => s.select)
  if (!selectedId || !agent) return null
  const pinned = assignments[agent.seatKey]
  return (
    <div
      className="panel agent-picker"
      role="dialog"
      aria-label="選擇角色"
      data-testid="agent-picker"
    >
      <div className="agent-picker__title">
        <span>
          <strong>{agent.name}</strong>
          <span className="muted"> · {seatLabel(agent.seatKey)}</span>
        </span>
        <button className="panel__close" onClick={() => select(null)} aria-label="關閉">
          ×
        </button>
      </div>
      <div className="characters" role="radiogroup" aria-label="這個座位的角色">
        <button
          role="radio"
          aria-checked={!pinned}
          className={`character-chip${!pinned ? ' primary' : ''}`}
          data-testid="agent-pick-default"
          title="跟隨「設定 → 角色」的選擇"
          onClick={() => assign(agent.seatKey, null)}
        >
          預設
        </button>
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={agent.character === c.id && !!pinned}
            className={`character-chip${pinned === c.id ? ' primary' : ''}`}
            data-testid={`agent-pick-${c.id}`}
            title={c.note}
            onClick={() => assign(agent.seatKey, c.id)}
          >
            <span className="swatch" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>
    </div>
  )
}
