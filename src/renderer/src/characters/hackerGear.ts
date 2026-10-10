import {
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

// The hacker scene puts a little gear on every character: neon glasses and a headset with a
// microphone. It is a plain (unskinned) group parented to the head bone, sized from a GearFrame
// (head-bone local metres) so it fits the chibi and each plush head.

export interface GearFrame {
  /** Eye centre: half spacing (x), height (y) above the head bone and how far forward (z). */
  eyeX: number
  eyeY: number
  eyeZ: number
  /** Radius of the eye (the glasses ring is a bit bigger). */
  eyeR: number
  /** Half width of the head at eye height, and height of its crown above the head bone. */
  headHalfW: number
  crown: number
  /** z of the front of the face, for the microphone tip. */
  faceZ: number
}

export interface HackerGear {
  group: Group
  dispose(): void
}

let cyan: MeshBasicMaterial | null = null
let magenta: MeshBasicMaterial | null = null
let shell: MeshStandardMaterial | null = null

function materials() {
  // toneMapped:false keeps the neon at full strength so the bloom pass picks it up.
  cyan ??= new MeshBasicMaterial({ color: '#19e3ff', toneMapped: false })
  magenta ??= new MeshBasicMaterial({ color: '#ff2bd6', toneMapped: false })
  shell ??= new MeshStandardMaterial({ color: '#171c2e', roughness: 0.45, metalness: 0.5 })
  return { cyan, magenta, shell }
}

/** Points on a super-ellipse arc over the head (rounded-box heads need n > 2 to stay outside). */
function crownPath(frame: GearFrame, lift: number): Vector3[] {
  const a = frame.headHalfW + lift
  const b = frame.crown - frame.eyeY + lift
  const n = 3
  const pts: Vector3[] = []
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * Math.PI
    const c = -Math.cos(t)
    const s = Math.sin(t)
    pts.push(
      new Vector3(Math.sign(c) * Math.abs(c) ** (2 / n) * a, frame.eyeY + s ** (2 / n) * b, 0),
    )
  }
  return pts
}

export function createHackerGear(frame: GearFrame): HackerGear {
  const m = materials()
  const group = new Group()
  group.name = 'hacker-gear'
  const geometries: BufferGeometry[] = []
  const add = (g: BufferGeometry, mat: MeshBasicMaterial | MeshStandardMaterial): Mesh => {
    geometries.push(g)
    const mesh = new Mesh(g, mat)
    group.add(mesh)
    return mesh
  }

  // Glasses: two glowing rings in front of the eyes, a bridge and thin temples to the headset.
  const ringR = frame.eyeR * 1.7
  const tube = Math.max(0.003, frame.eyeR * 0.14)
  for (const side of [-1, 1]) {
    const ring = add(new TorusGeometry(ringR, tube, 8, 28), m.cyan)
    ring.position.set(side * frame.eyeX, frame.eyeY, frame.eyeZ + tube * 2)
    const temple = new Vector3(side * (frame.headHalfW + 0.005), frame.eyeY, frame.eyeZ * 0.2)
    const start = new Vector3(side * (frame.eyeX + ringR), frame.eyeY, frame.eyeZ + tube * 2)
    const arm = add(
      new TubeGeometry(
        new CatmullRomCurve3([start, start.clone().lerp(temple, 0.5), temple]),
        8,
        tube * 0.7,
        6,
      ),
      m.cyan,
    )
    arm.renderOrder = 1
  }
  const bridge = add(
    new CylinderGeometry(tube * 0.8, tube * 0.8, frame.eyeX * 2 - ringR * 2 + tube * 4, 6),
    m.cyan,
  )
  bridge.rotation.z = Math.PI / 2
  bridge.position.set(0, frame.eyeY, frame.eyeZ + tube * 2)

  // Headset: dark band over the crown, ear cups with a neon rim, a boom mic with a magenta tip.
  add(new TubeGeometry(new CatmullRomCurve3(crownPath(frame, 0.012)), 40, 0.011, 8), m.shell)
  const cupR = Math.max(0.04, frame.headHalfW * 0.22)
  for (const side of [-1, 1]) {
    const x = side * (frame.headHalfW + 0.022)
    const cup = add(new CylinderGeometry(cupR, cupR, 0.036, 20), m.shell)
    cup.rotation.z = Math.PI / 2
    cup.position.set(x, frame.eyeY - cupR * 0.2, 0)
    const rim = add(new TorusGeometry(cupR * 0.82, 0.006, 6, 24), m.cyan)
    rim.rotation.y = Math.PI / 2
    rim.position.set(x + side * 0.019, frame.eyeY - cupR * 0.2, 0)
  }
  const cupX = -(frame.headHalfW + 0.02)
  const boom = new CatmullRomCurve3([
    new Vector3(cupX, frame.eyeY - cupR * 0.4, 0.01),
    new Vector3(cupX - 0.005, frame.eyeY - cupR * 1.6, frame.faceZ * 0.35),
    new Vector3(-frame.eyeX * 0.5, frame.eyeY - cupR * 2.1, frame.faceZ + 0.015),
  ])
  add(new TubeGeometry(boom, 16, 0.004, 6), m.shell)
  const tip = add(new SphereGeometry(0.011, 10, 8), m.magenta)
  tip.position.copy(boom.getPoint(1))

  return {
    group,
    dispose() {
      geometries.forEach((g) => g.dispose()) // the three shared materials live for the app's lifetime
    },
  }
}

/** Dark hoodie colours for the chibi in the hacker scene. */
const hackerStyles = new Map<object, object>()
export function hackerOutfit<T extends { shirt: string; pants: string; shoes: string }>(
  style: T,
): T {
  let out = hackerStyles.get(style) as T | undefined
  if (!out) {
    out = { ...style, shirt: '#151a29', pants: '#0b0e18', shoes: '#05060a' }
    hackerStyles.set(style, out)
  }
  return out
}
