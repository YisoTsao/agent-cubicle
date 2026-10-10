import { ContactShadows } from '@react-three/drei'
import { PlaceholderCharacter } from '../characters/PlaceholderCharacter'
import { BackWall } from './props/BackWall'
import { StaticBatch } from './StaticBatch'
import { Lounge } from './props/Lounge'
import { Room, ROOM } from './props/Room'
import { WORKSTATIONS, WorkDesk, seatOf } from './props/WorkDesk'

export function OfficeScene() {
  return (
    <group>
      <StaticBatch>
        <Room />
        {WORKSTATIONS.map((ws) => (
          <WorkDesk key={ws.id} spec={ws} />
        ))}
        <Lounge />
        <BackWall />
      </StaticBatch>
      <PlaceholderCharacter position={seatOf(WORKSTATIONS[0]!)} rotationY={Math.PI / 2} />
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
