import {
  BufferGeometry,
  Color,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Matrix4,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  SplineCurve,
  Uint16BufferAttribute,
  Vector2,
  Vector3,
  type Material,
} from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildBodyShell, frontZ, shellGeometry, type BodyShell } from './plushBody'
import type { RigProfile } from './profile'
import { BONE_NAMES, createBones, restPosition, type BoneName, type BoneRest } from './skeleton'

// Plush figures (the "mojojojo" flocked toys): a stubby pear-shaped body with bulging arms and a
// notch between two short legs, plus a head that differs per character. Built as ONE SkinnedMesh
// (a few material groups) on the shared 18-bone skeleton, so every animation clip role keeps
// working; only the proportions (RigProfile) differ from the chibi.
//
// All shapes are authored in "reference pixels": the coordinates of the 600×663 product photo of
// the yellow duck (axis x = 303, floor y = 612, head bottom y = 257), converted to metres by `K`.
// The silhouette tables below were measured from that photo, row by row.

/** Metres per reference pixel. */
export const K = 0.0018
const AXIS_X = 303
const FLOOR_Y = 612
const HEAD_BOTTOM_Y = 257

const X = (px: number) => (px - AXIS_X) * K
const Y = (py: number) => (FLOOR_Y - py) * K

type V3 = [number, number, number]
type Pt = [number, number]

// ---------------------------------------------------------------------------------------------
// Shared body (identical on every figure in the series)

/**
 * Whole-body silhouette (shoulders and the arms' bulges included), measured row by row from the
 * photo. This is the visible skin: one continuous surface, like the real toy. The arms are the
 * parts of it that follow the arm bones (see `skinBody`).
 */
const BODY: Pt[] = [
  [0, 246],
  [60, 248],
  [96, 252],
  [105, 258],
  [114.5, 264],
  [138.5, 276],
  [160.5, 288],
  [176.5, 300],
  [188.5, 312],
  [199, 324],
  [206.5, 336],
  [211, 348],
  [215, 360],
  [217, 372],
  [217, 384],
  [215.5, 396],
  [212.5, 408],
  [207, 420],
  [195, 432],
  [176, 440],
  [160, 447],
  [157, 458],
  [157, 540],
  [153, 556],
  [140, 566],
  [100, 572],
  [50, 574],
  [0, 575],
]

/** Narrow torso hidden inside the body; it stays put when the arms' skin moves away. */
const CORE: Pt[] = [
  [0, 252],
  [70, 254],
  [105, 260],
  [118, 268],
  [128, 282],
  [133, 300],
  [131, 330],
  [126, 360],
  [124, 400],
  [128, 430],
  [142, 450],
  [152, 470],
  [152, 490],
  [146, 510],
  [124, 528],
  [76, 538],
  [0, 541],
]

/** Where the arms hang: pivot x (px from the axis) used to decide which skin follows the arms. */
const ARM_AXIS = 150
const ELBOW_Y = 372
const SHOULDER_Y = 300
const KNEE_Y = 549

const LEG: Pt[] = [
  [0, 440],
  [28, 446],
  [50, 462],
  [64, 482],
  [70, 500],
  [73, 520],
  [74, 550],
  [73, 566],
  [71, 576],
  [64, 588],
  [52, 600],
  [34, 608],
  [14, 612],
  [0, 613],
]
const LEG_AXIS = 82

let shellCache: BodyShell | null = null
/** The shared body cushion (identical on every figure; built once, ~0.1 s). */
function bodyShell(): BodyShell {
  shellCache ??= buildBodyShell({
    upper: BODY,
    leg: LEG,
    legAxis: LEG_AXIS,
    thickness: 106,
    rim: 92,
    rimPower: 2.3,
    soften: 5,
    neck: { y: 250, full: 300, thickness: 44 },
  })
  return shellCache
}

/** Half-thickness (front to back) of the flat-fronted body, px; the legs sit just inside it. */
const BODY_Z = 112
const CORE_Z = 100
const LEG_Z = 101
/** The body's thickness eases from BODY_Z down to LEG_Z over the hips so it meets the legs flush. */
const bodyZ = (yPx: number) =>
  BODY_Z - (BODY_Z - LEG_Z) * Math.min(1, Math.max(0, (yPx - 470) / 70))
/** Superellipse exponent of the body's cross-section (2 = round). */
const BODY_SQUARE = 3.2

// ---------------------------------------------------------------------------------------------
// Design description

export type MatKind = 'fur' | 'gloss' | 'plastic'

