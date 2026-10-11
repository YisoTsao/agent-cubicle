import { useMemo } from 'react'
import { S } from '../spaceMaterials'
import { Ball, Block, Cyl } from '../primitives'
import { Plant } from './Plant'
import { ROOM, WINDOW, floorGeometry } from './Room'
import { SpaceExtension } from './WallExtension'
import { DESK, activeWorkstations, type WorkstationSpec } from './WorkDesk'
import { COFFEE_BAR, TERMINAL, roomExtra, type DeskCount } from './layout'

// The space-station furniture set. Every solid piece keeps the footprint, height and seat
// surface of its office counterpart (the collision tests and the walking routes rely on that),
// but nothing is borrowed from the office look: bulkheads, deck plating, a porthole onto the
// Earth, crew seats with harnesses, a galley, an equipment rack, a hydroponics tower.
// Live monitor faces (DeskScreen / TerminalScreens) are the same objects as in the office, so
// the monitors here sit exactly where theirs do.

const { half, wallHeight: H, wallThickness: T, slabDepth: D } = ROOM
const WALL_Z = -half

// ---------------------------------------------------------------------------------------------
// Shell

function Pipe({
  from,
  to,
  r = 0.05,
  material = S.steel,
}: {
  from: [number, number, number]
  to: [number, number, number]
  r?: number
  material?: typeof S.steel
}) {
  const { position, rotation, length } = useMemo(() => {
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const dz = to[2] - from[2]
    const len = Math.hypot(dx, dy, dz)
    // Cylinders are y-aligned: rotate to the segment direction.
    const rotZ = Math.atan2(Math.hypot(dx, dz), dy)
    const rotY = Math.atan2(dx, dz)
    return {
      position: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2] as [
        number,
        number,
        number,
      ],
      rotation: [0, rotY, rotZ] as [number, number, number],
      length: len,
    }
  }, [from, to])
  return (
    <group position={position} rotation={[0, rotation[1], 0]}>
      <group rotation={[rotation[2], 0, 0]}>
        <Cyl args={[r, r, length, 16]} material={material} />
        {[-0.3, 0.3].map((k) => (
          <Cyl
            key={k}
            args={[r * 1.25, r * 1.25, 0.05, 16]}
            position={[0, k * length, 0]}
            material={S.orange}
          />
        ))}
      </group>
    </group>
  )
}

function Porthole() {
  const { cx, cy } = WINDOW
  const z = -half + 0.02
  return (
    <group position={[cx, cy, z]}>
      <mesh position={[0, 0, 0.012]} material={S.earthView}>
        <circleGeometry args={[0.5, 48]} />
      </mesh>
      <mesh position={[0, 0, 0.03]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.55, 0.07, 14, 48]} />
        <primitive object={S.steel} attach="material" />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <torusGeometry args={[0.5, 0.02, 10, 48]} />
        <primitive object={S.orange} attach="material" />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return (
          <Cyl
            key={i}
            args={[0.018, 0.018, 0.04, 8]}
            position={[Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.06]}
            rotation={[Math.PI / 2, 0, 0]}
            material={S.hullDark}
            castShadow={false}
          />
        )
      })}
    </group>
  )
}

