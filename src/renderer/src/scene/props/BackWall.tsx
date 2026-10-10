import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Group, InstancedMesh, Matrix4 } from 'three'
import { THEMES } from '../../config/themes'
import { useSettings } from '../../store/settings'
import { materials } from '../materials'
import { Block, Cyl } from '../primitives'
import { COFFEE_BAR, TERMINAL } from './layout'
import { Plant } from './Plant'
import { ROOM } from './Room'

// Back-right wall (z = -3): bookshelf (READ), terminal console + server rack (EXEC).

export { COFFEE_BAR, TERMINAL } from './layout'

const WALL_Z = -ROOM.half

export function BackWall() {
  return (
    <group>
      <Bookshelf />
      <CoffeeBar />
      <TerminalConsole />
      <ServerRack />
      <Plant position={[2.3, 0, -1.3]} scale={1.0} variant="tall" />
    </group>
  )
}

function Bookshelf() {
  const w = 1.0
  const h = 1.85
  const d = 0.36
  const shelves = 4
  return (
    <group position={[-2.0, 0, WALL_Z + d / 2 + 0.01]}>
      <Block
        size={[w, h, 0.03]}
        position={[0, h / 2, -d / 2 + 0.015]}
        material={materials.woodMid}
        radius={0.01}
      />
      <Block
        size={[0.04, h, d]}
        position={[-w / 2 + 0.02, h / 2, 0]}
        material={materials.woodLight}
        radius={0.012}
      />
      <Block
        size={[0.04, h, d]}
        position={[w / 2 - 0.02, h / 2, 0]}
        material={materials.woodLight}
        radius={0.012}
      />
      {Array.from({ length: shelves + 1 }, (_, i) => (
        <Block
          key={i}
          size={[w, 0.035, d]}
          position={[0, 0.04 + (i * (h - 0.06)) / shelves, 0]}
          material={materials.woodLight}
          radius={0.01}
        />
      ))}
      <Books shelfWidth={w - 0.1} shelfStep={(h - 0.06) / shelves} shelves={shelves} depth={d} />
      <Plant position={[0.3, h + 0.02, 0]} scale={0.3} variant="succulent" />
    </group>
  )
}

/** Number of distinct spine colours a theme provides (layout stores an index into them). */
const BOOK_COLOR_COUNT = 7

/** All books are one InstancedMesh → a single draw call (SPEC §6). */
function Books({
  shelfWidth,
  shelfStep,
  shelves,
  depth,
}: {
  shelfWidth: number
  shelfStep: number
  shelves: number
  depth: number
}) {
  const ref = useRef<InstancedMesh>(null)
  const bookColors = THEMES[useSettings((s) => s.scene)].bookColors
  const layout = useMemo(
    () => buildBookLayout(shelfWidth, shelfStep, shelves, depth),
    [shelfWidth, shelfStep, shelves, depth],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const c = new Color()
    layout.forEach((b, i) => {
      mesh.setMatrixAt(i, bookMatrix(b))
      mesh.setColorAt(i, c.set(bookColors[b.color % bookColors.length]!))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [layout, bookColors])

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, layout.length]}
      castShadow
      receiveShadow
      material={materials.book}
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  )
}

interface BookSpec {
  x: number
  y: number
  w: number
  h: number
  d: number
  tilt: number
  /** Index into the theme's book colours. */
  color: number
}

function bookMatrix(b: BookSpec): Matrix4 {
  const t = new Matrix4().makeTranslation(b.x, b.y, 0)
  const r = new Matrix4().makeRotationZ(b.tilt)
  const s = new Matrix4().makeScale(b.w, b.h, b.d)
  return t.multiply(r).multiply(s)
}

function buildBookLayout(width: number, step: number, shelves: number, depth: number): BookSpec[] {
  let seed = 11
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const books: BookSpec[] = []
  for (let s = 0; s < shelves; s++) {
    const baseY = 0.06 + s * step
    let x = -width / 2
    const end = width / 2 - (s % 2 ? 0.25 : 0.05) // leave gaps for a cozy, lived-in look
    while (x < end) {
      const w = 0.035 + rand() * 0.03
      const h = 0.2 + rand() * 0.1
      const lean = x + w > end - 0.05 && rand() > 0.4
      books.push({
        x: x + w / 2,
        y: baseY + h / 2,
        w,
        h,
        d: depth * (0.7 + rand() * 0.15),
        tilt: lean ? -0.25 : 0,
        color: Math.floor(rand() * BOOK_COLOR_COUNT),
      })
      x += w + 0.004
      if (lean) break
    }
  }
  return books
}

