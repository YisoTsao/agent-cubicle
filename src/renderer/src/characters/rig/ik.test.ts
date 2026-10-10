import { describe, expect, it } from 'vitest'
import { fk, solveTwoBone } from './ik'

describe('solveTwoBone', () => {
  const l1 = 0.22
  const l2 = 0.2

  it.each([
    [-0.1, 0.3],
    [-0.3, 0.1],
    [0.05, 0.35],
    [-0.2, -0.05],
    [0.2, 0.1],
  ] as [number, number][])('reaches reachable target (%f, %f)', (y, z) => {
    const s = solveTwoBone(l1, l2, [y, z])
    const [fy, fz] = fk(l1, l2, s.upper, s.lower)
    expect(fy).toBeCloseTo(y, 4)
    expect(fz).toBeCloseTo(z, 4)
    expect(s.clamped).toBe(false)
  })

  it('extends fully towards unreachable targets without NaN', () => {
    const s = solveTwoBone(l1, l2, [0, 2])
    expect(Number.isFinite(s.upper) && Number.isFinite(s.lower)).toBe(true)
    expect(s.clamped).toBe(true)
    const [fy, fz] = fk(l1, l2, s.upper, s.lower)
    expect(Math.hypot(fy, fz)).toBeCloseTo(l1 + l2, 3)
  })

  it('picks opposite elbow sides for opposite bend directions', () => {
    const a = solveTwoBone(l1, l2, [-0.2, 0.2], -1)
    const b = solveTwoBone(l1, l2, [-0.2, 0.2], 1)
    expect(Math.sign(a.lower)).toBe(-Math.sign(b.lower))
  })
})