function Hatch() {
  const x = -half + 0.03
  return (
    <group position={[x, 1.1, -1.75]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <torusGeometry args={[0.5, 0.07, 12, 40]} />
        <primitive object={S.steel} attach="material" />
      </mesh>
      <mesh position={[0, 0, -0.02]}>
        <circleGeometry args={[0.5, 40]} />
        <primitive object={S.hullMid} attach="material" />
      </mesh>
      {/* Wheel */}
      <mesh position={[0, 0, 0.04]}>
        <torusGeometry args={[0.17, 0.02, 8, 24]} />
        <primitive object={S.orange} attach="material" />
      </mesh>
      {[0, 1, 2].map((i) => (
        <Block
          key={i}
          size={[0.36, 0.025, 0.025]}
          position={[0, 0, 0.04]}
          rotation={[0, 0, (i * Math.PI) / 3]}
          material={S.orange}
          radius={0.008}
          castShadow={false}
        />
      ))}
      <Ball radius={0.025} position={[0.34, 0.36, 0.05]} material={S.ledGreen} castShadow={false} />
    </group>
  )
}

function Gauges() {
  const x = -half + 0.03
  return (
    <group>
      {/* Instrument panels above the crew bench (where the office has two framed prints) */}
      <group position={[x, 1.75, 0.95]}>
        <Block size={[0.05, 0.62, 0.48]} material={S.hullDark} radius={0.015} castShadow={false} />
        {[-0.14, 0.14].map((dz) => (
          <mesh key={dz} position={[0.03, 0.12, dz]} rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[0.085, 24]} />
            <primitive object={dz < 0 ? S.ledCyan : S.ledAmber} attach="material" />
          </mesh>
        ))}
        <Block
          size={[0.02, 0.07, 0.36]}
          position={[0.03, -0.14, 0]}
          material={S.ledGreen}
          radius={0.01}
          castShadow={false}
        />
      </group>
      <group position={[x, 1.6, 1.65]}>
        <Block size={[0.05, 0.46, 0.62]} material={S.hullDark} radius={0.015} castShadow={false} />
        <Block
          size={[0.02, 0.3, 0.5]}
          position={[0.03, 0, 0]}
          material={S.ledCyan}
          radius={0.01}
          castShadow={false}
        />
        {[-0.18, 0, 0.18].map((dz) => (
          <Block
            key={dz}
            size={[0.025, 0.1, 0.07]}
            position={[0.04, 0, dz]}
            material={S.hullDark}
            radius={0.01}
            castShadow={false}
          />
        ))}
      </group>
      {/* Mission clock above desk A */}
      <mesh position={[x + 0.005, 2.1, -0.35]} rotation={[0, Math.PI / 2, 0]} material={S.clock}>
        <planeGeometry args={[0.5, 0.19]} />
      </mesh>
    </group>
  )
}

