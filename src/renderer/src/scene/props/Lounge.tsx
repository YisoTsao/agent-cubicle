import { materials } from '../materials'
import { Block, Cyl } from '../primitives'
import { Plant } from './Plant'
import { ROOM } from './Room'

// Lounge zone (IDLE): sofa against the left wall, rug, coffee table, floor lamp, wall art.

export const LOUNGE = {
  /** Sofa seat anchor for an idle agent (world x, z). */
  seat: [-2.15, 1.3] as const,
}

export function Lounge() {
  return (
    <group>
      <Sofa />
      {/* Rug */}
      <Block
        size={[2.3, 0.02, 2.0]}
        position={[-0.95, 0.01, 1.3]}
        material={materials.rug}
        radius={0.01}
        castShadow={false}
      />
      <Block
        size={[2.05, 0.022, 1.75]}
        position={[-0.95, 0.012, 1.3]}
        material={materials.ceramic}
        radius={0.01}
        castShadow={false}
      />
      <Block
        size={[1.95, 0.024, 1.65]}
        position={[-0.95, 0.014, 1.3]}
        material={materials.rug}
        radius={0.01}
        castShadow={false}
      />
      <CoffeeTable />
      <FloorLamp />
      <SideTable />
      <WallShelf />
      {/* Pouf */}
      <Cyl
        args={[0.28, 0.3, 0.36, 28]}
        position={[0.05, 0.18, 2.2]}
        material={materials.fabricMustard}
      />
      <WallArt />
    </group>
  )
}

function Sofa() {
  const x = -2.25
  const z = 1.3
  const len = 1.9
  return (
    <group position={[x, 0, z]}>
      <Block
        size={[0.8, 0.3, len]}
        position={[0, 0.25, 0]}
        material={materials.fabricSage}
        radius={0.08}
      />
      {/* Backrest against the wall */}
      <Block
        size={[0.24, 0.55, len]}
        position={[-0.28, 0.6, 0]}
        material={materials.fabricSage}
        radius={0.1}
      />
      {/* Arms */}
      <Block
        size={[0.8, 0.42, 0.2]}
        position={[0, 0.42, len / 2 - 0.1]}
        material={materials.fabricSage}
        radius={0.09}
      />
      <Block
        size={[0.8, 0.42, 0.2]}
        position={[0, 0.42, -len / 2 + 0.1]}
        material={materials.fabricSage}
        radius={0.09}
      />
      {/* Seat cushions */}
      <Block
        size={[0.56, 0.14, 0.73]}
        position={[0.08, 0.46, 0.37]}
        material={materials.fabricSageLight}
        radius={0.06}
      />
      <Block
        size={[0.56, 0.14, 0.73]}
        position={[0.08, 0.46, -0.37]}
        material={materials.fabricSageLight}
        radius={0.06}
      />
      {/* Throw pillows */}
      <Block
        size={[0.14, 0.34, 0.34]}
        position={[-0.1, 0.68, 0.55]}
        rotation={[0.15, 0, -0.2]}
        material={materials.fabricTerracotta}
        radius={0.07}
      />
      <Block
        size={[0.14, 0.3, 0.3]}
        position={[-0.1, 0.66, -0.55]}
        rotation={[-0.1, 0, -0.2]}
        material={materials.fabricMustard}
        radius={0.07}
      />
      {/* Feet */}
      {[
        [0.3, 0.8],
        [0.3, -0.8],
        [-0.3, 0.8],
        [-0.3, -0.8],
      ].map(([fx, fz], i) => (
        <Cyl
          key={i}
          args={[0.03, 0.025, 0.1, 12]}
          position={[fx!, 0.05, fz!]}
          material={materials.woodDark}
        />
      ))}
    </group>
  )
}

function SideTable() {
  return (
    <group position={[-2.35, 0, 2.4]}>
      <Cyl args={[0.24, 0.24, 0.04, 32]} position={[0, 0.5, 0]} material={materials.woodLight} />
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2
        return (
          <Cyl
            key={i}
            args={[0.018, 0.014, 0.5, 10]}
            position={[Math.cos(a) * 0.15, 0.25, Math.sin(a) * 0.15]}
            material={materials.woodMid}
          />
        )
      })}
      <Plant position={[0, 0.52, 0]} scale={0.4} variant="bush" />
    </group>
  )
}

