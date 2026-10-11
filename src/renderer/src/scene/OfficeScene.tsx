import { ContactShadows } from '@react-three/drei'
import { memo, useLayoutEffect } from 'react'
import { AgentCharacter } from '../characters/AgentCharacter'
import { PRESENTATION } from '../characters/presentation'
import { useAgents } from '../store/agents'
import { useSettings } from '../store/settings'
import { HackerDecor } from './props/HackerDecor'
import { NightDecor } from './props/NightDecor'
import { SpaceFurniture } from './props/SpaceFurniture'
import { THEMES } from '../config/themes'
import { Sky } from './Sky'
import { applyMaterialTheme } from './materials'
import { BackWall, TerminalScreens } from './props/BackWall'
import { Lounge } from './props/Lounge'
import { Room, ROOM } from './props/Room'
import { DeskScreen, activeWorkstations, WorkDesk } from './props/WorkDesk'
import { roomExtra, type DeskCount } from './props/layout'
import { StaticBatch } from './StaticBatch'

/** Static furniture: memoized so agent updates never re-render (and re-allocate) the batched tree. */
const StaticFurniture = memo(function StaticFurniture({
  station,
  desks,
}: {
  station: boolean
  desks: DeskCount
}) {
  if (station)
    return (
      <StaticBatch key={`space-${desks}`}>
        <SpaceFurniture desks={desks} />
      </StaticBatch>
    )
  return (
    <StaticBatch key={`office-${desks}`}>
      <Room extra={roomExtra(desks)} />
      {activeWorkstations(desks).map((ws) => (
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
  const scene = useSettings((s) => s.scene)
  const desks = useSettings((s) => s.desks)
  const extra = roomExtra(desks)
  // Recolour the shared materials before paint when the scene theme changes.
  useLayoutEffect(() => applyMaterialTheme(scene), [scene])

  return (
    <group>
      <Sky />
      {/* A bigger office grows towards +z; slide it back so the whole room stays centred. */}
      <group position={[0, 0, -extra / 2]}>
        <StaticFurniture station={THEMES[scene].furniture === 'space'} desks={desks} />
        {scene === 'hacker' && <HackerDecor />}
        {scene === 'night' && <NightDecor />}

        {/* Live props driven by agent state */}
        {activeWorkstations(desks).map((ws) => {
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
      </group>

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