function Hull({ extra }: { extra: number }) {
  const deck = S.deck
  const floor = useMemo(() => floorGeometry(extra), [extra])
  return (
    <group>
      {/* Deck plating */}
      <mesh
        receiveShadow
        position={[0, -0.01, extra / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={deck}
        geometry={floor}
      />
      <Block
        size={[half * 2 + T, D, half * 2 + T + extra]}
        position={[-T / 2, -D / 2 - 0.02, -T / 2 + extra / 2]}
        material={S.hullDark}
        radius={0.06}
      />
      {/* Bulkheads */}
      <Block
        size={[T, H, half * 2 + T + extra]}
        position={[-half - T / 2, H / 2, -T / 2 + extra / 2]}
        material={S.wall}
        radius={0.04}
      />
      <Block
        size={[half * 2, H, T]}
        position={[0, H / 2, -half - T / 2]}
        material={S.wall}
        radius={0.04}
      />
      {/* Hazard skirting */}
      <Block
        size={[0.05, 0.12, half * 2 + extra]}
        position={[-half + 0.025, 0.06, extra / 2]}
        material={S.hazard}
        radius={0.01}
        castShadow={false}
      />
      <Block
        size={[half * 2, 0.12, 0.05]}
        position={[0, 0.06, -half + 0.025]}
        material={S.hazard}
        radius={0.01}
        castShadow={false}
      />
      {/* Top rails */}
      <Block
        size={[T + 0.04, 0.08, half * 2 + T + 0.04 + extra]}
        position={[-half - T / 2, H + 0.04, -T / 2 + extra / 2]}
        material={S.hullDark}
        radius={0.02}
      />
      <Block
        size={[half * 2 + 0.02, 0.08, T + 0.04]}
        position={[0, H + 0.04, -half - T / 2]}
        material={S.hullDark}
        radius={0.02}
      />
      {/* Light strips along the ceiling edge */}
      <Block
        size={[half * 2 - 0.4, 0.03, 0.05]}
        position={[0, H - 0.12, -half + 0.04]}
        material={S.light}
        radius={0.01}
        castShadow={false}
      />
      <Block
        size={[0.05, 0.03, half * 2 - 0.4 + extra]}
        position={[-half + 0.04, H - 0.12, extra / 2]}
        material={S.light}
        radius={0.01}
        castShadow={false}
      />
      {/* Conduits */}
      <Pipe
        from={[-half + 0.1, 2.38, -half + 0.12]}
        to={[half - 0.1, 2.38, -half + 0.12]}
        r={0.055}
      />
      <Pipe
        from={[-half + 0.12, 2.5, -half + 0.1]}
        to={[-half + 0.12, 2.5, half - 0.1 + extra]}
        r={0.045}
        material={S.hullMid}
      />
      <Pipe
        from={[-half + 0.12, 0.1, -half + 0.12]}
        to={[-half + 0.12, 2.6, -half + 0.12]}
        r={0.07}
      />
      <Pipe
        from={[1.2, 0.1, -half + 0.1]}
        to={[1.2, 2.3, -half + 0.1]}
        r={0.04}
        material={S.hullMid}
      />
      <Porthole />
      <Hatch />
      <Gauges />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------
// Workstations

function CrewSeat() {
  return (
    <group position={[DESK.seatOffsetX, 0, 0]}>
      <Block size={[0.48, 0.08, 0.48]} position={[0, 0.44, 0]} material={S.seat} radius={0.035} />
      <Block
        size={[0.5, 0.012, 0.03]}
        position={[0, 0.4, 0.21]}
        material={S.orange}
        radius={0.004}
        castShadow={false}
      />
      {/* Backrest with an orange harness */}
      <Block
        size={[0.08, 0.28, 0.44]}
        position={[-0.22, 0.62, 0]}
        material={S.seat}
        radius={0.035}
      />
      {[-0.1, 0.1].map((z) => (
        <Block
          key={z}
          size={[0.01, 0.26, 0.045]}
          position={[-0.175, 0.62, z]}
          material={S.orange}
          radius={0.004}
          castShadow={false}
        />
      ))}
      <Block
        size={[0.012, 0.05, 0.1]}
        position={[-0.172, 0.6, 0]}
        material={S.yellow}
        radius={0.006}
        castShadow={false}
      />
      <Cyl args={[0.028, 0.028, 0.3, 12]} position={[0, 0.25, 0]} material={S.steel} />
      {[0, Math.PI / 2].map((a) => (
        <Block
          key={a}
          size={[0.52, 0.03, 0.05]}
          position={[0, 0.07, 0]}
          rotation={[0, a, 0]}
          material={S.hullDark}
          radius={0.012}
        />
      ))}
    </group>
  )
}

function Monitor() {
  return (
    <group position={[0.18, 0, 0]}>
      <Block
        size={[0.18, 0.015, 0.24]}
        position={[0, 0.008, 0]}
        material={S.hullDark}
        radius={0.006}
      />
      <Block
        size={[0.04, 0.22, 0.05]}
        position={[0.02, 0.12, 0]}
        material={S.hullDark}
        radius={0.01}
      />
      <Block
        size={[0.04, 0.36, 0.6]}
        position={[0, 0.38, 0]}
        material={S.hullDark}
        radius={0.015}
      />
      <Block
        size={[0.012, 0.012, 0.6]}
        position={[-0.02, 0.2, 0]}
        material={S.ledCyan}
        radius={0.004}
        castShadow={false}
      />
    </group>
  )
}

function StationDesk({ spec }: { spec: WorkstationSpec }) {
  const [cx, cz] = spec.center
  const { depth: d, width: w, height: h } = DESK
  const top = 0.045
  const legX = d / 2 - 0.06
  const legZ = w / 2 - 0.06
  return (
    <group position={[cx, 0, cz]}>
      <Block size={[d, top, w]} position={[0, h - top / 2, 0]} material={S.hull} radius={0.02} />
      <Block
        size={[d + 0.01, 0.012, 0.03]}
        position={[0, h - top - 0.004, w / 2 - 0.03]}
        material={S.ledCyan}
        radius={0.004}
        castShadow={false}
      />
      {[
        [-legX, -legZ],
        [legX, -legZ],
        [-legX, legZ],
        [legX, legZ],
      ].map(([x, z], i) => (
        <Cyl
          key={i}
          args={[0.026, 0.026, h - top, 12]}
          position={[x!, (h - top) / 2, z!]}
          material={S.steel}
        />
      ))}
      {/* Equipment locker with latches */}
      <Block
        size={[0.6, 0.5, 0.42]}
        position={[0, 0.28, w / 2 - 0.27]}
        material={S.hullDark}
        radius={0.025}
      />
      {[0.4, 0.17].map((y) => (
        <Block
          key={y}
          size={[0.02, 0.2, 0.36]}
          position={[0.3, y, w / 2 - 0.27]}
          material={S.orange}
          radius={0.008}
          castShadow={false}
        />
      ))}
      <group position={[0, h, 0]}>
        <Monitor />
        <Block
          size={[0.15, 0.018, 0.42]}
          position={[-0.2, 0.01, 0]}
          material={S.hullMid}
          radius={0.006}
        />
        <Block
          size={[0.02, 0.006, 0.34]}
          position={[-0.2, 0.021, 0]}
          material={S.ledCyan}
          radius={0.003}
          castShadow={false}
        />
        {/* Drink pouch with a straw */}
        <Cyl args={[0.028, 0.028, 0.11, 14]} position={[-0.18, 0.055, 0.5]} material={S.white} />
        <Cyl
          args={[0.005, 0.005, 0.1, 6]}
          position={[-0.18, 0.15, 0.5]}
          rotation={[0.3, 0, 0]}
          material={S.orange}
        />
        {spec.decor === 'full' ? (
          <>
            <Cyl
              args={[0.05, 0.06, 0.02, 16]}
              position={[0.2, 0.01, -0.58]}
              material={S.hullDark}
            />
            <Cyl args={[0.01, 0.01, 0.34, 8]} position={[0.2, 0.18, -0.58]} material={S.steel} />
            <Block
              size={[0.05, 0.03, 0.16]}
              position={[0.2, 0.36, -0.58]}
              material={S.light}
              radius={0.01}
              castShadow={false}
            />
            <GrowPod position={[0.22, 0, 0.58]} />
            <Block
              size={[0.22, 0.012, 0.3]}
              position={[-0.12, 0.008, -0.42]}
              rotation={[0, 0.2, 0]}
              material={S.hullDark}
              radius={0.006}
            />
            <Block
              size={[0.2, 0.004, 0.27]}
              position={[-0.12, 0.016, -0.42]}
              rotation={[0, 0.2, 0]}
              material={S.ledCyan}
              radius={0.002}
              castShadow={false}
            />
          </>
        ) : (
          <GrowPod position={[0.2, 0, -0.55]} />
        )}
      </group>
      <CrewSeat />
    </group>
  )
}

function GrowPod({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Cyl args={[0.06, 0.07, 0.04, 16]} position={[0, 0.02, 0]} material={S.hullDark} />
      <Cyl
        args={[0.05, 0.05, 0.13, 16]}
        position={[0, 0.105, 0]}
        material={S.glass}
        castShadow={false}
      />
      <Ball radius={0.04} position={[0, 0.1, 0]} material={S.leaf} />
      <Ball radius={0.03} position={[0.02, 0.15, 0.01]} material={S.leaf} />
      <Cyl
        args={[0.05, 0.05, 0.012, 16]}
        position={[0, 0.18, 0]}
        material={S.grow}
        castShadow={false}
      />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------
// Crew area

function Bench() {
  const x = -2.25
  const z = 1.12
  const len = 2.1
  return (
    <group position={[x, 0, z]}>
      <Block size={[0.8, 0.3, len]} position={[0, 0.25, 0]} material={S.hullMid} radius={0.06} />
      <Block size={[0.24, 0.4, len]} position={[-0.28, 0.53, 0]} material={S.seat} radius={0.08} />
      {[len / 2 - 0.1, -len / 2 + 0.1].map((dz) => (
        <group key={dz}>
          <Block size={[0.8, 0.42, 0.2]} position={[0, 0.42, dz]} material={S.hull} radius={0.07} />
          <Block
            size={[0.82, 0.04, 0.21]}
            position={[0, 0.5, dz]}
            material={S.orange}
            radius={0.015}
            castShadow={false}
          />
        </group>
      ))}
      {[0.425, -0.425].map((dz) => (
        <group key={dz}>
          <Block
            size={[0.56, 0.14, 0.83]}
            position={[0.08, 0.46, dz]}
            material={S.seat}
            radius={0.05}
          />
          {/* Restraint strap across each seat */}
          <Block
            size={[0.5, 0.012, 0.05]}
            position={[0.1, 0.534, dz]}
            material={S.orange}
            radius={0.004}
            castShadow={false}
          />
          <Block
            size={[0.05, 0.016, 0.07]}
            position={[0.1, 0.538, dz + 0.1]}
            material={S.yellow}
            radius={0.006}
            castShadow={false}
          />
        </group>
      ))}
      {/* Seat-back stripe and bolts */}
      <Block
        size={[0.02, 0.05, len - 0.3]}
        position={[-0.155, 0.6, 0]}
        material={S.ledCyan}
        radius={0.008}
        castShadow={false}
      />
      {[
        [0.3, 0.9],
        [0.3, -0.9],
        [-0.3, 0.9],
        [-0.3, -0.9],
      ].map(([fx, fz], i) => (
        <Cyl
          key={i}
          args={[0.035, 0.035, 0.1, 10]}
          position={[fx!, 0.05, fz!]}
          material={S.steel}
        />
      ))}
    </group>
  )
}

function FloorPad() {
  return (
    <group>
      <Block
        size={[2.3, 0.02, 2.0]}
        position={[-0.95, 0.01, 1.3]}
        material={S.hazard}
        radius={0.01}
        castShadow={false}
      />
      <Block
        size={[2.18, 0.022, 1.88]}
        position={[-0.95, 0.012, 1.3]}
        material={S.pad}
        radius={0.01}
        castShadow={false}
      />
    </group>
  )
}

function MagTable() {
  return (
    <group position={[-0.55, 0, 1.3]}>
      <Cyl args={[0.42, 0.42, 0.05, 40]} position={[0, 0.4, 0]} material={S.steel} />
      <mesh position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.012, 8, 48]} />
        <primitive object={S.ledCyan} attach="material" />
      </mesh>
      <Cyl args={[0.05, 0.08, 0.38, 16]} position={[0, 0.19, 0]} material={S.hullDark} />
      <Cyl args={[0.24, 0.26, 0.03, 32]} position={[0, 0.015, 0]} material={S.hullDark} />
      {/* Tablet, meal pouches, a tethered tool */}
      <Block
        size={[0.22, 0.012, 0.3]}
        position={[0.08, 0.431, -0.08]}
        rotation={[0, 0.4, 0]}
        material={S.hullDark}
        radius={0.006}
      />
      <Block
        size={[0.2, 0.004, 0.27]}
        position={[0.08, 0.439, -0.08]}
        rotation={[0, 0.4, 0]}
        material={S.ledCyan}
        radius={0.002}
        castShadow={false}
      />
      <Block
        size={[0.1, 0.03, 0.14]}
        position={[-0.2, 0.44, 0.12]}
        rotation={[0, -0.3, 0]}
        material={S.orange}
        radius={0.012}
      />
      <Block
        size={[0.1, 0.03, 0.14]}
        position={[-0.12, 0.47, 0.14]}
        rotation={[0, 0.2, 0]}
        material={S.white}
        radius={0.012}
      />
    </group>
  )
}

function LightColumn() {
  return (
    <group position={[-2.45, 0, 0.14]}>
      <Cyl args={[0.16, 0.18, 0.03, 28]} position={[0, 0.015, 0]} material={S.hullDark} />
      <Cyl
        args={[0.045, 0.045, 1.5, 16]}
        position={[0, 0.78, 0]}
        material={S.light}
        castShadow={false}
      />
      <Cyl args={[0.06, 0.06, 0.06, 16]} position={[0, 1.56, 0]} material={S.hullDark} />
      <pointLight
        position={[0.2, 1.2, 0]}
        color="#d8e8ff"
        intensity={1.6}
        distance={3.2}
        decay={2}
      />
    </group>
  )
}

function OxygenTanks() {
  return (
    <group position={[-2.35, 0, 2.4]}>
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

function StorageShelf() {
  const x = -half + 0.13
  return (
    <group position={[x, 1.55, -1.35]}>
      <Block size={[0.24, 0.035, 0.95]} material={S.hullMid} radius={0.012} />
      {[
        [-0.38, 0.22, S.orange],
        [-0.3, 0.16, S.white],
        [-0.22, 0.24, S.yellow],
        [-0.12, 0.18, S.hull],
        [0.0, 0.2, S.orange],
        [0.12, 0.14, S.white],
      ].map(([z, hgt, mat], i) => (
        <Block
          key={i}
          size={[0.16, hgt as number, 0.07]}
          position={[0, (hgt as number) / 2 + 0.02, z as number]}
          material={mat as typeof S.orange}
          radius={0.01}
        />
      ))}
      <Block
        size={[0.02, 0.05, 0.94]}
        position={[-0.11, 0.0, 0]}
        material={S.ledAmber}
        radius={0.004}
        castShadow={false}
      />
    </group>
  )
}

function CargoCrate() {
  return (
    <group position={[0.05, 0, 2.2]}>
      <Block size={[0.6, 0.36, 0.6]} position={[0, 0.18, 0]} material={S.yellow} radius={0.03} />
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Block
            key={`${sx}${sz}`}
            size={[0.06, 0.38, 0.06]}
            position={[sx * 0.27, 0.19, sz * 0.27]}
            material={S.hullDark}
            radius={0.012}
          />
        )),
      )}
      <Block size={[0.62, 0.05, 0.2]} position={[0, 0.2, 0]} material={S.hullDark} radius={0.01} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------
// Back wall

function EquipmentRack() {
  const w = 1.0
  const h = 1.85
  const d = 0.36
  const shelves = 4
  return (
    <group position={[-2.0, 0, WALL_Z + d / 2 + 0.01]}>
      <Block
        size={[w, h, 0.03]}
        position={[0, h / 2, -d / 2 + 0.015]}
        material={S.hullMid}
        radius={0.01}
      />
      {[-w / 2 + 0.02, w / 2 - 0.02].map((x) => (
        <Block
          key={x}
          size={[0.04, h, d]}
          position={[x, h / 2, 0]}
          material={S.hullDark}
          radius={0.012}
        />
      ))}
      {Array.from({ length: shelves + 1 }, (_, i) => (
        <Block
          key={i}
          size={[w - 0.06, 0.03, d]}
          position={[0, 0.06 + (i * (h - 0.06)) / shelves, 0]}
          material={S.hullDark}
          radius={0.008}
        />
      ))}
      {Array.from({ length: shelves }, (_, row) => {
        const y = 0.06 + (row * (h - 0.06)) / shelves + 0.02
        return (
          <group key={row} position={[0, y, 0]}>
            {Array.from({ length: 5 }, (_, i) => {
              const x = -w / 2 + 0.12 + i * 0.19
              const tall = 0.2 + ((i + row) % 3) * 0.04
              return (i + row) % 2 === 0 ? (
                <Cyl
                  key={i}
                  args={[0.055, 0.055, tall, 14]}
                  position={[x, tall / 2, 0.02]}
                  material={[S.orange, S.white, S.yellow][(i + row) % 3]!}
                />
              ) : (
                <Block
                  key={i}
                  size={[0.14, tall - 0.04, 0.2]}
                  position={[x, (tall - 0.04) / 2, 0.02]}
                  material={[S.white, S.hull, S.orange][(i + row) % 3]!}
                  radius={0.01}
                />
              )
            })}
            <Block
              size={[w - 0.1, 0.012, 0.02]}
              position={[0, 0.002, d / 2 - 0.01]}
              material={S.ledCyan}
              radius={0.003}
              castShadow={false}
            />
          </group>
        )
      })}
    </group>
  )
}

function Galley() {
  const w = 1.2
  const h = 0.78
  const d = 0.42
  return (
    <group position={[COFFEE_BAR.stand[0], 0, WALL_Z + d / 2 + 0.01]}>
      <Block
        size={[w, h - 0.08, d]}
        position={[0, (h - 0.08) / 2 + 0.08, 0]}
        material={S.hull}
        radius={0.025}
      />
      <Block
        size={[w + 0.04, 0.04, d + 0.03]}
        position={[0, h + 0.02, 0.01]}
        material={S.steel}
        radius={0.012}
      />
      {/* Panel doors with latches */}
      {[-w / 4, w / 4].map((x) => (
        <group key={x}>
          <Block
            size={[w / 2 - 0.05, h - 0.2, 0.02]}
            position={[x, (h - 0.08) / 2 + 0.08, d / 2 + 0.005]}
            material={S.hullMid}
            radius={0.01}
            castShadow={false}
          />
          <Block
            size={[0.012, 0.12, 0.02]}
            position={[x + (x < 0 ? 0.2 : -0.2), 0.5, d / 2 + 0.03]}
            material={S.orange}
            radius={0.004}
            castShadow={false}
          />
        </group>
      ))}
      <group position={[0, h + 0.04, 0]}>
        {/* Water / food-rehydration unit */}
        <Block
          size={[0.26, 0.34, 0.26]}
          position={[-0.3, 0.17, -0.02]}
          material={S.hullDark}
          radius={0.04}
        />
        <Block
          size={[0.2, 0.1, 0.01]}
          position={[-0.3, 0.26, 0.115]}
          material={S.ledCyan}
          radius={0.01}
          castShadow={false}
        />
        <Cyl args={[0.012, 0.012, 0.1, 8]} position={[-0.3, 0.1, 0.1]} material={S.steel} />
        <Cyl
          args={[0.012, 0.012, 0.008, 10]}
          position={[-0.22, 0.3, 0.12]}
          rotation={[Math.PI / 2, 0, 0]}
          material={S.ledAmber}
          castShadow={false}
        />
        {/* Meal pouches */}
        {[0, 1, 2].map((i) => (
          <Block
            key={i}
            size={[0.09, 0.02, 0.13]}
            position={[0.05 + i * 0.11, 0.012 + i * 0.002, 0.08]}
            rotation={[0, i * 0.25 - 0.2, 0]}
            material={[S.orange, S.white, S.yellow][i]!}
            radius={0.008}
          />
        ))}
        <GrowPod position={[0.46, 0, 0.02]} />
      </group>
    </group>
  )
}

const CONSOLE = {
  h: 0.82,
  z: WALL_Z + 0.3,
  monitors: [
    { x: -TERMINAL.slotGap / 2, yaw: 0.18 },
    { x: TERMINAL.slotGap / 2, yaw: -0.18 },
  ],
}

function StationConsole() {
  const sx = TERMINAL.center
  const { h } = CONSOLE
  const legX = TERMINAL.legInset
  return (
    <group position={[sx, 0, CONSOLE.z]}>
      <Block
        size={[TERMINAL.width, 0.05, 0.5]}
        position={[0, h, 0]}
        material={S.steel}
        radius={0.015}
      />
      <Block
        size={[TERMINAL.width - 0.02, 0.012, 0.03]}
        position={[0, h - 0.03, 0.24]}
        material={S.ledCyan}
        radius={0.004}
        castShadow={false}
      />
      {[-legX, legX].map((x) => (
        <Block
          key={x}
          size={[0.05, h, 0.3]}
          position={[x, h / 2, -0.06]}
          material={S.hullDark}
          radius={0.015}
        />
      ))}
      <Block
        size={[TERMINAL.width - 0.2, 0.5, 0.02]}
        position={[0, h / 2 - 0.05, -0.2]}
        material={S.hullDark}
        radius={0.01}
        castShadow={false}
      />
      {CONSOLE.monitors.map(({ x, yaw }) => (
        <group key={x}>
          <group position={[x, h + 0.03, -0.08]} rotation={[0, yaw, 0]}>
            <Block
              size={[0.06, 0.2, 0.04]}
              position={[0, 0.1, -0.02]}
              material={S.hullDark}
              radius={0.01}
            />
            <Block
              size={[0.5, 0.32, 0.035]}
              position={[0, 0.34, 0]}
              material={S.hullDark}
              radius={0.012}
            />
          </group>
          <Block
            size={[0.4, 0.016, 0.13]}
            position={[x, h + 0.033, 0.14]}
            material={S.hullMid}
            radius={0.006}
          />
          {[-0.15, -0.05, 0.05, 0.15].map((bx, i) => (
            <Ball
              key={bx}
              radius={0.012}
              position={[x + bx, h + 0.048, 0.2]}
              material={[S.ledGreen, S.ledAmber, S.ledCyan, S.ledRed][i]!}
              castShadow={false}
            />
          ))}
        </group>
      ))}
    </group>
  )
}

function ComputeCore() {
  const h = 1.9
  return (
    <group position={[2.2, 0, WALL_Z + 0.38]}>
      <Block size={[0.66, h, 0.7]} position={[0, h / 2, 0]} material={S.hullDark} radius={0.03} />
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i} position={[0, 0.3 + i * 0.26, 0.352]}>
          <Block size={[0.56, 0.2, 0.02]} material={S.hullMid} radius={0.01} castShadow={false} />
          {[-0.18, -0.12, -0.06].map((x, k) => (
            <Ball
              key={x}
              radius={0.012}
              position={[x, 0, 0.014]}
              material={[S.ledCyan, S.ledGreen, i % 2 ? S.ledAmber : S.ledCyan][k]!}
              castShadow={false}
            />
          ))}
          <Block
            size={[0.2, 0.012, 0.012]}
            position={[0.14, 0.04, 0.012]}
            material={S.steel}
            radius={0.003}
            castShadow={false}
          />
          <Block
            size={[0.2, 0.012, 0.012]}
            position={[0.14, 0.0, 0.012]}
            material={S.steel}
            radius={0.003}
            castShadow={false}
          />
          <Block
            size={[0.2, 0.012, 0.012]}
            position={[0.14, -0.04, 0.012]}
            material={S.steel}
            radius={0.003}
            castShadow={false}
          />
        </group>
      ))}
      <Block
        size={[0.6, 0.04, 0.6]}
        position={[0, h + 0.02, 0]}
        material={S.orange}
        radius={0.01}
      />
    </group>
  )
}