export interface PlushDesign {
  id: string
  /** Fur colour (sRGB hex). */
  fur: string
  /** Head silhouette: [half-width, height above the head bottom] in reference pixels. */
  head: Pt[]
  /** Lathe heads: front-to-back depth relative to width. */
  headDepth: number
  /**
   * Heads that are not round (the others in the series) are soft cushions in the outline given by
   * `head`, optionally with a cut-out between two ears; the duck's round head is a lathe.
   */
  cushion?: { hole?: Pt[]; thickness: number; rim: number }
  /** 0 = flat flocking, 1 = long shaggy strands (Belle). */
  shaggy?: number
  /** Optional different colour for the head (defaults to `fur`). */
  headFur?: string
  /** Eye bone offset from the head bone: x half-spacing and height above the head bottom (px). */
  eye: { x: number; y: number }
  /** Builds face features and ears; coordinates are head-local reference pixels. */
  features(ctx: FeatureCtx): void
}

export interface FeatureCtx {
  /** z (in px) of the head surface at head-local (x, y). */
  surfaceZ(x: number, y: number): number
  ellipsoid(o: EllipsoidOpts): void
  heart(o: HeartOpts): void
  /** Thin tube between two head-local points (whiskers). */
  tube(o: { bone?: BoneName; a: V3; b: V3; r: number; color: string; mat?: MatKind }): void
}

interface EllipsoidOpts {
  bone?: BoneName
  /** Head-local px: x right, y up from the head bottom, z forward. */
  at: V3
  radii: V3
  color: string
  mat?: MatKind
  rot?: V3
  /** Use fur noise (ears) instead of a smooth finish. */
  furry?: boolean
}

interface HeartOpts {
  at: V3
  width: number
  color: string
  mat?: MatKind
  tilt?: number
}

// ---------------------------------------------------------------------------------------------
// Skeleton profile for a design

export function plushBones(design: PlushDesign): BoneRest {
  const hips: V3 = [0, Y(457), 0]
  const eyeZ = surfaceZ(design, design.eye.x, design.eye.y) * K
  const eyeOffset = (side: 1 | -1): V3 => [side * design.eye.x * K, design.eye.y * K, eyeZ]
  return {
    hips: { parent: null, offset: hips },
    spine: { parent: 'hips', offset: [0, 0.06, 0] },
    neck: { parent: 'spine', offset: [0, 0.3, 0] },
    head: { parent: 'neck', offset: [0, Y(HEAD_BOTTOM_Y) - (hips[1] + 0.36), 0] },
    eye_L: { parent: 'head', offset: eyeOffset(1) },
    eye_R: { parent: 'head', offset: eyeOffset(-1) },
    upperArm_L: { parent: 'spine', offset: [ARM_AXIS * K, Y(SHOULDER_Y) - (hips[1] + 0.06), 0] },
    forearm_L: { parent: 'upperArm_L', offset: [0, -(372 - 300) * K, 0] },
    hand_L: { parent: 'forearm_L', offset: [0, -(445 - 372) * K, 0] },
    upperArm_R: { parent: 'spine', offset: [-ARM_AXIS * K, Y(SHOULDER_Y) - (hips[1] + 0.06), 0] },
    forearm_R: { parent: 'upperArm_R', offset: [0, -(372 - 300) * K, 0] },
    hand_R: { parent: 'forearm_R', offset: [0, -(445 - 372) * K, 0] },
    thigh_L: { parent: 'hips', offset: [LEG_AXIS * K, -0.06, 0] },
    shin_L: { parent: 'thigh_L', offset: [0, -(549 - 487) * K, 0] },
    foot_L: { parent: 'shin_L', offset: [0, -(612 - 549) * K, 0] },
    thigh_R: { parent: 'hips', offset: [-LEG_AXIS * K, -0.06, 0] },
    shin_R: { parent: 'thigh_R', offset: [0, -(549 - 487) * K, 0] },
    foot_R: { parent: 'shin_R', offset: [0, -(612 - 549) * K, 0] },
  }
}

