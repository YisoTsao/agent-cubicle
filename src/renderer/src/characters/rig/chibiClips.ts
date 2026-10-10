import {
  AnimationClip,
  Euler,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  type KeyframeTrack,
} from 'three'
import { solveTwoBone } from './ik'
import { BONE_REST, LIMB, type BoneName } from './skeleton'

// Code-authored animation clips for the chibi rig. Each clip is sampled from a pose function so
// motion stays smooth with linear (slerp) interpolation. Arm poses use IK against the furniture
// heights below, so hands actually land on keyboards / books / mugs.

type V3 = [number, number, number]

export interface Pose {
  rot?: Partial<Record<BoneName, V3>>
  hips?: V3
}

/** Posture contexts: where the hips sit and how far the spine leans (radians, + = forward). */
export const POSTURE = {
  sit: { hipsY: 0.55, hipsZ: -0.02, lean: 0.16 },
  sofa: { hipsY: 0.59, hipsZ: -0.04, lean: -0.24 },
  stand: { hipsY: 0.67, hipsZ: 0, lean: 0.06 },
} as const
type PostureCtx = (typeof POSTURE)[keyof typeof POSTURE]

/** Interaction heights in the character's root frame (root = seat / stand anchor, facing +z). */
export const TARGETS = {
  // Hand-bone heights: the hand sphere hangs ~5 cm below its bone, so these sit just above the keys.
  deskKeyboard: { y: 0.805, z: 0.4 },
  consoleKeyboard: { y: 0.895, z: 0.36 },
}

const TAU = Math.PI * 2

// ---------------------------------------------------------------------------------------------
// IK helpers

function armPose(side: 'L' | 'R', ctx: PostureCtx, target: V3): Partial<Record<BoneName, V3>> {
  const spineY = ctx.hipsY + BONE_REST.spine.offset[1]
  const [px, py, pz] = [target[0], target[1] - spineY, target[2] - ctx.hipsZ]
  // Into the (leaning) spine frame.
  const c = Math.cos(ctx.lean)
  const s = Math.sin(ctx.lean)
  const y = py * c + pz * s
  const z = -py * s + pz * c
  const sh = BONE_REST[`upperArm_${side}`].offset
  const d: V3 = [px - sh[0], y - sh[1], z - sh[2]]
  const dist = Math.hypot(d[0], d[1], d[2])
  const tilt = Math.asin(Math.max(-0.9, Math.min(0.9, d[0] / Math.max(dist, 1e-4))))
  const k = Math.cos(tilt)
  const sol = solveTwoBone(LIMB.upperArm, LIMB.forearm, [d[1] / k, d[2] / k], -1)
  return {
    [`upperArm_${side}`]: [sol.upper, 0, tilt],
    [`forearm_${side}`]: [sol.lower, 0, 0],
  }
}

function arms(ctx: PostureCtx, left: V3, right: V3): Partial<Record<BoneName, V3>> {
  return { ...armPose('L', ctx, left), ...armPose('R', ctx, right) }
}

// ---------------------------------------------------------------------------------------------
// Clip sampling

function sample(
  name: string,
  duration: number,
  fps: number,
  poseAt: (t: number) => Pose,
): AnimationClip {
  const frames = Math.max(2, Math.round(duration * fps) + 1)
  const times: number[] = []
  const poses: Pose[] = []
  for (let i = 0; i < frames; i++) {
    const t = (i / (frames - 1)) * duration
    times.push(t)
    poses.push(poseAt(t))
  }
  const bones = new Set<BoneName>()
  poses.forEach((p) => Object.keys(p.rot ?? {}).forEach((b) => bones.add(b as BoneName)))

  const tracks: KeyframeTrack[] = []
  const q = new Quaternion()
  const e = new Euler()
  for (const bone of bones) {
    const values: number[] = []
    for (const p of poses) {
      const r = p.rot?.[bone] ?? [0, 0, 0]
      q.setFromEuler(e.set(r[0], r[1], r[2]))
      values.push(q.x, q.y, q.z, q.w)
    }
    tracks.push(new QuaternionKeyframeTrack(`${bone}.quaternion`, times, values))
  }
  if (poses.some((p) => p.hips)) {
    const rest = BONE_REST.hips.offset
    const values = poses.flatMap((p) => p.hips ?? rest)
    tracks.push(new VectorKeyframeTrack('hips.position', times, values))
  }
  return new AnimationClip(name, duration, tracks)
}

