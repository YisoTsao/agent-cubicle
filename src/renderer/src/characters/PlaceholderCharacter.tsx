import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group, Mesh, Quaternion, Vector3, type Material } from 'three'
import { materials } from '../scene/materials'
import { Ball } from '../scene/primitives'
import { useSettings } from '../store/settings'

// Procedurally built chibi agent (SPEC §7 fallback). Faces local +z, seated pose with hands on a
// keyboard ~0.45 m ahead. Always renderable, so a missing/failed GLB never leaves an empty seat.

type V3 = [number, number, number]

const UP = new Vector3(0, 1, 0)

/** Capsule spanning two points — used for limbs. */
function Limb({
  from,
  to,
  radius,
  material,
}: {
  from: V3
  to: V3
  radius: number
  material: Material
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new Vector3(...from)
    const b = new Vector3(...to)
    const dir = b.clone().sub(a)
    const len = dir.length()
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(UP, dir.normalize()),
      length: len,
    }
  }, [from, to])
  return (
    <mesh position={position} quaternion={quaternion} material={material} castShadow receiveShadow>
      <capsuleGeometry args={[radius, Math.max(0.001, length), 6, 12]} />
    </mesh>
  )
}

const SEATED = {
  hipY: 0.53,
  shoulderY: 0.93,
  headY: 1.2,
  hand: [0.13, 0.79, 0.43] as V3,
}

/** Time used in showcase mode so screenshots are reproducible. */
const SHOWCASE_TIME = 1.25

export function PlaceholderCharacter(props: { position: V3; rotationY: number }) {
  const showcase = useSettings((s) => s.showcase)
  const upper = useRef<Group>(null)
  const head = useRef<Group>(null)
  const eyes = useRef<Group>(null)
  const handL = useRef<Mesh>(null)
  const handR = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    const t = showcase ? SHOWCASE_TIME : clock.elapsedTime
    // Breathing + subtle head motion (secondary animation layer).
    if (upper.current) upper.current.scale.y = 1 + Math.sin(t * 1.6) * 0.012
    if (head.current) {
      head.current.rotation.x = 0.08 + Math.sin(t * 0.7) * 0.03
      head.current.rotation.y = Math.sin(t * 0.45) * 0.08
    }
    // Blink: ~120 ms closed every 4 s.
    if (eyes.current) eyes.current.scale.y = t % 4 < 0.12 ? 0.1 : 1
    // Typing: alternating hand taps.
    if (handL.current)
      handL.current.position.y = SEATED.hand[1] + Math.max(0, Math.sin(t * 14)) * 0.012
    if (handR.current)
      handR.current.position.y = SEATED.hand[1] + Math.max(0, Math.sin(t * 14 + 2)) * 0.012
  })

  const { hipY, shoulderY, headY, hand } = SEATED
  return (
    <group position={props.position} rotation={[0, props.rotationY, 0]}>
      {/* Legs */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Limb
            from={[s * 0.085, hipY, 0.02]}
            to={[s * 0.09, hipY + 0.01, 0.36]}
            radius={0.068}
            material={materials.pants}
          />
          <Limb
            from={[s * 0.09, hipY, 0.38]}
            to={[s * 0.09, 0.1, 0.42]}
            radius={0.06}
            material={materials.pants}
          />
          <Ball
            radius={0.075}
            position={[s * 0.09, 0.05, 0.47]}
            scale={[0.9, 0.6, 1.4]}
            material={materials.charcoal}
          />
        </group>
      ))}

      <group ref={upper} position={[0, hipY, 0]}>
        {/* Torso: a soft bean shape */}
        <mesh
          position={[0, 0.2, -0.01]}
          rotation={[0.08, 0, 0]}
          material={materials.shirt}
          castShadow
          receiveShadow
        >
          <capsuleGeometry args={[0.16, 0.16, 8, 20]} />
        </mesh>
        <Ball
          radius={0.075}
          position={[0, shoulderY - hipY + 0.03, 0]}
          scale={[1, 0.6, 1]}
          material={materials.skin}
        />

        {/* Arms (relative to the hip group) */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <Limb
              from={[s * 0.19, shoulderY - hipY - 0.02, -0.01]}
              to={[s * 0.21, 0.2, 0.15]}
              radius={0.055}
              material={materials.shirt}
            />
            <Limb
              from={[s * 0.21, 0.2, 0.15]}
              to={[s * hand[0], hand[1] - hipY, hand[2] - 0.04]}
              radius={0.045}
              material={materials.skin}
            />
          </group>
        ))}
      </group>
      <mesh
        ref={handL}
        position={[-hand[0], hand[1], hand[2]]}
        material={materials.skin}
        castShadow
      >
        <sphereGeometry args={[0.05, 16, 12]} />
      </mesh>
      <mesh ref={handR} position={[hand[0], hand[1], hand[2]]} material={materials.skin} castShadow>
        <sphereGeometry args={[0.05, 16, 12]} />
      </mesh>

      {/* Head */}
      <group ref={head} position={[0, headY, 0]}>
        <Ball radius={0.22} material={materials.skin} />
        {/* Hair: top cap + back + fringe */}
        <mesh position={[0, 0.015, -0.005]} material={materials.hair} castShadow>
          <sphereGeometry args={[0.235, 32, 16, 0, Math.PI * 2, 0, 1.15]} />
        </mesh>
        <mesh position={[0, 0.0, -0.01]} material={materials.hair} castShadow>
          <sphereGeometry args={[0.236, 32, 16, Math.PI, Math.PI, 0, 2.2]} />
        </mesh>
        {[-0.12, -0.04, 0.05, 0.13].map((x, i) => (
          <Ball
            key={x}
            radius={0.07}
            position={[x, 0.135 - (i % 2) * 0.012, 0.155]}
            scale={[1, 0.75, 0.7]}
            material={materials.hair}
          />
        ))}
        <Ball radius={0.09} position={[0, 0.17, -0.17]} material={materials.hair} />

        {/* Face */}
        <group ref={eyes} position={[0, -0.01, 0.205]}>
          <Ball
            radius={0.027}
            position={[-0.075, 0, 0]}
            scale={[1, 1.3, 0.6]}
            material={materials.eye}
            castShadow={false}
          />
          <Ball
            radius={0.027}
            position={[0.075, 0, 0]}
            scale={[1, 1.3, 0.6]}
            material={materials.eye}
            castShadow={false}
          />
          <Ball
            radius={0.008}
            position={[-0.067, 0.012, 0.016]}
            material={materials.eyeHighlight}
            castShadow={false}
          />
          <Ball
            radius={0.008}
            position={[0.083, 0.012, 0.016]}
            material={materials.eyeHighlight}
            castShadow={false}
          />
        </group>
        <Ball
          radius={0.035}
          position={[-0.125, -0.06, 0.175]}
          scale={[1, 0.55, 0.4]}
          material={materials.cheek}
          castShadow={false}
        />
        <Ball
          radius={0.035}
          position={[0.125, -0.06, 0.175]}
          scale={[1, 0.55, 0.4]}
          material={materials.cheek}
          castShadow={false}
        />
        <mesh position={[0, -0.075, 0.207]} rotation={[0, 0, Math.PI]} material={materials.eye}>
          <torusGeometry args={[0.018, 0.005, 6, 12, Math.PI]} />
        </mesh>
      </group>
    </group>
  )
}
