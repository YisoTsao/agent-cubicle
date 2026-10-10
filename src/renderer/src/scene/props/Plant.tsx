import { materials } from '../materials'
import { Ball, Cyl } from '../primitives'

type Variant = 'succulent' | 'bush' | 'tall'

interface PlantProps {
  position: [number, number, number]
  scale?: number
  variant?: Variant
}

// Deterministic leaf layouts so screenshots are stable between runs.
const BUSH: [number, number, number, number][] = [
  [0, 0.55, 0, 0.26],
  [0.17, 0.48, 0.06, 0.2],
  [-0.15, 0.5, 0.1, 0.19],
  [0.04, 0.47, -0.17, 0.2],
  [-0.06, 0.72, -0.04, 0.18],
  [0.1, 0.7, 0.12, 0.15],
]
const TALL: [number, number, number, number][] = [
  [0, 0.75, 0, 0.24],
  [0.12, 1.0, 0.05, 0.22],
  [-0.1, 1.2, -0.06, 0.2],
  [0.06, 1.42, 0.02, 0.17],
  [-0.14, 0.92, 0.12, 0.17],
  [0.16, 1.28, -0.1, 0.15],
]

export function Plant({ position, scale = 1, variant = 'bush' }: PlantProps) {
  const leaves = variant === 'tall' ? TALL : BUSH
  return (
    <group position={position} scale={scale}>
      <Cyl args={[0.2, 0.16, 0.36]} position={[0, 0.18, 0]} material={materials.terracottaPot} />
      <Cyl args={[0.21, 0.21, 0.04]} position={[0, 0.36, 0]} material={materials.terracottaPot} />
      <Cyl
        args={[0.185, 0.185, 0.02]}
        position={[0, 0.37, 0]}
        material={materials.woodDark}
        castShadow={false}
      />
      {variant === 'succulent' ? (
        <>
          <Ball
            radius={0.13}
            position={[0, 0.46, 0]}
            scale={[1, 0.8, 1]}
            material={materials.leaf}
          />
          <Ball radius={0.09} position={[0.1, 0.44, 0.06]} material={materials.leafDark} />
          <Ball radius={0.09} position={[-0.09, 0.44, -0.05]} material={materials.leafDark} />
        </>
      ) : (
        <>
          {variant === 'tall' && (
            <Cyl args={[0.025, 0.03, 1.1]} position={[0, 0.9, 0]} material={materials.woodMid} />
          )}
          {leaves.map(([x, y, z, r], i) => (
            <Ball
              key={i}
              radius={r}
              position={[x, y, z]}
              material={i % 2 ? materials.leafDark : materials.leaf}
            />
          ))}
        </>
      )}
    </group>
  )
}
