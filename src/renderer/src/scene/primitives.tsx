import { RoundedBox } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'
import type { Material } from 'three'

type Vec3 = [number, number, number]

interface BlockProps {
  size: Vec3
  position?: Vec3
  rotation?: Vec3
  material: Material
  /** Corner radius in metres; rounded edges are what make the diorama read as "cozy". */
  radius?: number
  castShadow?: boolean
}

/** Rounded box with shadows on by default. Units are metres (SPEC §6). */
export function Block({
  size,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  material,
  radius = 0.03,
  castShadow = true,
}: BlockProps) {
  const r = Math.min(radius, ...size.map((s) => s / 2 - 0.001))
  return (
    <RoundedBox
      args={size}
      radius={r}
      smoothness={2}
      position={position}
      rotation={rotation}
      material={material}
      castShadow={castShadow}
      receiveShadow
    />
  )
}

type MeshProps = ThreeElements['mesh']

export function Cyl({
  args,
  material,
  ...rest
}: { args: [number, number, number, number?] } & { material: Material } & Omit<
    MeshProps,
    'args' | 'material'
  >) {
  return (
    <mesh castShadow receiveShadow material={material} {...rest}>
      <cylinderGeometry args={[args[0], args[1], args[2], args[3] ?? 24]} />
    </mesh>
  )
}

export function Ball({
  radius,
  material,
  ...rest
}: { radius: number; material: Material } & Omit<MeshProps, 'args' | 'material'>) {
  return (
    <mesh castShadow receiveShadow material={material} {...rest}>
      <sphereGeometry args={[radius, 20, 14]} />
    </mesh>
  )
}
