import { describe, expect, it } from 'vitest'
import { CHIBI_MANIFEST, CLIP_ROLES, resolveClips } from './manifest'
import { chibiClips } from './rig/chibiClips'

describe('resolveClips', () => {
  it('resolves every role for the built-in chibi without warnings', () => {
    const r = resolveClips(
      CHIBI_MANIFEST,
      chibiClips().map((c) => c.name),
    )
    expect(r.warnings).toEqual([])
    for (const role of CLIP_ROLES) expect(r.clipFor[role]).toBe(CHIBI_MANIFEST.clips[role].clip)
  })

  it('follows the fallback chain when a clip is missing', () => {
    const available = chibiClips()
      .map((c) => c.name)
      .filter((n) => n !== 'type_fast' && n !== 'sit_idle')
    const r = resolveClips(CHIBI_MANIFEST, available)
    // type_fast → sit_idle (missing) → stand_idle
    expect(r.clipFor.type_fast).toBe('stand_idle')
    expect(r.warnings.some((w) => w.includes('type_fast'))).toBe(true)
  })

  it('returns null (not a crash) when the whole chain is missing', () => {
    const r = resolveClips(CHIBI_MANIFEST, [])
    expect(r.clipFor.walk).toBeNull()
    expect(r.warnings).toHaveLength(CLIP_ROLES.length)
  })

  it('terminates on cyclic fallbacks', () => {
    const cyclic = structuredClone(CHIBI_MANIFEST)
    cyclic.clips.sit.fallback = 'sit_sofa'
    cyclic.clips.sit_sofa.fallback = 'sit'
    const r = resolveClips(cyclic, [])
    expect(r.clipFor.sit).toBeNull()
  })
})
