import { materials } from '../materials'
import { S } from '../spaceMaterials'
import { Ball, Block, Cyl } from '../primitives'
import { Plant } from './Plant'
import { ROOM } from './Room'
import { roomExtra, type DeskCount } from './layout'
import { activeWorkstations } from './WorkDesk'

// Dressing for the part of the room that appears when the office has 4 or 6 desks: the long left
// wall above the new desks, and the far end of the floor. None of it stands where an agent walks
// (the aisles are x = -1.4 … -0.5 and the lanes at x = -2.26 next to the chairs).

const X = -ROOM.half + 0.015
/** Wall-mounted pieces sit above the left-hand desks. */
const leftDesks = (desks: DeskCount) => activeWorkstations(desks).filter((ws) => ws.center[0] < 0)

/** Far edge of the floor (world z). */
const zEnd = (desks: DeskCount) => ROOM.half + roomExtra(desks)

/** A wall piece `halfLength` long centred at `z` must stay inside the wall (with a margin). */
const fitsWall = (desks: DeskCount, z: number, halfLength: number) =>
  z + halfLength <= zEnd(desks) - 0.15

function Whiteboard({ z }: { z: number }) {
  const notes: [number, number, keyof typeof materials][] = [
    [-0.32, 0.12, 'fabricMustard'],
    [-0.1, 0.17, 'fabricTerracotta'],
    [0.14, 0.1, 'fabricSage'],
    [0.34, 0.15, 'fabricBlue'],
  ]
  return (
    <group position={[X, 1.7, z]}>
      <Block
        size={[0.05, 0.72, 1.2]}
        material={materials.woodMid}
        radius={0.012}
        castShadow={false}
      />
      <Block
        size={[0.055, 0.64, 1.12]}
        material={materials.ceramic}
        radius={0.006}
        castShadow={false}
      />
      {notes.map(([dz, dy, m], i) => (
        <Block
          key={i}
          size={[0.06, 0.12, 0.14]}
          position={[0.002, dy, dz]}
          rotation={[i % 2 ? 0.08 : -0.06, 0, 0]}
          material={materials[m] as typeof materials.ceramic}
          radius={0.004}
          castShadow={false}
        />
      ))}
      {/* A few lines of "writing" and a tray with a marker */}
      {[0.1, -0.02, -0.14].map((dy, i) => (
        <Block
          key={dy}
          size={[0.06, 0.012, 0.5 - i * 0.12]}
          position={[0.002, dy - 0.16, -0.1]}
          material={materials.charcoal}
          radius={0.004}
          castShadow={false}
        />
      ))}
      <Block
        size={[0.08, 0.02, 0.4]}
        position={[0.01, -0.37, 0]}
        material={materials.woodMid}
        radius={0.006}
        castShadow={false}
      />
    </group>
  )
}

function Print({
  z,
  y = 1.7,
  w = 0.62,
  h = 0.46,
  kind,
}: {
  z: number
  y?: number
  w?: number
  h?: number
  kind: number
}) {
  const colors = [materials.fabricTerracotta, materials.fabricBlue, materials.fabricSage]
  return (
    <group position={[X, y, z]}>
      <Block size={[0.04, h, w]} material={materials.woodDark} radius={0.01} castShadow={false} />
      <Block
        size={[0.045, h - 0.12, w - 0.12]}
        material={materials.ceramic}
        radius={0.005}
        castShadow={false}
      />
      <Block
        size={[0.05, (h - 0.12) * 0.45, w - 0.12]}
        position={[0.003, -(h - 0.12) * 0.27, 0]}
        material={colors[kind % 3]!}
        radius={0.004}
        castShadow={false}
      />
      <Cyl
        args={[0.07, 0.07, 0.05, 28]}
        position={[0.005, (h - 0.12) * 0.18, (kind % 2 ? 1 : -1) * 0.1]}
        rotation={[0, 0, Math.PI / 2]}
        material={colors[(kind + 1) % 3]!}
        castShadow={false}
      />
    </group>
  )
}

function Clock({ z }: { z: number }) {
  return (
    <group position={[X, 2.1, z]}>
      <Cyl
        args={[0.18, 0.18, 0.04, 40]}
        rotation={[0, 0, Math.PI / 2]}
        material={materials.woodMid}
        castShadow={false}
      />
      <Cyl
        args={[0.155, 0.155, 0.045, 40]}
        rotation={[0, 0, Math.PI / 2]}
        material={materials.ceramic}
        castShadow={false}
      />
      <Block
        size={[0.05, 0.1, 0.012]}
        position={[0.004, 0.04, 0]}
        material={materials.charcoal}
        radius={0.004}
        castShadow={false}
      />
      <Block
        size={[0.05, 0.012, 0.07]}
        position={[0.004, 0.0, 0.03]}
        material={materials.charcoal}
        radius={0.004}
        castShadow={false}
      />
    </group>
  )
}

/** Floating shelf with a row of books, like the one above desk A. */
function Shelf({ z }: { z: number }) {
  const books: [number, number, keyof typeof materials][] = [
    [-0.3, 0.22, 'fabricBlue'],
    [-0.25, 0.19, 'fabricTerracotta'],
    [-0.2, 0.24, 'fabricMustard'],
    [-0.15, 0.2, 'fabricSage'],
  ]
  return (
    <group position={[-ROOM.half + 0.13, 1.45, z]}>
      <Block size={[0.24, 0.035, 0.8]} material={materials.woodLight} radius={0.012} />
      {books.map(([dz, h, m]) => (
        <Block
          key={dz}
          size={[0.17, h, 0.04]}
          position={[0, 0.018 + h / 2, dz]}
          material={materials[m] as typeof materials.ceramic}
          radius={0.008}
        />
      ))}
      <Plant position={[0, 0.02, 0.22]} scale={0.3} variant="succulent" />
    </group>
  )
}