function HydroTower() {
  return (
    <group position={[2.3, 0, -1.3]}>
      <Cyl args={[0.26, 0.28, 0.12, 24]} position={[0, 0.06, 0]} material={S.hullDark} />
      <Cyl
        args={[0.22, 0.22, 1.35, 24]}
        position={[0, 0.8, 0]}
        material={S.glass}
        castShadow={false}
      />
      <Plant position={[0, 0.12, 0]} scale={0.7} variant="tall" />
      <Cyl
        args={[0.24, 0.24, 0.05, 24]}
        position={[0, 1.5, 0]}
        material={S.grow}
        castShadow={false}
      />
      <Cyl args={[0.27, 0.27, 0.09, 24]} position={[0, 1.57, 0]} material={S.hullDark} />
    </group>
  )
}

/** The whole station set, to be wrapped in StaticBatch by the scene. */
export function SpaceFurniture({ desks }: { desks: DeskCount }) {
  return (
    <group>
      <Hull extra={roomExtra(desks)} />
      <SpaceExtension desks={desks} />
      {activeWorkstations(desks).map((ws) => (
        <StationDesk key={ws.id} spec={ws} />
      ))}
      <Bench />
      <FloorPad />
      <MagTable />
      <LightColumn />
      <OxygenTanks />
      <StorageShelf />
      <CargoCrate />
      <EquipmentRack />
      <Galley />
      <StationConsole />
      <ComputeCore />
      <HydroTower />
    </group>
  )
}
