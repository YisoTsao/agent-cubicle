import type { Layer } from './rig/skeleton'

// Animation contract between the presentation layer and a character asset (SPEC §7).
// Presentation code asks for *roles*; the manifest maps roles to concrete clip names, loop
// behaviour and a fallback chain, so a GLB missing a clip degrades instead of breaking.

export const CLIP_ROLES = [
  'sit',
  'sit_sofa',
  'stand',
  'walk',
  'type_fast',
  'sit_idle',
  'read',
  'think',
  'wave_attention',
  'confused',
  'celebrate',
  'stand_terminal',
  'stand_idle',
  'idle_coffee',
  'walk_arms',
] as const

export type ClipRole = (typeof CLIP_ROLES)[number]

export interface ClipSpec {
  /** Clip name inside the asset. */
  clip: string
  layer: Layer
  loop: 'repeat' | 'once'
  /** Role to use when this role's clip is missing from the asset. */
  fallback?: ClipRole
  /** For `once` clips: role to cross-fade into when the clip finishes. */
  then?: ClipRole
}

export interface CharacterManifest {
  id: string
  source: { kind: 'procedural'; builder: 'chibi' } | { kind: 'glb'; url: string }
  clips: Record<ClipRole, ClipSpec>
}

const spec = (clip: string, layer: Layer, extra: Partial<ClipSpec> = {}): ClipSpec => ({
  clip,
  layer,
  loop: 'repeat',
  ...extra,
})

export const CHIBI_MANIFEST: CharacterManifest = {
  id: 'chibi',
  source: { kind: 'procedural', builder: 'chibi' },
  clips: {
    sit: spec('sit', 'posture', { fallback: 'stand' }),
    sit_sofa: spec('sit_sofa', 'posture', { fallback: 'sit' }),
    stand: spec('stand', 'posture'),
    walk: spec('walk', 'posture', { fallback: 'stand' }),
    type_fast: spec('type_fast', 'gesture', { fallback: 'sit_idle' }),
    sit_idle: spec('sit_idle', 'gesture', { fallback: 'stand_idle' }),
    read: spec('read', 'gesture', { fallback: 'sit_idle' }),
    think: spec('think', 'gesture', { fallback: 'sit_idle' }),
    wave_attention: spec('wave_attention', 'gesture', { fallback: 'sit_idle' }),
    confused: spec('confused', 'gesture', { fallback: 'sit_idle' }),
    celebrate: spec('celebrate', 'gesture', {
      loop: 'once',
      then: 'sit_idle',
      fallback: 'sit_idle',
    }),
    stand_terminal: spec('stand_terminal', 'gesture', { fallback: 'stand_idle' }),
    stand_idle: spec('stand_idle', 'gesture'),
    idle_coffee: spec('idle_coffee', 'gesture', { fallback: 'sit_idle' }),
    walk_arms: spec('walk_arms', 'gesture', { fallback: 'stand_idle' }),
  },
}

export interface ResolvedClips {
  /** Role → clip name actually used (null if nothing in the fallback chain exists). */
  clipFor: Record<ClipRole, string | null>
  warnings: string[]
}

/** Validate a manifest against the clips an asset actually contains. Pure; unit tested. */
export function resolveClips(
  manifest: CharacterManifest,
  available: Iterable<string>,
): ResolvedClips {
  const have = new Set(available)
  const clipFor = {} as Record<ClipRole, string | null>
  const warnings: string[] = []
  for (const role of CLIP_ROLES) {
    const seen = new Set<ClipRole>()
    let r: ClipRole | undefined = role
    let found: string | null = null
    while (r && !seen.has(r)) {
      seen.add(r)
      const s: ClipSpec = manifest.clips[r]
      if (have.has(s.clip)) {
        found = s.clip
        break
      }
      r = s.fallback
    }
    clipFor[role] = found
    if (found === null)
      warnings.push(`${manifest.id}: no clip for role "${role}" (chain exhausted)`)
    else if (found !== manifest.clips[role].clip)
      warnings.push(
        `${manifest.id}: role "${role}" missing clip "${manifest.clips[role].clip}", using "${found}"`,
      )
  }
  return { clipFor, warnings }
}