/** The office look of the longer room. */
export function OfficeExtension({ desks }: { desks: DeskCount }) {
  if (desks === 2) return null
  const rows = leftDesks(desks).slice(1) // the new left-hand desks (not desk A)
  const end = zEnd(desks)
  return (
    <group>
      {rows.map((ws, i) => (
        <group key={ws.id}>
          {i % 2 === 0 ? (
            <Whiteboard z={ws.center[1]} />
          ) : (
            <Print z={ws.center[1] - 0.32} kind={1} />
          )}
          {i % 2 === 1 && <Print z={ws.center[1] + 0.45} kind={2} w={0.5} h={0.4} />}
          {fitsWall(desks, ws.center[1] + 1.35, 0.45) && <Shelf z={ws.center[1] + 1.35} />}
        </group>
      ))}
      <Clock z={3.15} />
      {desks === 6 && <Print z={5.65} y={1.6} kind={0} />}
      {/* Far end of the floor: plants in the corners, a tall one against the wall. */}
      <Plant position={[-2.25, 0, end - 0.4]} scale={0.9} variant="tall" />
      <Plant position={[2.25, 0, end - 0.4]} scale={0.8} variant="bush" />
      <Plant position={[2.3, 0, 3.0]} scale={0.7} variant="bush" />
      {desks === 6 && <Plant position={[2.3, 0, 5.6]} scale={0.7} variant="bush" />}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------
// Space station

function Panel({ z, y = 1.7, leds }: { z: number; y?: number; leds: 'cyan' | 'amber' }) {
  return (
    <group position={[-ROOM.half + 0.03, y, z]}>
      <Block size={[0.05, 0.62, 0.9]} material={S.hullDark} radius={0.015} castShadow={false} />
      {[-0.28, -0.1, 0.08, 0.26].map((dz, i) => (
        <mesh key={dz} position={[0.03, 0.14, dz]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.065, 20]} />
          <primitive
            object={i % 2 ? S.ledGreen : leds === 'cyan' ? S.ledCyan : S.ledAmber}
            attach="material"
          />
        </mesh>
      ))}
      <Block
        size={[0.02, 0.12, 0.7]}
        position={[0.03, -0.08, 0]}
        material={leds === 'cyan' ? S.ledCyan : S.ledAmber}
        radius={0.01}
        castShadow={false}
      />
      <Block
        size={[0.02, 0.06, 0.5]}
        position={[0.03, -0.22, 0]}
        material={S.ledGreen}
        radius={0.01}
        castShadow={false}
      />
    </group>
  )
}

function SidePorthole({ z }: { z: number }) {
  return (
    <group position={[-ROOM.half + 0.02, 1.6, z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0, 0.012]} material={S.earthView}>
        <circleGeometry args={[0.42, 40]} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <torusGeometry args={[0.46, 0.06, 12, 40]} />
        <primitive object={S.steel} attach="material" />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <torusGeometry args={[0.42, 0.018, 8, 40]} />
        <primitive object={S.orange} attach="material" />
      </mesh>
    </group>
  )
}

function Tanks({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[-0.12, 0.12].map((dz) => (
        <group key={dz} position={[0, 0, dz]}>
          <Cyl args={[0.1, 0.1, 0.62, 18]} position={[0, 0.31, 0]} material={S.white} />
          <Cyl args={[0.104, 0.104, 0.07, 18]} position={[0, 0.4, 0]} material={S.orange} />
          <Ball radius={0.1} position={[0, 0.62, 0]} material={S.white} />
          <Cyl args={[0.025, 0.025, 0.08, 8]} position={[0, 0.74, 0]} material={S.steel} />
        </group>
      ))}
    </group>
  )
}

function SupplyCrate({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Block size={[0.5, 0.42, 0.5]} position={[0, 0.21, 0]} material={S.yellow} radius={0.03} />
      <Block size={[0.52, 0.04, 0.12]} position={[0, 0.3, 0]} material={S.hullDark} radius={0.01} />
      <Block
        size={[0.52, 0.04, 0.12]}
        position={[0, 0.12, 0]}
        material={S.hullDark}
        radius={0.01}
      />
    </group>
  )
}

/** The station look of the longer room. */
export function SpaceExtension({ desks }: { desks: DeskCount }) {
  if (desks === 2) return null
  const rows = leftDesks(desks).slice(1)
  const end = zEnd(desks)
  return (
    <group>
      {rows.map((ws, i) => (
        <group key={ws.id}>
          {i % 2 === 0 ? <Panel z={ws.center[1]} leds="cyan" /> : <SidePorthole z={ws.center[1]} />}
          {fitsWall(desks, ws.center[1] + 1.3, 0.5) && (
            <Panel z={ws.center[1] + 1.3} y={1.45} leds="amber" />
          )}
        </group>
      ))}
      {desks === 6 && <Panel z={5.65} y={2.0} leds="cyan" />}
      <Tanks position={[-2.35, 0, end - 0.4]} />
      <SupplyCrate position={[2.2, 0, end - 0.45]} />
      <SupplyCrate position={[2.3, 0, 3.0]} />
      {desks === 6 && <SupplyCrate position={[2.3, 0, 5.6]} />}
    </group>
  )
}