function CoffeeBar() {
  const w = 1.2
  const h = 0.78
  const d = 0.42
  return (
    <group position={[COFFEE_BAR.stand[0], 0, WALL_Z + d / 2 + 0.01]}>
      <Block
        size={[w, h - 0.08, d]}
        position={[0, (h - 0.08) / 2 + 0.08, 0]}
        material={materials.woodLight}
        radius={0.025}
      />
      <Block
        size={[w + 0.04, 0.04, d + 0.03]}
        position={[0, h + 0.02, 0.01]}
        material={materials.woodDark}
        radius={0.012}
      />
      {/* Cabinet doors + handles */}
      {[-0.3, 0.3].map((x) => (
        <group key={x}>
          <Block
            size={[w / 2 - 0.05, h - 0.2, 0.02]}
            position={[x, (h - 0.08) / 2 + 0.08, d / 2 + 0.005]}
            material={materials.woodMid}
            radius={0.008}
            castShadow={false}
          />
          <Cyl
            args={[0.012, 0.012, 0.1, 10]}
            position={[x + (x < 0 ? 0.2 : -0.2), 0.5, d / 2 + 0.03]}
            material={materials.metal}
            castShadow={false}
          />
        </group>
      ))}
      {/* Legs */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Cyl
            key={`${sx}${sz}`}
            args={[0.02, 0.016, 0.08, 10]}
            position={[sx * (w / 2 - 0.06), 0.04, sz * (d / 2 - 0.06)]}
            material={materials.woodDark}
          />
        )),
      )}
      <group position={[0, h + 0.04, 0]}>
        <CoffeeMachine />
        {[0.08, 0.16].map((x, i) => (
          <Cyl
            key={x}
            args={[0.035, 0.03, 0.08]}
            position={[x, 0.04, 0.08 + i * 0.03]}
            material={i ? materials.ceramic : materials.terracottaPot}
          />
        ))}
        {/* Jar + small plant */}
        <Cyl args={[0.05, 0.05, 0.14]} position={[0.3, 0.07, -0.06]} material={materials.ceramic} />
        <Cyl
          args={[0.052, 0.052, 0.025]}
          position={[0.3, 0.15, -0.06]}
          material={materials.woodMid}
        />
        <Plant position={[0.48, 0, 0.02]} scale={0.3} variant="succulent" />
      </group>
    </group>
  )
}

function CoffeeMachine() {
  return (
    <group position={[-0.3, 0, -0.02]}>
      <Block
        size={[0.26, 0.34, 0.26]}
        position={[0, 0.17, -0.02]}
        material={materials.charcoal}
        radius={0.04}
      />
      <Block
        size={[0.24, 0.04, 0.2]}
        position={[0, 0.02, 0.06]}
        material={materials.metal}
        radius={0.01}
      />
      <Block
        size={[0.12, 0.06, 0.08]}
        position={[0, 0.24, 0.12]}
        material={materials.metal}
        radius={0.02}
      />
      <Cyl args={[0.035, 0.03, 0.07]} position={[0, 0.075, 0.08]} material={materials.ceramic} />
      <Cyl
        args={[0.012, 0.012, 0.008, 10]}
        position={[0.08, 0.3, 0.115]}
        rotation={[Math.PI / 2, 0, 0]}
        material={materials.ledAmber}
        castShadow={false}
      />
    </group>
  )
}

const CONSOLE = {
  h: 0.82, // chibi-height standing console
  z: WALL_Z + 0.3,
  monitors: [
    { x: -0.26, yaw: 0.18 },
    { x: 0.26, yaw: -0.18 },
  ],
}