const still = (name: string, pose: Pose) => sample(name, 1, 1, () => pose)

// ---------------------------------------------------------------------------------------------
// Postures (lower body + spine)

function seatedLegs(thigh: number, knee: number, splay = 0.08): Partial<Record<BoneName, V3>> {
  return {
    thigh_L: [thigh, 0, splay],
    thigh_R: [thigh, 0, -splay],
    shin_L: [knee, 0, 0],
    shin_R: [knee, 0, 0],
    foot_L: [0.15, 0, 0],
    foot_R: [0.15, 0, 0],
  }
}

const sit = () =>
  still('sit', {
    hips: [0, POSTURE.sit.hipsY, POSTURE.sit.hipsZ],
    rot: { hips: [0, 0, 0], spine: [POSTURE.sit.lean, 0, 0], ...seatedLegs(-1.5, 1.35) },
  })

const sitSofa = () =>
  still('sit_sofa', {
    hips: [0, POSTURE.sofa.hipsY, POSTURE.sofa.hipsZ],
    // Chibi legs are shorter than the sofa is deep: legs stretch out instead of bending down.
    rot: { hips: [0, 0, 0], spine: [POSTURE.sofa.lean, 0, 0], ...seatedLegs(-1.42, 0.25, 0.12) },
  })

const stand = () =>
  sample('stand', 4, 8, (t) => {
    // Gentle weight shift so standing never looks frozen.
    const w = Math.sin((t / 4) * TAU)
    return {
      hips: [w * 0.012, POSTURE.stand.hipsY, 0],
      rot: {
        hips: [0, 0, w * 0.025],
        spine: [POSTURE.stand.lean, 0, -w * 0.02],
        thigh_L: [0, 0, -w * 0.025],
        thigh_R: [0, 0, -w * 0.025],
        shin_L: [0.02, 0, 0],
        shin_R: [0.02, 0, 0],
      },
    }
  })

export const WALK_CYCLE = 0.72

const walk = () =>
  sample('walk', WALK_CYCLE, 30, (t) => {
    const p = (t / WALK_CYCLE) * TAU
    const sL = Math.sin(p)
    const sR = Math.sin(p + Math.PI)
    const bob = Math.abs(Math.cos(p))
    return {
      hips: [0, POSTURE.stand.hipsY - 0.025 + bob * 0.025, 0],
      rot: {
        hips: [0, Math.sin(p) * 0.12, 0],
        spine: [0.08, -Math.sin(p) * 0.1, 0],
        thigh_L: [-sL * 0.5, 0, 0],
        thigh_R: [-sR * 0.5, 0, 0],
        shin_L: [Math.max(0, Math.sin(p - 0.9)) * 0.8, 0, 0],
        shin_R: [Math.max(0, Math.sin(p + Math.PI - 0.9)) * 0.8, 0, 0],
        foot_L: [-sL * 0.2, 0, 0],
        foot_R: [-sR * 0.2, 0, 0],
      },
    }
  })

// ---------------------------------------------------------------------------------------------
// Gestures (head + arms). Each is authored for the posture it is used with.

const head = (rx: number, ry = 0, rz = 0): Partial<Record<BoneName, V3>> => ({
  neck: [rx * 0.4, ry * 0.4, rz * 0.4],
  head: [rx * 0.6, ry * 0.6, rz * 0.6],
})

