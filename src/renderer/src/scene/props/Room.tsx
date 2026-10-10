import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { materials } from '../materials'
import { Block } from '../primitives'

// Diorama shell: floor slab + two cut-away walls facing the isometric camera.
// Footprint is 6×6 m centred on the origin; walls sit on the -x and -z sides.

export const ROOM = { half: 2.7, wallHeight: 2.8, wallThickness: 0.2, slabDepth: 0.35 }

const { half, wallHeight: H, wallThickness: T, slabDepth: D } = ROOM

export function Room() {
  return (
    <group>
      {/* Floor slab (plank top + trim sides) */}
      <mesh
        receiveShadow
        position={[0, -0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={materials.floor}
      >
        <planeGeometry args={[half * 2, half * 2]} />
      </mesh>
      <Block
        size={[half * 2 + T, D, half * 2 + T]}
        position={[-T / 2, -D / 2 - 0.02, -T / 2]}
        material={materials.woodDark}
        radius={0.06}
      />

      {/* Back-left wall (x = -half) */}
      <Block
        size={[T, H, half * 2 + T]}
        position={[-half - T / 2, H / 2, -T / 2]}
        material={materials.wall}
        radius={0.04}
      />
      {/* Back-right wall (z = -half) */}
      <Block
        size={[half * 2, H, T]}
        position={[0, H / 2, -half - T / 2]}
        material={materials.wall}
        radius={0.04}
      />

      {/* Baseboards */}
      <Block
        size={[0.04, 0.12, half * 2]}
        position={[-half + 0.02, 0.06, 0]}
        material={materials.trim}
        radius={0.01}
        castShadow={false}
      />
      <Block
        size={[half * 2, 0.12, 0.04]}
        position={[0, 0.06, -half + 0.02]}
        material={materials.trim}
        radius={0.01}
        castShadow={false}
      />

      {/* Wall caps (thin trim on top edges for a finished model look) */}
      <Block
        size={[T + 0.04, 0.06, half * 2 + T + 0.04]}
        position={[-half - T / 2, H + 0.03, -T / 2]}
        material={materials.woodMid}
        radius={0.02}
      />
      <Block
        size={[half * 2 + 0.02, 0.06, T + 0.04]}
        position={[0, H + 0.03, -half - T / 2]}
        material={materials.woodMid}
        radius={0.02}
      />

      <Window />
      <WindowSunlight />
    </group>
  )
}

const WINDOW = { cx: -0.3, cy: 1.75, w: 1.4, h: 1.1 }

/** Direction of the fake sun shaft through the window, per metre of drop (x, z). */
const SUN_SLOPE = { x: 0.38, z: 0.92 }

/** Window on the back-right wall with warm daylight glass. */
function Window() {
  const { cx, cy, w, h } = WINDOW
  const z = -half + 0.015
  return (
    <group position={[cx, cy, z]}>
      <mesh position={[0, 0, 0.005]} material={materials.windowGlass}>
        <planeGeometry args={[w, h]} />
      </mesh>
      {/* Frame */}
      <Block
        size={[w + 0.12, 0.07, 0.07]}
        position={[0, h / 2 + 0.03, 0.035]}
        material={materials.frame}
        radius={0.015}
      />
      <Block
        size={[w + 0.24, 0.07, 0.16]}
        position={[0, -h / 2 - 0.03, 0.07]}
        material={materials.frame}
        radius={0.015}
      />
      <Block
        size={[0.07, h, 0.07]}
        position={[-w / 2 - 0.03, 0, 0.035]}
        material={materials.frame}
        radius={0.015}
      />
      <Block
        size={[0.07, h, 0.07]}
        position={[w / 2 + 0.03, 0, 0.035]}
        material={materials.frame}
        radius={0.015}
      />
      <Block
        size={[0.04, h, 0.04]}
        position={[0, 0, 0.03]}
        material={materials.frame}
        radius={0.01}
        castShadow={false}
      />
      <Block
        size={[w, 0.04, 0.04]}
        position={[0, 0, 0.03]}
        material={materials.frame}
        radius={0.01}
        castShadow={false}
      />
    </group>
  )
}

/**
 * Warm light patch cast by the window onto the floor. Baked-style fake (no extra shadow-casting
 * light): the window outline is projected along SUN_SLOPE and drawn as an additive decal.
 */
function WindowSunlight() {
  const geometry = useMemo(() => {
    const { cx, cy, w, h } = WINDOW
    const bottom = cy - h / 2
    const top = cy + h / 2
    const z0 = -half
    // Window bottom edge lands nearest the wall; the top edge lands furthest out.
    const near = { dx: bottom * SUN_SLOPE.x, dz: bottom * SUN_SLOPE.z }
    const far = { dx: top * SUN_SLOPE.x, dz: top * SUN_SLOPE.z }
    const y = 0.004
    const xl = cx - w / 2
    const xr = cx + w / 2
    // prettier-ignore
    const pos = [
      xl + near.dx, y, z0 + near.dz,
      xr + near.dx, y, z0 + near.dz,
      xr + far.dx,  y, z0 + far.dz,
      xl + far.dx,  y, z0 + far.dz,
    ]
    // v = 1 at the window bottom edge so the texture's top row maps to the window top.
    const uv = [0, 0, 1, 0, 1, 1, 0, 1]
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3))
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    g.setIndex([0, 2, 1, 0, 3, 2])
    return g
  }, [])

  return <mesh geometry={geometry} material={materials.sunPatch} renderOrder={1} />
}