function TerminalConsole() {
  const [sx] = TERMINAL.stand
  const { h } = CONSOLE
  return (
    <group position={[sx, 0, CONSOLE.z]}>
      <Block
        size={[1.1, 0.05, 0.5]}
        position={[0, h, 0]}
        material={materials.woodDark}
        radius={0.015}
      />
      <Block
        size={[0.05, h, 0.42]}
        position={[-0.5, h / 2, 0]}
        material={materials.charcoal}
        radius={0.015}
      />
      <Block
        size={[0.05, h, 0.42]}
        position={[0.5, h / 2, 0]}
        material={materials.charcoal}
        radius={0.015}
      />
      {/* Dual monitors facing +z (towards the camera side) */}
      {CONSOLE.monitors.map(({ x, yaw }) => (
        <group key={x} position={[x, h + 0.03, -0.08]} rotation={[0, yaw, 0]}>
          <Block
            size={[0.06, 0.2, 0.04]}
            position={[0, 0.1, -0.02]}
            material={materials.charcoal}
            radius={0.01}
          />
          <Block
            size={[0.5, 0.32, 0.035]}
            position={[0, 0.34, 0]}
            material={materials.charcoal}
            radius={0.012}
          />
        </group>
      ))}
      <Block
        size={[0.4, 0.016, 0.13]}
        position={[0, h + 0.033, 0.14]}
        material={materials.charcoal}
        radius={0.006}
      />
    </group>
  )
}

/**
 * Live terminal screens (outside StaticBatch). When `active`, the "code" lines scroll and glow;
 * otherwise they sit dim.
 */
export function TerminalScreens({ active }: { active: boolean }) {
  const [sx] = TERMINAL.stand
  return (
    <group position={[sx, 0, CONSOLE.z]}>
      {CONSOLE.monitors.map(({ x, yaw }, i) => (
        <group key={x} position={[x, CONSOLE.h + 0.03, -0.08]} rotation={[0, yaw, 0]}>
          <mesh position={[0, 0.34, 0.019]} material={materials.terminalScreen}>
            <planeGeometry args={[0.46, 0.28]} />
          </mesh>
          <TerminalLines active={active} seed={i} />
        </group>
      ))}
    </group>
  )
}

const LINE_LENGTHS = [0.32, 0.18, 0.26, 0.12, 0.3, 0.2, 0.24, 0.1, 0.28]
const VISIBLE_LINES = 6

/** Glowing "code" bars; scrolls by cycling which lengths are shown. */
function TerminalLines({ active, seed }: { active: boolean; seed: number }) {
  const group = useRef<Group>(null)
  const offset = useRef(seed * 3)
  useFrame((_, delta) => {
    const g = group.current
    if (!g || !active) return
    offset.current += delta * 6
    const start = Math.floor(offset.current)
    g.children.forEach((child, i) => {
      const len = LINE_LENGTHS[(start + i) % LINE_LENGTHS.length]!
      child.scale.x = len
      child.position.x = len / 2
    })
  })
  return (
    <group ref={group} position={[-0.2, 0.44, 0.021]}>
      {LINE_LENGTHS.slice(0, VISIBLE_LINES).map((len, i) => (
        <mesh
          key={i}
          position={[len / 2, -i * 0.038, 0]}
          scale={[len, 1, 1]}
          material={active ? materials.terminalText : materials.terminalTextDim}
        >
          <planeGeometry args={[1, 0.014]} />
        </mesh>
      ))}
    </group>
  )
}

function ServerRack() {
  const h = 1.9
  return (
    <group position={[2.15, 0, WALL_Z + 0.38]}>
      <Block
        size={[0.66, h, 0.7]}
        position={[0, h / 2, 0]}
        material={materials.charcoal}
        radius={0.03}
      />
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i} position={[0, 0.3 + i * 0.26, 0.352]}>
          <Block
            size={[0.56, 0.2, 0.02]}
            material={materials.rackPanel}
            radius={0.01}
            castShadow={false}
          />
          <Cyl
            args={[0.014, 0.014, 0.012, 10]}
            position={[0.2, 0, 0.012]}
            rotation={[Math.PI / 2, 0, 0]}
            material={i % 3 === 2 ? materials.ledAmber : materials.led}
            castShadow={false}
          />
          <Cyl
            args={[0.014, 0.014, 0.012, 10]}
            position={[0.24, 0, 0.012]}
            rotation={[Math.PI / 2, 0, 0]}
            material={materials.led}
            castShadow={false}
          />
          {[-0.2, -0.14, -0.08, -0.02].map((x) => (
            <Block
              key={x}
              size={[0.035, 0.12, 0.012]}
              position={[x, 0, 0.012]}
              material={materials.charcoal}
              radius={0.004}
              castShadow={false}
            />
          ))}
        </group>
      ))}
      <Cyl args={[0.05, 0.05, 0.06]} position={[0, h + 0.03, 0]} material={materials.metal} />
    </group>
  )
}