export function plushProfile(design: PlushDesign): RigProfile {
  return {
    id: `plush-${design.id}`,
    bones: plushBones(design),
    limb: { upperArm: 0.19, forearm: 0.18 },
    restLimb: { upperArm: (372 - 300) * K, forearm: (445 - 372) * K },
    posture: {
      sit: { hipsY: 0.66, hipsZ: -0.05, lean: 0.1 },
      sofa: { hipsY: 0.64, hipsZ: -0.06, lean: -0.2 },
      stand: { hipsY: Y(457), hipsZ: 0, lean: 0.03 },
    },
    walkSwing: 1.5,
    tagHeight: 0.6,
    overlayHeight: 0.84,
    overlaySize: 0.36,
    legs: { sit: [-1.5, 0.15, 0.12], sofa: [-1.42, 0.2, 0.14] },
  }
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers

interface Part {
  geometry: BufferGeometry
  mat: MatKind
  /** Skin: single bone, or a blend along model-space height. */
  skin:
    | { bone: BoneName }
    | { upper: BoneName; lower: BoneName; y: number; blend: number }
    | { body: true }
  color: string
  /** Fur parts get smooth shading (+ displacement when shaggy). */
  fur?: boolean
  /** Already smooth, indexed, with field normals (the body shell). */
  shell?: boolean
  shaggy?: number
}

const BONE_INDEX = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i])) as Record<BoneName, number>

/**
 * Smooth closed profile → lathe about the y axis. Model space (metres).
 * `square` (n ≥ 2) pushes the round cross-section towards a rounded box (superellipse of
 * exponent n) without changing the front or side extents — the toys have flat-ish fronts.
 */
function lathePart(
  profile: Pt[],
  axisX: number,
  depth: number,
  segments = 56,
  square = 2,
  maxZ: number | ((yPx: number) => number) = Infinity,
): BufferGeometry {
  const curve = new SplineCurve(profile.map(([hw, y]) => new Vector2(hw, y)))
  const pts = curve
    .getSpacedPoints(Math.max(60, profile.length * 6))
    .map((p) => new Vector2(Math.max(0, p.x) * K, Y(p.y)))
  const geo = new LatheGeometry(pts, segments)
  if (square > 2) {
    const pos = geo.attributes['position']!
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const r = Math.hypot(x, z)
      if (r < 1e-9) continue
      const c = Math.abs(x / r)
      const sn = Math.abs(z / r)
      const f = (c ** square + sn ** square) ** (-1 / square)
      pos.setX(i, x * f)
      pos.setZ(i, z * f)
    }
  }
  // Depth: `depth` × width, capped at `maxZ` px (a flat-fronted cushion, not an ellipsoid).
  const zpos = geo.attributes['position']!
  for (let i = 0; i < zpos.count; i++) {
    const r = Math.hypot(zpos.getX(i), zpos.getZ(i))
    if (r < 1e-9) continue
    const cap = typeof maxZ === 'number' ? maxZ : maxZ(FLOOR_Y - zpos.getY(i) / K)
    zpos.setZ(i, zpos.getZ(i) * Math.min(depth, (cap * K) / r))
  }
  geo.translate(X(axisX), 0, 0)
  return geo
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Deterministic value noise (no Math.random: a figure must look identical on every launch).
function hash(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const fx = x - xi
  const fy = y - yi
  const fz = z - zi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const w = fz * fz * (3 - 2 * fz)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz)
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  )
}

/**
 * Smooth shading (shared vertices) and, for shaggy fur, a ragged outline. The fine speckle and
 * the strand streaks live in the fur material's fragment shader (see `furMaterial`), so they stay
 * crisp whatever the mesh density.
 */
function furFinish(
  geo: BufferGeometry,
  base: Color,
  shaggy: number,
  shell = false,
): BufferGeometry {
  geo.deleteAttribute('uv')
  let merged = geo
  if (!shell) {
    geo.deleteAttribute('normal')
    merged = mergeVertices(geo, 1e-5)
    merged.computeVertexNormals()
  }
  const pos = merged.attributes['position']!
  const nor = merged.attributes['normal']!
  if (shaggy > 0) {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const strand = vnoise(x * 95, y * 7, z * 95)
      const fine = vnoise(x * 260, y * 22, z * 260)
      const d = (strand - 0.5) * 0.007 * shaggy + (fine - 0.5) * 0.004 * shaggy
      pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d)
    }
    merged.computeVertexNormals()
  }
  return flatColor(merged, base)
}

function flatColor(geo: BufferGeometry, color: Color): BufferGeometry {
  const n = geo.attributes['position']!.count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3)
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geo
}

