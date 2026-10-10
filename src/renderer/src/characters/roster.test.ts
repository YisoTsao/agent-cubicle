import { describe, expect, it } from 'vitest'
import { AnimationMixer } from 'three'
import { CHIBI_MANIFEST, CLIP_ROLES, resolveClips } from './manifest'
import { CHARACTERS, buildRig, characterFor, clipsForRig, isChoice } from './roster'
import { DEFAULT_STYLE } from './rig/chibiRig'
import { BONE_NAMES } from './rig/skeleton'

describe('roster', () => {
  it('lists the chibi and the six plush figures with unique ids', () => {
    const ids = CHARACTERS.map((c) => c.id)
    expect(ids).toEqual(['chibi', 'duck', 'kuro', 'naughty', 'nicky', 'belle', 'john'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('validates a choice and resolves "auto" deterministically per agent', () => {
    expect(isChoice('auto')).toBe(true)
    expect(isChoice('duo')).toBe(true)
    expect(isChoice('duck')).toBe(true)
    expect(isChoice('nope')).toBe(false)
    expect(isChoice(7)).toBe(false)
    expect(characterFor('kuro', 'any')).toBe('kuro')
    // Default pair: by desk.
    expect(characterFor('duo', 'a', 'desk-a')).toBe('duck')
    expect(characterFor('duo', 'b', 'desk-b')).toBe('kuro')
    expect(characterFor('duo', 'c', 'wait')).toBe('duck')
    expect(characterFor('auto', 'claude-code')).toBe(characterFor('auto', 'claude-code'))
    const spread = new Set(
      ['a', 'b', 'c', 'claude-code', 'codex', 'aider', 'x1', 'y2'].map((id) =>
        characterFor('auto', id),
      ),
    )
    expect(spread.size).toBeGreaterThan(2)
  })
})

describe.each(CHARACTERS.map((c) => c.id))('character %s', (id) => {
  it('builds a skinned rig bound to the shared skeleton, with every clip role playable', () => {
    const rig = buildRig(id, DEFAULT_STYLE)
    expect(rig.mesh.skeleton.bones.map((b) => b.name)).toEqual([...BONE_NAMES])
    const g = rig.mesh.geometry
    for (const attr of ['position', 'normal', 'color', 'skinIndex', 'skinWeight'])
      expect(g.getAttribute(attr), attr).toBeDefined()
    // Skin weights are normalised (a drifting sum would stretch the mesh).
    const w = g.getAttribute('skinWeight')
    for (let i = 0; i < w.count; i += 97) {
      const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)
      expect(Math.abs(sum - 1)).toBeLessThan(1e-3)
    }
    const clips = clipsForRig(rig)
    expect(
      resolveClips(
        CHIBI_MANIFEST,
        clips.map((c) => c.name),
      ).warnings,
    ).toEqual([])
    expect(clips.length).toBe(CLIP_ROLES.length)
    const names = new Set<string>(BONE_NAMES)
    for (const clip of clips)
      for (const t of clip.tracks) {
        expect(Array.from(t.values).every(Number.isFinite), `${clip.name}/${t.name}`).toBe(true)
        expect(names.has(t.name.split('.')[0]!)).toBe(true)
      }
    // Sampling every clip must keep all vertices finite (no NaN from IK / stretch).
    const mixer = new AnimationMixer(rig.root)
    for (const clip of clips) {
      mixer.clipAction(clip).play()
      mixer.setTime(clip.duration * 0.37)
      rig.root.updateMatrixWorld(true)
      mixer.stopAllAction()
    }
    for (const b of rig.mesh.skeleton.bones)
      expect(Number.isFinite(b.matrixWorld.elements[13]!), b.name).toBe(true)
    rig.dispose()
  })
})

describe('plush body proportions', () => {
  it('stands about a metre tall and fits the chair', () => {
    for (const id of ['duck', 'kuro', 'naughty', 'nicky', 'belle', 'john']) {
      const rig = buildRig(id, DEFAULT_STYLE)
      rig.mesh.geometry.computeBoundingBox()
      const box = rig.mesh.geometry.boundingBox!
      expect(box.min.y).toBeGreaterThan(-0.02)
      expect(box.max.y).toBeGreaterThan(0.9)
      expect(box.max.y).toBeLessThan(1.5)
      expect(box.max.x - box.min.x).toBeLessThan(1.3)
      rig.dispose()
    }
  })
})
