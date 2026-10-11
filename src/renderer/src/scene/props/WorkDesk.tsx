import { materials } from '../materials'
import { Block, Cyl } from '../primitives'
import { Plant } from './Plant'

// Work zone against the back-left wall. The agent sits with its back to the wall facing +x,
// so the isometric camera sees a 3/4 front view of the face over the monitor's back.

export const DESK = {
  depth: 0.75,
  width: 1.5,
  height: 0.74,
  /** Chair offset from the desk centre along -x; the seated agent faces +x. */
  seatOffsetX: -0.64,
}

export interface WorkstationSpec {
  id: string
  /** Desk centre (world x, z). */
  center: readonly [number, number]
  decor: 'full' | 'minimal'
}

/** Seats available to agents (SPEC §7 SeatAllocator consumes this list in Phase 4). */
export const WORKSTATIONS: readonly WorkstationSpec[] = [
  { id: 'desk-a', center: [-1.4, -1.58], decor: 'full' },
  { id: 'desk-b', center: [1.3, 0.7], decor: 'minimal' },
  // Extra rows, only present when the office is set to 4 or 6 desks (the room grows to fit).
  { id: 'desk-c', center: [-1.4, 4.3], decor: 'minimal' },
  { id: 'desk-d', center: [1.3, 4.3], decor: 'minimal' },
  { id: 'desk-e', center: [-1.4, 6.9], decor: 'minimal' },
  { id: 'desk-f', center: [1.3, 6.9], decor: 'minimal' },
]

/** The desks that exist for a given desk count. */
export function activeWorkstations(desks: number): readonly WorkstationSpec[] {
  return WORKSTATIONS.slice(0, desks)
}

export function seatOf(ws: WorkstationSpec): [number, number, number] {
  return [ws.center[0] + DESK.seatOffsetX, 0, ws.center[1]]
}

const top = 0.045

export function WorkDesk({ spec }: { spec: WorkstationSpec }) {
  const [cx, cz] = spec.center
  const { depth: d, width: w, height: h } = DESK
  const legX = d / 2 - 0.06
  const legZ = w / 2 - 0.06
  return (
    <group position={[cx, 0, cz]}>
      {/* Desk */}
      <Block
        size={[d, top, w]}
        position={[0, h - top / 2, 0]}
        material={materials.woodLight}
        radius={0.02}
      />
      {[
        [-legX, -legZ],
        [legX, -legZ],
        [-legX, legZ],
        [legX, legZ],
      ].map(([x, z], i) => (
        <Block
          key={i}
          size={[0.05, h - top, 0.05]}
          position={[x!, (h - top) / 2, z!]}
          material={materials.woodMid}
          radius={0.015}
        />
      ))}
      {/* Drawer unit */}
      <Block
        size={[0.6, 0.5, 0.42]}
        position={[0, 0.28, w / 2 - 0.27]}
        material={materials.woodMid}
        radius={0.025}
      />
      <Block
        size={[0.02, 0.2, 0.36]}
        position={[0.3, 0.4, w / 2 - 0.27]}
        material={materials.woodLight}
        radius={0.008}
        castShadow={false}
      />
      <Block
        size={[0.02, 0.2, 0.36]}
        position={[0.3, 0.17, w / 2 - 0.27]}
        material={materials.woodLight}
        radius={0.008}
        castShadow={false}
      />

      <group position={[0, h, 0]}>
        <Monitor />
        <Keyboard />
        <Mug position={[-0.18, 0, 0.5]} />
        {spec.decor === 'full' ? (
          <>
            <DeskLamp position={[0.2, 0, -0.58]} />
            <Plant position={[0.22, 0, 0.58]} scale={0.32} variant="succulent" />
            {/* Paper stack */}
            <Block
              size={[0.22, 0.03, 0.3]}
              position={[-0.12, 0.015, -0.42]}
              rotation={[0, 0.2, 0]}
              material={materials.paper}
              radius={0.004}
            />
            <Block
              size={[0.2, 0.025, 0.28]}
              position={[-0.12, 0.042, -0.4]}
              rotation={[0, -0.1, 0]}
              material={materials.fabricBlue}
              radius={0.004}
            />
          </>
        ) : (
          <Plant position={[0.2, 0, -0.55]} scale={0.3} variant="succulent" />
        )}
      </group>

      <Chair />
    </group>
  )
}

