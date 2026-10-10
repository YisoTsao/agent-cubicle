import { beforeEach, describe, expect, it } from 'vitest'
import { crowdOffset, resetCrowd } from './crowd'

beforeEach(resetCrowd)

const dt = 1 / 60

describe('crowd separation', () => {
  it('settled characters never move', () => {
    crowdOffset('a', 0, 0, 0, false, dt)
    for (let i = 0; i < 60; i++) expect(crowdOffset('b', 0.1, 0, 0, false, dt)).toEqual([0, 0])
  })

  it('two characters meeting head-on both step to their own right, smoothly', () => {
    // a walks +z, b walks -z, on the same line.
    let a: [number, number] = [0, 0]
    let b: [number, number] = [0, 0]
    let maxStep = 0
    for (let i = 0; i < 60; i++) {
      const prev = a
      a = crowdOffset('a', 0, -0.2, 0, true, dt)
      b = crowdOffset('b', 0, 0.2, Math.PI, true, dt)
      maxStep = Math.max(maxStep, Math.hypot(a[0] - prev[0], a[1] - prev[1]))
    }
    expect(a[0]).toBeLessThan(-0.05) // a's right is -x
    expect(b[0]).toBeGreaterThan(0.05) // b faces -z, its right is +x
    expect(maxStep).toBeLessThan(0.05) // no jumps
  })

  it('offsets decay back to zero once the character settles', () => {
    for (let i = 0; i < 30; i++) {
      crowdOffset('a', 0, 0, 0, true, dt)
      crowdOffset('b', 0.2, 0, 0, false, dt)
    }
    let off: [number, number] = [1, 1]
    for (let i = 0; i < 120; i++) off = crowdOffset('a', 0, 0, 0, false, dt)
    expect(Math.hypot(...off)).toBeLessThan(0.01)
  })
})
