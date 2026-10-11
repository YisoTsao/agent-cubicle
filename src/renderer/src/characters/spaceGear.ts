import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three'
import type { GearFrame } from './hackerGear'

// Space suit accessories shared by every character: a glass bubble helmet on a collar ring, a
// life-support backpack with hoses, and a chest control panel. They are plain meshes parented to
// the head and spine bones and sized from a GearFrame. (The suit itself is the character's
// clothing: white chibi outfit / inflated white skin on the plush figures.)

export interface SpaceGear {
  head: Group
  spine: Group
  dispose(): void
}

let white: MeshStandardMaterial | null = null
let orange: MeshStandardMaterial | null = null
let dark: MeshStandardMaterial | null = null
let steel: MeshStandardMaterial | null = null
let glass: MeshStandardMaterial | null = null
let cyan: MeshBasicMaterial | null = null
let green: MeshBasicMaterial | null = null
let amber: MeshBasicMaterial | null = null

function materials() {
  white ??= new MeshStandardMaterial({ color: '#f1f4f9', roughness: 0.5, metalness: 0.15 })
  orange ??= new MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.55 })
  dark ??= new MeshStandardMaterial({ color: '#1c212d', roughness: 0.5, metalness: 0.5 })
  steel ??= new MeshStandardMaterial({ color: '#8e98aa', roughness: 0.3, metalness: 0.85 })
  glass ??= new MeshStandardMaterial({
    color: '#bfe3ff',
    roughness: 0.04,
    metalness: 0.0,
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
  })
  cyan ??= new MeshBasicMaterial({ color: '#4de3ff', toneMapped: false })
  green ??= new MeshBasicMaterial({ color: '#43ff8a', toneMapped: false })
  amber ??= new MeshBasicMaterial({ color: '#ff9a1a', toneMapped: false })
  return { white, orange, dark, steel, glass, cyan, green, amber }
}

export function createSpaceGear(frame: GearFrame, headFromSpine: number): SpaceGear {
  const m = materials()
  const head = new Group()
  head.name = 'space-helmet'
  const spine = new Group()
  spine.name = 'space-pack'
  const geos: BufferGeometry[] = []
  const add = (parent: Group, g: BufferGeometry, mat: MeshStandardMaterial | MeshBasicMaterial) => {
    geos.push(g)
    const mesh = new Mesh(g, mat)
    parent.add(mesh)
    return mesh
  }

  // Helmet: a glass dome (cut off at the neck) and the collar ring it sits on.
  const { cy, rx, ry, rz } = frame.helmet
  const cut = 2.3 // polar angle where the dome stops
  const dome = add(head, new SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, cut), m.glass)
  dome.scale.set(rx, ry, rz)
  dome.position.set(0, cy, 0)
  dome.renderOrder = 5
  const rimY = cy + ry * Math.cos(cut)
  const rimScale = Math.sin(cut)
  const collar = add(head, new TorusGeometry(1, 0.1, 12, 40), m.white)
  collar.rotation.x = Math.PI / 2
  collar.scale.set(rx * rimScale, rz * rimScale, (frame.collarR * 0.32) / 0.1)
  collar.position.set(0, rimY, 0)
  const rim = add(head, new TorusGeometry(1, 0.03, 8, 40), m.orange)
  rim.rotation.x = Math.PI / 2
  rim.scale.set(rx * rimScale, rz * rimScale, 1)
  rim.position.set(0, rimY + 0.03, 0)
  for (const side of [-1, 1]) {
    const lamp = add(head, new SphereGeometry(0.018, 10, 8), m.cyan)
    lamp.position.set(side * rx * 0.97, cy + ry * 0.15, rz * 0.12)
  }

  // Life-support pack, hoses to the collar, chest panel.
  const { packY, backZ, frontZ, chestY, halfW } = frame.torso
  const pw = Math.min(0.32, halfW * 1.7)
  const ph = 0.38
  const pd = 0.11
  const pack = add(spine, new BoxGeometry(pw, ph, pd), m.white)
  pack.position.set(0, packY, backZ - pd / 2 + 0.01)
  for (const dy of [-0.12, 0.12]) {
    const band = add(spine, new BoxGeometry(pw + 0.01, 0.035, pd + 0.01), m.orange)
    band.position.set(0, packY + dy, backZ - pd / 2 + 0.01)
  }
  for (const side of [-1, 1]) {
    const nozzle = add(spine, new CylinderGeometry(0.03, 0.04, 0.07, 12), m.steel)
    nozzle.position.set(side * pw * 0.28, packY - ph / 2 - 0.03, backZ - pd / 2)
    const light = add(spine, new SphereGeometry(0.014, 8, 6), side < 0 ? m.green : m.amber)
    light.position.set(side * pw * 0.32, packY + ph / 2 - 0.05, backZ - pd - 0.002)
    const hose = new CatmullRomCurve3([
      new Vector3(side * pw * 0.3, packY + ph / 2, backZ - pd * 0.4),
      new Vector3(side * pw * 0.55, packY + ph / 2 + 0.1, backZ - 0.02),
      new Vector3(side * frame.collarR * 0.8, headFromSpine - 0.02, backZ * 0.3),
    ])
    add(spine, new TubeGeometry(hose, 14, 0.013, 6), m.dark)
  }
  const panel = add(spine, new BoxGeometry(0.17, 0.1, 0.022), m.dark)
  panel.position.set(0, chestY, frontZ + 0.008)
  const screen = add(spine, new BoxGeometry(0.1, 0.035, 0.004), m.cyan)
  screen.position.set(0.02, chestY + 0.022, frontZ + 0.02)
  ;[m.green, m.amber, m.cyan].forEach((mat, i) => {
    const b = add(spine, new SphereGeometry(0.009, 8, 6), mat)
    b.position.set(-0.05 + i * 0.03, chestY - 0.02, frontZ + 0.02)
  })

  return {
    head,
    spine,
    dispose() {
      geos.forEach((g) => g.dispose()) // materials are shared for the app's lifetime
    },
  }
}
