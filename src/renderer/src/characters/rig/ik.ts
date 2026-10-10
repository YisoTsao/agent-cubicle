// Two-bone IK in a bone chain's sagittal (y–z) plane. Bones hang along -y at rest; a rotation of
// `a` about +x points a bone along dir(a) = (y: -cos a, z: -sin a). Negative angles reach forward.

export interface TwoBoneSolution {
  /** Upper bone rotation about x (radians), relative to its parent. */
  upper: number
  /** Lower bone rotation about x (radians), relative to the upper bone. */
  lower: number
  /** True when the target was out of reach and the chain was fully extended towards it. */
  clamped: boolean
}

export function dir(a: number): [number, number] {
  return [-Math.cos(a), -Math.sin(a)]
}

/** Forward kinematics: end-effector (y, z) for the given angles. */
export function fk(l1: number, l2: number, upper: number, lower: number): [number, number] {
  const [y1, z1] = dir(upper)
  const [y2, z2] = dir(upper + lower)
  return [l1 * y1 + l2 * y2, l1 * z1 + l2 * z2]
}

/**
 * Solve for a target (y, z) relative to the chain root. The elbow/knee is placed on the side
 * selected by `bend`: -1 bends the joint backwards/down (elbows), +1 forwards (knees).
 */
export function solveTwoBone(
  l1: number,
  l2: number,
  target: [number, number],
  bend: -1 | 1 = -1,
): TwoBoneSolution {
  const [ty, tz] = target
  const rawD = Math.hypot(ty, tz)
  const maxD = l1 + l2 - 1e-4
  const minD = Math.abs(l1 - l2) + 1e-4
  const d = Math.min(maxD, Math.max(minD, rawD))
  const phi = Math.atan2(-tz, -ty) // angle whose dir() points at the target
  const cosAlpha = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
  const alpha = Math.acos(Math.min(1, Math.max(-1, cosAlpha)))

  // Two candidate elbow positions; pick by bend side (sign of the elbow's offset from the line).
  let best: TwoBoneSolution | null = null
  for (const sign of [1, -1]) {
    const upper = phi + sign * alpha
    const [ey, ez] = dir(upper).map((v) => v * l1) as [number, number]
    // Cross product sign tells which side of the root→target line the elbow lies on.
    const side = Math.sign(ty * ez - tz * ey) || 1
    const [ny, nz] = rawD > 0 ? [(ty / rawD) * d, (tz / rawD) * d] : [-d, 0]
    const lower = Math.atan2(-(nz - ez), -(ny - ey)) - upper
    const sol = { upper, lower: normalizeAngle(lower), clamped: rawD > maxD }
    if (side === bend) return sol
    best ??= sol
  }
  return best!
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}
