import { ContactShadows } from '@react-three/drei'
import { memo } from 'react'
import { AgentCharacter } from '../characters/AgentCharacter'
import { PRESENTATION } from '../characters/presentation'
import { useAgents } from '../store/agents'
import { BackWall, TerminalScreens } from './props/BackWall'
import { Lounge } from './props/Lounge'
import { Room, ROOM } from './props/Room'
import { DeskScreen, WORKSTATIONS, WorkDesk } from './props/WorkDesk'
import { StaticBatch } from './StaticBatch'

/** Static furniture: memoized so agent updates never re-render (and re-allocate) the batched tree. */
const StaticFurniture = memo(function StaticFurniture() {
  return (
    <StaticBatch>
      <Room />
      {WORKSTATIONS.map((ws) => (
        <WorkDesk key={ws.id} spec={ws} />
      ))}
      <Lounge />
      <BackWall />
    </StaticBatch>
  )
})

export function OfficeScene() {
  const agents = useAgents((s) => s.agents)
  const generation = useAgents((s) => s.generation)

  return (
    <group>
      <StaticFurniture />

      {/* Live props driven by agent state */}
      {WORKSTATIONS.map((ws) => {
        const agent = agents.find((a) => a.deskId === ws.id)
        return (
          <DeskScreen
            key={ws.id}
            spec={ws}
            mode={(agent && PRESENTATION[agent.state].screen) ?? 'idle'}
          />
        )
      })}
      <TerminalScreens active={agents.some((a) => PRESENTATION[a.state].terminal === 'active')} />

      {agents.map((agent) => (
        <AgentCharacter key={`${agent.id}#${generation}`} agent={agent} />
      ))}

      {/* Soft ground shadow under the floating diorama */}
      <ContactShadows
        position={[0, -ROOM.slabDepth - 0.03, 0]}
        scale={11}
        blur={2.8}
        opacity={0.45}
        far={2}
        frames={1}
        color="#6b4f3a"
      />
    </group>
  )
}