function Monitor() {
  return (
    <group position={[0.18, 0, 0]}>
      <Block
        size={[0.18, 0.015, 0.24]}
        position={[0, 0.008, 0]}
        material={materials.charcoal}
        radius={0.006}
      />
      <Block
        size={[0.04, 0.22, 0.05]}
        position={[0.02, 0.12, 0]}
        material={materials.charcoal}
        radius={0.01}
      />
      {/* Panel: screen faces -x (towards the agent) */}
      <Block
        size={[0.04, 0.36, 0.6]}
        position={[0, 0.38, 0]}
        material={materials.charcoal}
        radius={0.015}
      />
    </group>
  )
}

const SCREEN_MATERIAL = {
  idle: () => materials.screenIdle,
  active: () => materials.screen,
  error: () => materials.screenError,
} as const

/**
 * Live monitor face for a workstation. Rendered outside StaticBatch (which bakes once) so it can
 * follow the seated agent's state.
 */
export function DeskScreen({
  spec,
  mode,
}: {
  spec: WorkstationSpec
  mode: keyof typeof SCREEN_MATERIAL
}) {
  return (
    <mesh
      position={[spec.center[0] + 0.18 - 0.021, DESK.height + 0.38, spec.center[1]]}
      rotation={[0, -Math.PI / 2, 0]}
      material={SCREEN_MATERIAL[mode]()}
    >
      <planeGeometry args={[0.56, 0.32]} />
    </mesh>
  )
}

function Keyboard() {
  return (
    <group position={[-0.2, 0, 0]}>
      <Block
        size={[0.15, 0.018, 0.42]}
        position={[0, 0.01, 0]}
        material={materials.ceramic}
        radius={0.006}
      />
      <Block
        size={[0.1, 0.012, 0.06]}
        position={[0.02, 0.008, 0.3]}
        rotation={[0, 0.15, 0]}
        material={materials.ceramic}
        radius={0.004}
      />
    </group>
  )
}

function Mug({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Cyl args={[0.04, 0.035, 0.09]} position={[0, 0.045, 0]} material={materials.terracottaPot} />
      <mesh
        position={[0, 0.05, 0.045]}
        rotation={[0, Math.PI / 2, 0]}
        material={materials.terracottaPot}
        castShadow
      >
        <torusGeometry args={[0.025, 0.008, 8, 16]} />
      </mesh>
    </group>
  )
}

function DeskLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Cyl args={[0.07, 0.08, 0.02]} position={[0, 0.01, 0]} material={materials.fabricMustard} />
      <Cyl
        args={[0.012, 0.012, 0.36]}
        position={[0.04, 0.18, 0]}
        rotation={[0, 0, -0.25]}
        material={materials.charcoal}
      />
      <group position={[0.1, 0.36, 0]} rotation={[0, 0, -2.0]}>
        <Cyl args={[0.05, 0.09, 0.12, 20]} material={materials.fabricMustard} />
        <mesh position={[0, -0.055, 0]} material={materials.lampGlow}>
          <sphereGeometry args={[0.035, 16, 12]} />
        </mesh>
      </group>
    </group>
  )
}

function Chair() {
  return (
    <group position={[DESK.seatOffsetX, 0, 0]}>
      <Block
        size={[0.48, 0.08, 0.48]}
        position={[0, 0.44, 0]}
        material={materials.fabricTerracotta}
        radius={0.035}
      />
      <Block
        size={[0.08, 0.5, 0.44]}
        position={[-0.22, 0.75, 0]}
        rotation={[0, 0, 0.08]}
        material={materials.fabricTerracotta}
        radius={0.035}
      />
      <Cyl args={[0.025, 0.025, 0.3]} position={[0, 0.25, 0]} material={materials.metal} />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2
        return (
          <group key={i} rotation={[0, a, 0]}>
            <Block
              size={[0.26, 0.03, 0.04]}
              position={[0.13, 0.08, 0]}
              material={materials.charcoal}
              radius={0.012}
            />
            <Cyl
              args={[0.025, 0.025, 0.04, 12]}
              position={[0.25, 0.03, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              material={materials.charcoal}
            />
          </group>
        )
      })}
    </group>
  )
}
