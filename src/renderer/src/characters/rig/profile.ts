import { BONE_REST, LIMB, type BoneRest } from './skeleton'

// Body proportions of a character rig. Animation clips are authored against a profile (bone
// lengths, where the hips sit on a chair / sofa, how far arms can reach), so characters with a
// different build — the chibi office worker and the stubby plush figures — share every clip role
// and the whole presentation layer, but each gets clips solved for its own body.

export interface PostureCtx {
  hipsY: number
  hipsZ: number
  /** Spine lean in radians (+ = forward). */
  lean: number
}

export interface RigProfile {
  id: string
  bones: BoneRest
  /** Arm lengths used by the IK solver (the reach the arms may stretch to). */
  limb: { upperArm: number; forearm: number }
  /**
   * Arm lengths at rest. Plush arms are stubby: when a target is farther than the rest length the
   * arm stretches (uniform bone scale, so the IK stays exact) up to limb / restLimb.
   */
  restLimb?: { upperArm: number; forearm: number }
  posture: { sit: PostureCtx; sofa: PostureCtx; stand: PostureCtx }
  /** Seated leg angles [thigh, knee, splay]; defaults suit the chibi (knees bent over the chair). */
  legs?: { sit: [number, number, number]; sofa: [number, number, number] }
  /** Multiplier on leg swing and hip sway while walking (short legs need a bigger waddle). */
  walkSwing: number
  /** Heights above the head bone for the name tag and the status icon. */
  tagHeight: number
  overlayHeight: number
  overlaySize: number
}

export const CHIBI_PROFILE: RigProfile = {
  id: 'chibi',
  bones: BONE_REST,
  limb: LIMB,
  posture: {
    sit: { hipsY: 0.55, hipsZ: -0.02, lean: 0.16 },
    sofa: { hipsY: 0.59, hipsZ: -0.04, lean: -0.24 },
    stand: { hipsY: 0.67, hipsZ: 0, lean: 0.06 },
  },
  walkSwing: 1,
  tagHeight: 0.52,
  overlayHeight: 0.78,
  overlaySize: 0.34,
}