const typeFast = () =>
  sample('type_fast', 1.2, 30, (t) => {
    const { y, z } = TARGETS.deskKeyboard
    const tapL = Math.max(0, Math.sin(t * TAU * 4.2)) * 0.016
    const tapR = Math.max(0, Math.sin(t * TAU * 4.2 + 2.1)) * 0.016
    const drift = Math.sin((t / 1.2) * TAU) * 0.02
    return {
      rot: {
        ...arms(POSTURE.sit, [0.11 + drift, y + tapL, z], [-0.12 + drift, y + tapR, z - 0.01]),
        hand_L: [0.25, 0, 0],
        hand_R: [0.25, 0, 0],
        ...head(-0.05, Math.sin((t / 1.2) * TAU) * 0.06),
      },
    }
  })

const sitIdle = () =>
  sample('sit_idle', 5, 10, (t) => {
    const look = Math.sin((t / 5) * TAU)
    return {
      rot: {
        ...arms(POSTURE.sit, [0.15, 0.78, 0.3], [-0.15, 0.78, 0.29]),
        hand_L: [0.4, 0, 0],
        hand_R: [0.4, 0, 0],
        ...head(0.02, look * 0.35, look * 0.05),
      },
    }
  })

export const READ_DURATION = 4

const read = () =>
  sample('read', READ_DURATION, 20, (t) => {
    // Page turn: right hand sweeps across around t = 2.6 s.
    const turn = Math.max(0, Math.sin(((t - 2.4) / 0.8) * Math.PI)) * (t > 2.4 && t < 3.2 ? 1 : 0)
    const sway = Math.sin((t / READ_DURATION) * TAU) * 0.01
    return {
      rot: {
        ...arms(
          POSTURE.sit,
          [0.1, 0.87 + sway, 0.33],
          [-0.1 + turn * 0.14, 0.88 + sway + turn * 0.03, 0.33],
        ),
        hand_L: [-0.3, 0, 0.3],
        hand_R: [-0.3, 0, -0.3],
        ...head(0.4, Math.sin((t / READ_DURATION) * TAU * 2) * 0.05),
      },
    }
  })

const think = () =>
  sample('think', 3, 15, (t) => {
    const s = Math.sin((t / 3) * TAU)
    return {
      rot: {
        ...arms(POSTURE.sit, [0.14, 0.78, 0.32], [-0.02, 1.02, 0.22]),
        hand_R: [-0.6, 0, 0.2],
        hand_L: [0.4, 0, 0],
        ...head(-0.18 + s * 0.03, -0.15, 0.18 + s * 0.04),
      },
    }
  })

const waveAttention = () =>
  sample('wave_attention', 1, 30, (t) => {
    const w = Math.sin(t * TAU * 2)
    return {
      rot: {
        upperArm_L: [-2.6, 0, 0.35 + w * 0.25],
        forearm_L: [-0.35 + w * 0.2, 0, 0],
        hand_L: [0, 0, w * 0.3],
        ...armPose('R', POSTURE.sit, [-0.15, 0.78, 0.29]),
        ...head(-0.2, 0.35, w * 0.05),
      },
    }
  })

const confused = () =>
  sample('confused', 1.4, 30, (t) => {
    const scratch = Math.sin(t * TAU * 3) * 0.025
    const tilt = Math.sin((t / 1.4) * TAU) * 0.05
    return {
      rot: {
        ...armPose('R', POSTURE.sit, [-0.1 + scratch, 1.33, 0.02]),
        hand_R: [-0.8, 0, 0],
        ...armPose('L', POSTURE.sit, [0.15, 0.78, 0.3]),
        ...head(0.05, -0.1, -0.22 + tilt),
      },
    }
  })

export const CELEBRATE_DURATION = 1.8

