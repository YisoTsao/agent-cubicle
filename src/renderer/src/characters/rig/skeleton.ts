import { Bone } from 'three'

// Chibi skeleton (SPEC §7). Rest pose: standing, facing +z, arms hanging, y-up, metres.
// Bone names are the animation binding keys — keep them free of dots and stable.

export const BONE_NAMES = [
  'hips',
  'spine',
  'neck',
  'head',
  'eye_L',
  'eye_R',
  'upperArm_L',
  'forearm_L',
  'hand_L',
  'upperArm_R',
  'forearm_R',
  'hand_R',
  'thigh_L',
  'shin_L',
  'foot_L',
  'thigh_R',
  'shin_R',
  'foot_R',
] as const

export type BoneName = (typeof BONE_NAMES)[number]

type V3 = [number, number, number]

/** Parent and rest offset (relative to parent) for every bone. */
export const BONE_REST: Record<BoneName, { parent: BoneName | null; offset: V3 }> = {
  hips: { parent: null, offset: [0, 0.67, 0] },
  spine: { parent: 'hips', offset: [0, 0.07, 0] },
  neck: { parent: 'spine', offset: [0, 0.3, 0] },
  head: { parent: 'neck', offset: [0, 0.06, 0] },
  eye_L: { parent: 'head', offset: [0.075, 0.19, 0.2] },
  eye_R: { parent: 'head', offset: [-0.075, 0.19, 0.2] },
  upperArm_L: { parent: 'spine', offset: [0.2, 0.25, 0] },
  forearm_L: { parent: 'upperArm_L', offset: [0, -0.22, 0] },
  hand_L: { parent: 'forearm_L', offset: [0, -0.2, 0] },
  upperArm_R: { parent: 'spine', offset: [-0.2, 0.25, 0] },
  forearm_R: { parent: 'upperArm_R', offset: [0, -0.22, 0] },
  hand_R: { parent: 'forearm_R', offset: [0, -0.2, 0] },
  thigh_L: { parent: 'hips', offset: [0.09, -0.05, 0] },
  shin_L: { parent: 'thigh_L', offset: [0, -0.27, 0] },
  foot_L: { parent: 'shin_L', offset: [0, -0.3, 0] },
  thigh_R: { parent: 'hips', offset: [-0.09, -0.05, 0] },
  shin_R: { parent: 'thigh_R', offset: [0, -0.27, 0] },
  foot_R: { parent: 'shin_R', offset: [0, -0.3, 0] },
}

export const LIMB = {
  upperArm: 0.22,
  forearm: 0.2,
  thigh: 0.27,
  shin: 0.3,
}

/** Bone masks used to split full-body clips into independently cross-faded layers. */
export const LAYER_BONES = {
  posture: ['hips', 'spine', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R'],
  gesture: [
    'neck',
    'head',
    'upperArm_L',
    'forearm_L',
    'hand_L',
    'upperArm_R',
    'forearm_R',
    'hand_R',
  ],
} as const satisfies Record<string, readonly BoneName[]>

export type Layer = keyof typeof LAYER_BONES

export function createBones(): Record<BoneName, Bone> {
  const bones = {} as Record<BoneName, Bone>
  for (const name of BONE_NAMES) {
    const b = new Bone()
    b.name = name
    b.position.set(...BONE_REST[name].offset)
    bones[name] = b
  }
  for (const name of BONE_NAMES) {
    const parent = BONE_REST[name].parent
    if (parent) bones[parent].add(bones[name])
  }
  return bones
}

/** Rest-pose world (model-space) position of a bone. */
export function restPosition(name: BoneName): V3 {
  let p: V3 = [0, 0, 0]
  for (let n: BoneName | null = name; n; n = BONE_REST[n].parent) {
    const o = BONE_REST[n].offset
    p = [p[0] + o[0], p[1] + o[1], p[2] + o[2]]
  }
  return p
}