/** Floating shelf on the left wall above desk A. */
function WallShelf() {
  const x = -ROOM.half + 0.13
  return (
    <group position={[x, 1.55, -1.35]}>
      <Block size={[0.24, 0.035, 0.95]} material={materials.woodLight} radius={0.012} />
      {/* Book row */}
      {[
        [-0.38, 0.22, 'fabricBlue'],
        [-0.33, 0.2, 'fabricTerracotta'],
        [-0.285, 0.24, 'fabricMustard'],
        [-0.24, 0.19, 'fabricSage'],
      ].map(([z, h, m]) => (
        <Block
          key={z as number}
          size={[0.17, h as number, 0.04]}
          position={[0, 0.018 + (h as number) / 2, z as number]}
          material={materials[m as 'fabricBlue']}
          radius={0.008}
        />
      ))}
      <Block
        size={[0.15, 0.17, 0.04]}
        position={[0.01, 0.1, -0.18]}
        rotation={[0.35, 0, 0]}
        material={materials.ceramic}
        radius={0.008}
      />
      {/* Small framed photo */}
      <Block
        size={[0.03, 0.2, 0.16]}
        position={[-0.05, 0.12, 0.05]}
        rotation={[0, 0, 0.12]}
        material={materials.woodDark}
        radius={0.008}
      />
      <Block
        size={[0.032, 0.15, 0.11]}
        position={[-0.05, 0.12, 0.05]}
        rotation={[0, 0, 0.12]}
        material={materials.fabricBlue}
        radius={0.006}
        castShadow={false}
      />
      <Plant position={[0, 0.018, 0.33]} scale={0.32} variant="succulent" />
      {/* Brackets */}
      {[-0.35, 0.35].map((z) => (
        <Block
          key={z}
          size={[0.18, 0.08, 0.025]}
          position={[-0.02, -0.055, z]}
          material={materials.charcoal}
          radius={0.008}
        />
      ))}
    </group>
  )
}

function CoffeeTable() {
  return (
    <group position={[-1.05, 0, 1.3]}>
      <Cyl args={[0.42, 0.42, 0.05, 40]} position={[0, 0.4, 0]} material={materials.woodLight} />
      <Cyl args={[0.05, 0.08, 0.38, 16]} position={[0, 0.19, 0]} material={materials.woodMid} />
      <Cyl args={[0.24, 0.26, 0.03, 32]} position={[0, 0.015, 0]} material={materials.woodMid} />
      {/* Books + cup on the table */}
      <Block
        size={[0.22, 0.04, 0.3]}
        position={[0.08, 0.445, -0.08]}
        rotation={[0, 0.4, 0]}
        material={materials.fabricBlue}
        radius={0.008}
      />
      <Block
        size={[0.2, 0.035, 0.27]}
        position={[0.08, 0.48, -0.08]}
        rotation={[0, 0.2, 0]}
        material={materials.paper}
        radius={0.008}
      />
      <Cyl
        args={[0.04, 0.035, 0.08]}
        position={[-0.16, 0.465, 0.12]}
        material={materials.ceramic}
      />
    </group>
  )
}

function FloorLamp() {
  return (
    <group position={[-2.35, 0, 0.0]}>
      <Cyl args={[0.16, 0.18, 0.03, 28]} position={[0, 0.015, 0]} material={materials.charcoal} />
      <Cyl args={[0.015, 0.015, 1.45, 12]} position={[0, 0.74, 0]} material={materials.charcoal} />
      <Cyl args={[0.17, 0.25, 0.3, 28]} position={[0, 1.55, 0]} material={materials.lampShade} />
      <mesh position={[0, 1.44, 0]} material={materials.lampGlow}>
        <sphereGeometry args={[0.06, 16, 12]} />
      </mesh>
      <pointLight position={[0, 1.4, 0]} color="#ffcf8a" intensity={2.2} distance={3.2} decay={2} />
    </group>
  )
}

function WallArt() {
  const x = -ROOM.half + 0.015
  return (
    <group>
      {/* Two framed prints above the sofa, on the left wall */}
      <group position={[x, 1.75, 0.95]}>
        <Block
          size={[0.04, 0.62, 0.48]}
          material={materials.woodDark}
          radius={0.01}
          castShadow={false}
        />
        <Block
          size={[0.045, 0.5, 0.36]}
          material={materials.ceramic}
          radius={0.005}
          castShadow={false}
        />
        <Cyl
          args={[0.11, 0.11, 0.05, 32]}
          position={[0.005, 0.04, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={materials.fabricTerracotta}
          castShadow={false}
        />
      </group>
      <group position={[x, 1.6, 1.65]}>
        <Block
          size={[0.04, 0.46, 0.62]}
          material={materials.woodDark}
          radius={0.01}
          castShadow={false}
        />
        <Block
          size={[0.045, 0.36, 0.5]}
          material={materials.ceramic}
          radius={0.005}
          castShadow={false}
        />
        <Block
          size={[0.05, 0.08, 0.36]}
          position={[0.003, -0.06, 0]}
          material={materials.leaf}
          radius={0.03}
          castShadow={false}
        />
        <Block
          size={[0.05, 0.06, 0.22]}
          position={[0.003, 0.03, 0.04]}
          material={materials.fabricBlue}
          radius={0.025}
          castShadow={false}
        />
      </group>
      {/* Wall clock above the desk */}
      <group position={[x, 2.1, -0.35]}>
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
          size={[0.05, 0.012, 0.08]}
          position={[0.004, 0, 0.035]}
          material={materials.charcoal}
          radius={0.004}
          castShadow={false}
        />
      </group>
    </group>
  )
}