const celebrate = () =>
  sample('celebrate', CELEBRATE_DURATION, 30, (t) => {
    // Raise (0–0.3 s), pump twice, lower (last 0.3 s).
    const up = Math.min(1, t / 0.3) * Math.min(1, (CELEBRATE_DURATION - t) / 0.3)
    const pump = Math.sin(((t - 0.3) / 1.2) * TAU * 2) * 0.25 * (t > 0.3 && t < 1.5 ? 1 : 0)
    const arm = -0.3 - up * (2.5 + pump)
    return {
      rot: {
        upperArm_L: [arm, 0, 0.25 + up * 0.35],
        upperArm_R: [arm, 0, -0.25 - up * 0.35],
        forearm_L: [-0.6 + up * 0.3, 0, 0],
        forearm_R: [-0.6 + up * 0.3, 0, 0],
        ...head(-0.25 * up, 0, Math.sin(t * TAU * 1.5) * 0.08 * up),
      },
    }
  })

const standTerminal = () =>
  sample('stand_terminal', 1.4, 30, (t) => {
    const { y, z } = TARGETS.consoleKeyboard
    const tapL = Math.max(0, Math.sin(t * TAU * 3.6)) * 0.014
    const tapR = Math.max(0, Math.sin(t * TAU * 3.6 + 1.9)) * 0.014
    return {
      rot: {
        ...arms(POSTURE.stand, [0.12, y + tapL, z], [-0.12, y + tapR, z]),
        hand_L: [0.2, 0, 0],
        hand_R: [0.2, 0, 0],
        ...head(-0.22, Math.sin((t / 1.4) * TAU) * 0.18),
      },
    }
  })

const standIdle = () =>
  sample('stand_idle', 4, 10, (t) => {
    const s = Math.sin((t / 4) * TAU)
    return {
      rot: {
        upperArm_L: [0.05, 0, 0.12 + s * 0.02],
        upperArm_R: [0.05, 0, -0.12 - s * 0.02],
        forearm_L: [-0.15, 0, 0],
        forearm_R: [-0.15, 0, 0],
        ...head(0.02, s * 0.3),
      },
    }
  })

export const SIP_PERIOD = 5

const idleCoffee = () =>
  sample('idle_coffee', SIP_PERIOD, 20, (t) => {
    // Mug rests at the lap, lifted to the mouth around the middle of the cycle.
    const sip = Math.max(0, Math.sin(((t - 1.8) / 1.6) * Math.PI)) * (t > 1.8 && t < 3.4 ? 1 : 0)
    const mug: V3 = [-0.1 + sip * 0.07, 0.8 + sip * 0.33, 0.24 - sip * 0.02]
    return {
      rot: {
        ...armPose('R', POSTURE.sofa, mug),
        hand_R: [-0.2 - sip * 0.6, 0.4, 0],
        upperArm_L: [-0.4, 0, 0.35],
        forearm_L: [-0.6, 0, 0],
        ...head(-0.06 - sip * 0.18, 0.15 * (1 - sip) * Math.sin((t / SIP_PERIOD) * TAU)),
      },
    }
  })

const walkArms = () =>
  sample('walk_arms', WALK_CYCLE, 30, (t) => {
    const p = (t / WALK_CYCLE) * TAU
    return {
      rot: {
        upperArm_L: [Math.sin(p + Math.PI) * 0.45, 0, 0.1],
        upperArm_R: [Math.sin(p) * 0.45, 0, -0.1],
        forearm_L: [-0.35, 0, 0],
        forearm_R: [-0.35, 0, 0],
        ...head(0.02, 0, Math.sin(p) * 0.03),
      },
    }
  })

let cached: AnimationClip[] | null = null

/** All chibi clips. Clips are immutable and shared between characters (one mixer each). */
export function chibiClips(): AnimationClip[] {
  cached ??= [
    sit(),
    sitSofa(),
    stand(),
    walk(),
    typeFast(),
    sitIdle(),
    read(),
    think(),
    waveAttention(),
    confused(),
    celebrate(),
    standTerminal(),
    standIdle(),
    idleCoffee(),
    walkArms(),
  ]
  return cached
}
