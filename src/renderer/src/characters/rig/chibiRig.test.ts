import { describe, expect, it } from 'vitest'
import { buildChibiRig } from './chibiRig'
import { chibiClips } from './chibiClips'
import { BONE_NAMES } from './skeleton'

describe('buildChibiRig', () => {
  it('produces a single skinned mesh bound to every bone', () => {
    const rig = buildChibiRig()
    let meshes = 0
    rig.root.traverse((o) => {
      if ((o as { isMesh?: boolean }).isMesh) meshes++
    })
    expect(meshes).toBe(1)
    expect(rig.mesh.skeleton.bones.map((b) => b.name)).toEqual([...BONE_NAMES])
    const g = rig.mesh.geometry
    for (const attr of ['position', 'normal', 'color', 'skinIndex', 'skinWeight']) {
      expect(g.getAttribute(attr)).toBeDefined()
    }
    rig.dispose()
  })

  it('every clip track targets an existing bone', () => {
    const names = new Set<string>(BONE_NAMES)
    for (const clip of chibiClips()) {
      for (const track of clip.tracks) {
        const values = Array.from(track.values)
        expect(values.every(Number.isFinite), `${clip.name}/${track.name} has NaN`).toBe(true)
        expect(names.has(track.name.split('.')[0]!), `${clip.name}: ${track.name}`).toBe(true)
      }
    }
  })
})
