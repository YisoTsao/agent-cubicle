import {
  BufferGeometry,
  CapsuleGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GearFrame } from '../hackerGear'
import { CHIBI_PROFILE, CHIBI_SUIT_PROFILE, type RigProfile } from './profile'
import { BONE_NAMES, createBones, restPosition, type BoneName } from './skeleton'

// Procedural chibi built as ONE SkinnedMesh with rigid per-part skinning and vertex colours:
// a single draw call (+1 shadow) regardless of part count. This is the always-available
// fallback character (SPEC §7) and exercises the same mixer pipeline a GLB will.

export interface ChibiStyle {
  skin: string
  hair: string
  shirt: string
  pants: string
  shoes: string
  /** Forearms and hands (default: skin). Gloves for the space suit. */
  glove?: string
}

export const DEFAULT_STYLE: ChibiStyle = {
  skin: '#f1c7a5',
  hair: '#4a3328',
  shirt: '#7d9bb8',
  pants: '#3e3a37',
  shoes: '#2f2b28',
}

const FACE = { eye: '#2b2220', highlight: '#ffffff', cheek: '#f0a39a' }

export interface ChibiRig {
  root: Group
  mesh: SkinnedMesh
  bones: ReturnType<typeof createBones>
  profile: RigProfile
  /** Where glasses and a headset fit (head-bone local metres). */
  gear: GearFrame
  dispose(): void
}

type V3 = [number, number, number]

interface Part {
  geometry: BufferGeometry
  bone: BoneName
  color: string
  /** Model-space placement in the rest pose. */
  position: V3
  rotation?: V3
  scale?: V3
}

const BONE_INDEX = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i])) as Record<BoneName, number>

function add(rest: BoneName, offset: V3): V3 {
  const p = restPosition(rest)
  return [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]]
}

function capsuleBetween(bone: BoneName, from: V3, to: V3, radius: number, color: string): Part {
  const a = new Vector3(...from)
  const b = new Vector3(...to)
  const len = a.distanceTo(b)
  const geo = new CapsuleGeometry(radius, Math.max(0.001, len), 6, 14)
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize())
  geo.applyQuaternion(q)
  const mid = a.add(b).multiplyScalar(0.5)
  return { geometry: geo, bone, color, position: [mid.x, mid.y, mid.z] }
}

function sphere(
  bone: BoneName,
  position: V3,
  r: number,
  color: string,
  scale?: V3,
  seg = 18,
): Part {
  return {
    geometry: new SphereGeometry(r, seg, Math.round(seg * 0.7)),
    bone,
    color,
    position,
    ...(scale ? { scale } : {}),
  }
}

