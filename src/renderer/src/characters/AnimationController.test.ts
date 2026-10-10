import { describe, expect, it } from 'vitest'
import { AnimationController } from './AnimationController'
import { CHIBI_MANIFEST, resolveClips } from './manifest'
import { CELEBRATE_DURATION, chibiClips } from './rig/chibiClips'
import { buildChibiRig } from './rig/chibiRig'

function setup(available?: string[]) {
  const rig = buildChibiRig()
  const clips = chibiClips().filter((c) => !available || available.includes(c.name))
  const resolved = resolveClips(
    CHIBI_MANIFEST,
    clips.map((c) => c.name),
  )
  const ctl = new AnimationController(rig.root, clips, CHIBI_MANIFEST, resolved)
  return { rig, ctl }
}

describe('AnimationController', () => {
  it('keeps posture and gesture layers independent', () => {
    const { ctl } = setup()
    ctl.play('sit', 0)
    ctl.play('type_fast', 0)
    ctl.update(0.1)
    expect(ctl.current('posture')).toBe('sit')
    expect(ctl.current('gesture')).toBe('type_fast')
  })

  it('treats re-requesting the active role as a no-op (no restart)', () => {
    const { ctl } = setup()
    ctl.play('read', 0)
    ctl.update(1.0)
    const time = ctl.mixer.existingAction(ctl.mixer['_actions'][0]!.getClip())!.time
    ctl.play('read')
    ctl.update(0)
    expect(ctl.mixer['_actions'][0]!.time).toBeCloseTo(time, 5)
  })

  it('cross-fades instead of snapping', () => {
    const { rig, ctl } = setup()
    ctl.play('stand', 0)
    ctl.update(0.016)
    const standY = rig.bones.hips.position.y
    ctl.play('sit', 0.4)
    ctl.update(0.1)
    const midY = rig.bones.hips.position.y
    ctl.update(0.5)
    const sitY = rig.bones.hips.position.y
    expect(midY).toBeLessThan(standY)
    expect(midY).toBeGreaterThan(sitY)
  })

  it('returns from a once clip to its `then` role', () => {
    const { ctl } = setup()
    ctl.play('celebrate', 0)
    for (let t = 0; t < CELEBRATE_DURATION + 0.5; t += 0.05) ctl.update(0.05)
    expect(ctl.current('gesture')).toBe('sit_idle')
  })

  it('falls back when a clip is missing and never throws', () => {
    const { ctl } = setup(['stand', 'stand_idle'])
    expect(() => {
      ctl.play('sit', 0) // → stand
      ctl.play('type_fast', 0) // → sit_idle → stand_idle
      ctl.update(0.1)
    }).not.toThrow()
    expect(ctl.current('gesture')).toBe('type_fast')
  })

  it('releases mixer caches on dispose', () => {
    const { rig, ctl } = setup()
    ctl.play('walk', 0)
    ctl.play('walk_arms', 0)
    ctl.update(0.1)
    ctl.dispose()
    expect(ctl.mixer['_actions']).toHaveLength(0)
    expect(() => ctl.play('sit')).not.toThrow()
    rig.dispose()
  })
})