/** Skin weights from the part's rule, evaluated at each vertex's (rest) height. */
function applySkin(geo: BufferGeometry, part: Part): void {
  const n = geo.attributes['position']!.count
  const pos = geo.attributes['position']!
  const idx = new Uint16Array(n * 4)
  const w = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    if ('body' in part.skin) {
      skinBody(pos.getX(i), pos.getY(i), idx, w, i)
    } else if ('bone' in part.skin) {
      idx[i * 4] = BONE_INDEX[part.skin.bone]
      w[i * 4] = 1
    } else {
      const { upper, lower, y, blend } = part.skin
      const t = smoothstep(y + blend, y - blend, pos.getY(i)) // 0 above the joint → 1 below
      idx[i * 4] = BONE_INDEX[upper]
      idx[i * 4 + 1] = BONE_INDEX[lower]
      w[i * 4] = 1 - t
      w[i * 4 + 1] = t
    }
  }
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4))
  geo.setAttribute('skinWeight', new Float32BufferAttribute(w, 4))
}

/** Flocked velvet / shaggy fur: object-space noise in the fragment shader over a sheen layer. */
function furMaterial(design: PlushDesign): MeshPhysicalMaterial {
  const shaggy = design.shaggy ?? 0
  const material = new MeshPhysicalMaterial({
    name: 'plush-fur',
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    sheen: 0.3,
    sheenRoughness: 0.5,
    sheenColor: new Color(design.fur).lerp(new Color('#ffffff'), 0.6),
  })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFurPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurPos = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vFurPos;
float furHash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}
float furNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(furHash(i), furHash(i + vec3(1, 0, 0)), f.x),
        mix(furHash(i + vec3(0, 1, 0)), furHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(furHash(i + vec3(0, 0, 1)), furHash(i + vec3(1, 0, 1)), f.x),
        mix(furHash(i + vec3(0, 1, 1)), furHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 p = vFurPos;
  float shag = ${shaggy.toFixed(3)};
  float tint;
  if (shag > 0.0) {
    float strand = furNoise(vec3(p.x * 95.0, p.y * 7.0, p.z * 95.0));
    float fine = furNoise(vec3(p.x * 260.0, p.y * 22.0, p.z * 260.0));
    tint = 1.0 + (strand - 0.5) * 0.18 * shag + (fine - 0.5) * 0.10 * shag;
  } else {
    float speck = furNoise(p * 520.0);
    float cloud = furNoise(p * 70.0);
    tint = 0.94 + speck * 0.10 + (cloud - 0.5) * 0.05;
  }
  diffuseColor.rgb *= tint;
}`,
      )
  }
  return material
}

/**
 * Skin weights for the whole-body cushion. Beyond the core torso, between shoulder and hand, the
 * skin follows the arm bones (upper arm → forearm around the elbow); below the hips it follows
 * the thigh / shin of the side it is on; everything else follows the spine / hips by height.
 */
function skinBody(x: number, y: number, idx: Uint16Array, w: Float32Array, i: number): void {
  const xs = x / K
  const xp = Math.abs(xs)
  const yp = FLOOR_Y - y / K
  const side = xs >= 0 ? 'L' : 'R'
  const arm =
    smoothstep(135, 176, xp) *
    smoothstep(SHOULDER_Y - 18, SHOULDER_Y + 12, yp) *
    (1 - smoothstep(436, 452, yp))
  const leg = smoothstep(474, 514, yp)
  const elbow = smoothstep(ELBOW_Y - 16, ELBOW_Y + 16, yp) // 0 above the elbow → 1 below
  const knee = smoothstep(KNEE_Y - 16, KNEE_Y + 16, yp)
  const hipBlend = 1 - smoothstep(Y(520), Y(420), y) // 1 low (hips) → 0 high (spine)
  const torso = Math.max(0, 1 - arm - leg)
  const left = smoothstep(-16, 16, xs) // between the legs
  const cand: [BoneName, number][] = [
    [`upperArm_${side}` as BoneName, arm * (1 - elbow)],
    [`forearm_${side}` as BoneName, arm * elbow],
    ['spine', torso * (1 - hipBlend)],
    ['hips', torso * hipBlend],
    ['thigh_L', leg * left * (1 - knee)],
    ['shin_L', leg * left * knee],
    ['thigh_R', leg * (1 - left) * (1 - knee)],
    ['shin_R', leg * (1 - left) * knee],
  ]
  cand.sort((a, b) => b[1] - a[1])
  const top = cand.slice(0, 4)
  const sum = top.reduce((acc, [, v]) => acc + v, 0) || 1
  for (let k = 0; k < 4; k++) {
    idx[i * 4 + k] = BONE_INDEX[top[k]![0]]
    w[i * 4 + k] = top[k]![1] / sum
  }
}

function heartGeometry(width: number, thickness: number): BufferGeometry {
  const shape = new Shape()
  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  const geo = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.5,
    bevelSize: 0.6,
    bevelSegments: 2,
    curveSegments: 6,
  })
  geo.center()
  const s = width / 32
  geo.scale(s, s, 1)
  return geo
}

/** Radius (px) of the head lathe at height h above the head bottom. */
function headRadius(design: PlushDesign, h: number): number {
  const p = design.head
  if (h <= p[0]![1]) return p[0]![0]
  for (let i = 1; i < p.length; i++) {
    const [r1, h1] = p[i]!
    const [r0, h0] = p[i - 1]!
    if (h <= h1) return r0 + ((r1 - r0) * (h - h0)) / Math.max(1e-6, h1 - h0)
  }
  return 0
}

/** Cushion head shell and its front-surface lookup, built once per design. */
const headShells = new Map<string, { shell: BodyShell; z: (x: number, y: number) => number }>()

function headShell(design: PlushDesign): { shell: BodyShell; z: (x: number, y: number) => number } {
  let entry = headShells.get(design.id)
  if (!entry) {
    const c = design.cushion!
    const rows = (t: Pt[]): Pt[] => t.map(([hw, h]): Pt => [hw, HEAD_BOTTOM_Y - h]).reverse()
    const shell = buildBodyShell({
      upper: rows(design.head),
      ...(c.hole ? { hole: rows(c.hole) } : {}),
      thickness: c.thickness,
      rim: c.rim,
      rimPower: 2.3,
      soften: 8,
    })
    entry = { shell, z: frontZ(shell) }
    headShells.set(design.id, entry)
  }
  return entry
}

/** z (px) of the head's front surface at head-local x and height h. */
function surfaceZ(design: PlushDesign, x: number, h: number): number {
  if (design.cushion) return headShell(design).z(x, HEAD_BOTTOM_Y - h)
  const r = headRadius(design, h)
  return design.headDepth * Math.sqrt(Math.max(0, r * r - x * x))
}

// ---------------------------------------------------------------------------------------------
// Build

export interface PlushRig {
  root: Group
  mesh: SkinnedMesh
  bones: ReturnType<typeof createBones>
  profile: RigProfile
  dispose(): void
}

export function buildPlushRig(design: PlushDesign): PlushRig {
  const profile = plushProfile(design)
  const rest = profile.bones
  const parts: Part[] = []
  const shaggy = design.shaggy ?? 0

  const headOrigin: V3 = restPosition('head', rest)
  const hipsY = rest.hips.offset[1]

  // Body: one soft cushion in the toy's silhouette (arms, legs and notch included), over a hidden
  // core torso that stays behind when the arms' skin swings away.
  parts.push({
    geometry: shellGeometry(bodyShell(), (x, y, z) => [x * K, (FLOOR_Y - y) * K, z * K]),
    mat: 'fur',
    skin: { body: true },
    color: design.fur,
    fur: true,
    shell: true,
    shaggy,
  })
  parts.push({
    geometry: lathePart(CORE, AXIS_X, 1, 48, BODY_SQUARE, (y) => Math.min(CORE_Z, bodyZ(y) - 8)),
    mat: 'fur',
    skin: { upper: 'spine', lower: 'hips', y: hipsY + 0.1, blend: 0.1 },
    color: design.fur,
    fur: true,
    shaggy,
  })

  // Head: a lathe sphere (duck) or a cushion in the outline of `design.head`.
  if (design.cushion) {
    parts.push({
      geometry: shellGeometry(headShell(design).shell, (x, y, z) => [
        x * K,
        (FLOOR_Y - y) * K,
        z * K,
      ]),
      mat: 'fur',
      skin: { bone: 'head' },
      color: design.headFur ?? design.fur,
      fur: true,
      shell: true,
      shaggy,
    })
  } else {
    const headProfile: Pt[] = design.head.map(([hw, h]) => [hw, HEAD_BOTTOM_Y - h])
    parts.push({
      geometry: lathePart(headProfile, AXIS_X, design.headDepth, 64),
      mat: 'fur',
      skin: { bone: 'head' },
      color: design.headFur ?? design.fur,
      fur: true,
      shaggy,
    })
  }

  // Features, in head-local px → model space
  const toModel = (p: V3): V3 => [p[0] * K, headOrigin[1] + p[1] * K, p[2] * K]
  const matOf = (m?: MatKind): MatKind => m ?? 'plastic'
  const ctx: FeatureCtx = {
    surfaceZ: (x, y) => surfaceZ(design, x, y),
    ellipsoid({ bone = 'head', at, radii, color, mat, rot, furry }) {
      const g = new SphereGeometry(1, 28, 20)
      const m = new Matrix4().compose(
        new Vector3(...toModel(at)),
        new Quaternion().setFromEuler(new Euler(...(rot ?? [0, 0, 0]))),
        new Vector3(radii[0] * K, radii[1] * K, radii[2] * K),
      )
      g.applyMatrix4(m)
      parts.push({
        geometry: g,
        mat: furry ? 'fur' : matOf(mat),
        skin: { bone },
        color,
        ...(furry ? { fur: true, shaggy } : {}),
      })
    },
    heart({ at, width, color, mat, tilt = 0 }) {
      const g = heartGeometry(width * K, 5 * K)
      g.applyMatrix4(
        new Matrix4().compose(
          new Vector3(...toModel(at)),
          new Quaternion().setFromEuler(new Euler(-tilt, 0, 0)),
          new Vector3(1, 1, 1),
        ),
      )
      parts.push({ geometry: g, mat: matOf(mat), skin: { bone: 'head' }, color })
    },
    tube({ bone = 'head', a, b, r, color, mat }) {
      const pa = new Vector3(...toModel(a))
      const pb = new Vector3(...toModel(b))
      const len = pa.distanceTo(pb)
      const g = new SphereGeometry(1, 8, 6)
      // A stretched ellipsoid reads as a thin tube at this size and costs almost nothing.
      g.scale(r * K, len / 2, r * K)
      g.applyQuaternion(
        new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), pb.clone().sub(pa).normalize()),
      )
      const mid = pa.add(pb).multiplyScalar(0.5)
      g.translate(mid.x, mid.y, mid.z)
      parts.push({ geometry: g, mat: matOf(mat), skin: { bone }, color })
    },
  }
  design.features(ctx)

  // Bake: colour, skin, then merge per material.
  const byMat: Record<MatKind, BufferGeometry[]> = { fur: [], gloss: [], plastic: [] }
  for (const part of parts) {
    let g = part.geometry
    if (part.fur) {
      g = furFinish(g, new Color(part.color), part.shaggy ?? 0, part.shell ?? false)
    } else {
      g.deleteAttribute('uv')
      flatColor(g, new Color(part.color))
    }
    applySkin(g, part)
    byMat[part.mat].push(g)
  }
  const merged: BufferGeometry[] = []
  const kinds: MatKind[] = []
  for (const kind of ['fur', 'gloss', 'plastic'] as const) {
    const list = byMat[kind]
    if (list.length === 0) continue
    const g = mergeGeometries(list.map(stripToCommon), false)
    if (!g) throw new Error(`plush ${design.id}: failed to merge ${kind}`)
    list.forEach((l) => l.dispose())
    merged.push(g)
    kinds.push(kind)
  }
  const geometry = mergeGeometries(merged, true)
  if (!geometry) throw new Error(`plush ${design.id}: failed to merge`)
  merged.forEach((g) => g.dispose())
  geometry.computeBoundingSphere()

  const materials: Record<MatKind, Material> = {
    fur: furMaterial(design),
    gloss: new MeshStandardMaterial({
      name: 'plush-gloss',
      vertexColors: true,
      roughness: 0.18,
      metalness: 0,
    }),
    plastic: new MeshStandardMaterial({
      name: 'plush-plastic',
      vertexColors: true,
      roughness: 0.4,
      metalness: 0,
    }),
  }
  const used = kinds.map((k) => materials[k])

  const bones = createBones(rest)
  const root = new Group()
  root.name = `plush-${design.id}`
  const mesh = new SkinnedMesh(geometry, used)
  mesh.name = `plush-${design.id}`
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.add(bones.hips)
  mesh.bind(new Skeleton(BONE_NAMES.map((n) => bones[n])))
  root.add(mesh)

  return {
    root,
    mesh,
    bones,
    profile,
    dispose() {
      geometry.dispose()
      Object.values(materials).forEach((m) => m.dispose())
      mesh.skeleton.dispose()
    },
  }
}

/** Keep only the attributes every part shares, so parts of different origin can be merged. */
function stripToCommon(g: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(name))
      g.deleteAttribute(name)
  }
  if (!g.attributes['normal']) g.computeVertexNormals()
  return g.index ? g : mergeVertices(g)
}