function buildParts(style: ChibiStyle): Part[] {
  const parts: Part[] = []
  const headC = add('head', [0, 0.2, 0])

  // Torso & pelvis
  parts.push(sphere('hips', add('hips', [0, 0.01, -0.005]), 0.155, style.pants, [1, 0.62, 0.9]))
  parts.push(
    capsuleBetween(
      'spine',
      add('spine', [0, 0.04, -0.01]),
      add('spine', [0, 0.22, -0.005]),
      0.16,
      style.shirt,
    ),
  )
  parts.push(sphere('neck', add('neck', [0, 0.0, 0]), 0.07, style.skin, [1, 0.8, 1]))

  // Head
  parts.push(sphere('head', headC, 0.22, style.skin, undefined, 28))
  parts.push({
    geometry: new SphereGeometry(0.235, 28, 14, 0, Math.PI * 2, 0, 1.15),
    bone: 'head',
    color: style.hair,
    position: [headC[0], headC[1] + 0.015, headC[2] - 0.005],
  })
  parts.push({
    geometry: new SphereGeometry(0.236, 28, 16, Math.PI, Math.PI, 0, 2.2),
    bone: 'head',
    color: style.hair,
    position: [headC[0], headC[1], headC[2] - 0.01],
  })
  ;[-0.12, -0.04, 0.05, 0.13].forEach((x, i) =>
    parts.push(
      sphere(
        'head',
        [headC[0] + x, headC[1] + 0.135 - (i % 2) * 0.012, headC[2] + 0.155],
        0.07,
        style.hair,
        [1, 0.75, 0.7],
        12,
      ),
    ),
  )
  parts.push(
    sphere('head', [headC[0], headC[1] + 0.17, headC[2] - 0.17], 0.09, style.hair, undefined, 14),
  )

  // Face — eyes on their own bones so blinking is a bone scale (secondary layer).
  for (const [eye, side] of [
    ['eye_L', 1],
    ['eye_R', -1],
  ] as const) {
    const p = restPosition(eye)
    parts.push(sphere(eye, p, 0.027, FACE.eye, [1, 1.3, 0.6], 12))
    parts.push(
      sphere(
        eye,
        [p[0] + side * 0.008, p[1] + 0.012, p[2] + 0.016],
        0.008,
        FACE.highlight,
        undefined,
        8,
      ),
    )
    parts.push(
      sphere(
        'head',
        [headC[0] + side * 0.125, headC[1] - 0.06, headC[2] + 0.175],
        0.035,
        FACE.cheek,
        [1, 0.55, 0.4],
        10,
      ),
    )
  }
  parts.push({
    geometry: new TorusGeometry(0.018, 0.005, 6, 12, Math.PI),
    bone: 'head',
    color: FACE.eye,
    position: [headC[0], headC[1] - 0.075, headC[2] + 0.207],
    rotation: [0, 0, Math.PI],
  })

  // Arms
  for (const s of ['L', 'R'] as const) {
    const sh = restPosition(`upperArm_${s}`)
    const el = restPosition(`forearm_${s}`)
    const ha = restPosition(`hand_${s}`)
    parts.push(sphere(`upperArm_${s}`, sh, 0.066, style.shirt, undefined, 12))
    parts.push(capsuleBetween(`upperArm_${s}`, sh, el, 0.056, style.shirt))
    parts.push(capsuleBetween(`forearm_${s}`, el, ha, 0.045, style.glove ?? style.skin))
    parts.push(
      sphere(
        `hand_${s}`,
        [ha[0], ha[1] - 0.025, ha[2]],
        0.052,
        style.glove ?? style.skin,
        undefined,
        12,
      ),
    )
  }

  // Legs
  for (const s of ['L', 'R'] as const) {
    const hip = restPosition(`thigh_${s}`)
    const knee = restPosition(`shin_${s}`)
    const ankle = restPosition(`foot_${s}`)
    parts.push(capsuleBetween(`thigh_${s}`, hip, knee, 0.07, style.pants))
    parts.push(
      capsuleBetween(`shin_${s}`, knee, [ankle[0], ankle[1] + 0.03, ankle[2]], 0.06, style.pants),
    )
    parts.push(
      sphere(
        `foot_${s}`,
        [ankle[0], ankle[1] - 0.005, ankle[2] + 0.04],
        0.075,
        style.shoes,
        [0.9, 0.6, 1.4],
        12,
      ),
    )
  }
  return parts
}

function bake(part: Part): BufferGeometry {
  const g = part.geometry
  const m = new Matrix4().compose(
    new Vector3(...part.position),
    new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))),
    new Vector3(...(part.scale ?? [1, 1, 1])),
  )
  g.applyMatrix4(m)
  const count = g.attributes['position']!.count
  // Color() already converts sRGB hex to linear (ColorManagement), which vertex colours expect.
  const color = new Color(part.color)
  const colors = new Float32Array(count * 3)
  const skinIndex = new Uint16Array(count * 4)
  const skinWeight = new Float32Array(count * 4)
  const boneIdx = BONE_INDEX[part.bone]
  for (let i = 0; i < count; i++) {
    colors.set([color.r, color.g, color.b], i * 3)
    skinIndex[i * 4] = boneIdx
    skinWeight[i * 4] = 1
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4))
  g.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4))
  return g
}

export function buildChibiRig(style: ChibiStyle = DEFAULT_STYLE, suit = false): ChibiRig {
  const parts = buildParts(style).map(bake)
  const geometry = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  if (!geometry) throw new Error('chibi: failed to merge geometry')
  geometry.computeBoundingSphere()

  const material = new MeshStandardMaterial({
    name: 'chibi',
    vertexColors: true,
    roughness: 0.7,
  })

  const bones = createBones()
  const root = new Group()
  root.name = 'chibi-root'
  const mesh = new SkinnedMesh(geometry, material)
  mesh.name = 'chibi'
  mesh.castShadow = true
  mesh.receiveShadow = true
  // Skinned bounds don't follow the pose; the character is always on screen anyway.
  mesh.frustumCulled = false
  mesh.add(bones.hips)
  mesh.bind(new Skeleton(BONE_NAMES.map((n) => bones[n])))
  root.add(mesh)

  return {
    root,
    mesh,
    bones,
    profile: suit ? CHIBI_SUIT_PROFILE : CHIBI_PROFILE,
    gear: {
      eyeX: 0.075,
      eyeY: 0.19,
      eyeZ: 0.2,
      eyeR: 0.027,
      headHalfW: 0.225,
      crown: 0.45,
      faceZ: 0.21,
      helmet: { cy: 0.22, rx: 0.33, ry: 0.33, rz: 0.33 },
      torso: { chestY: 0.14, packY: 0.13, frontZ: 0.165, backZ: -0.17, halfW: 0.17 },
      collarR: 0.1,
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      mesh.skeleton.dispose()
    },
  }
}
