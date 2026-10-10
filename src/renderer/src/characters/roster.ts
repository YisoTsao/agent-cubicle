import type { AnimationClip } from 'three'
import { chibiClips } from './rig/chibiClips'
import { buildChibiRig, type ChibiRig, type ChibiStyle } from './rig/chibiRig'
import { PLUSH_DESIGNS } from './rig/plushDesigns'
import { buildPlushRig, type PlushDesign, type PlushRig } from './rig/plushRig'
import { plushProfile } from './rig/plushRig'
import type { RigProfile } from './rig/profile'

// Every character the user can pick. All of them animate through the same clip roles
// (manifest.ts); they differ in body (RigProfile) and mesh.

export type CharacterRig = ChibiRig | PlushRig

export interface CharacterDef {
  id: string
  /** Shown in the picker. */
  name: string
  /** One-line description for the picker. */
  note: string
  kind: 'chibi' | 'plush'
  design?: PlushDesign
  /** Swatch colour in the picker. */
  color: string
}

const PLUSH_INFO: Record<string, { name: string; note: string }> = {
  duck: { name: 'You never know', note: '黃色小鴨' },
  kuro: { name: 'Kuro', note: '黑色兔耳' },
  naughty: { name: 'Naughty', note: '紅色小熊' },
  nicky: { name: 'Nicky', note: '藍色貓咪' },
  belle: { name: 'Belle', note: '粉紅長毛' },
  john: { name: 'John', note: '奶油色黑耳狗' },
}

export const CHARACTERS: readonly CharacterDef[] = [
  { id: 'chibi', name: '上班族', note: '原本的 Q 版小人', kind: 'chibi', color: '#d4866a' },
  ...PLUSH_DESIGNS.map((design): CharacterDef => ({
    id: design.id,
    name: PLUSH_INFO[design.id]!.name,
    note: PLUSH_INFO[design.id]!.note,
    kind: 'plush',
    design,
    color: design.fur,
  })),
]

export type CharacterId = string

/** What the user picked: one character for everybody, or a different one per agent. */
export type CharacterChoice = CharacterId | 'auto'

export const DEFAULT_CHOICE: CharacterChoice = 'chibi'

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]))

export function isCharacterId(id: unknown): id is CharacterId {
  return typeof id === 'string' && BY_ID.has(id)
}

export function isChoice(v: unknown): v is CharacterChoice {
  return v === 'auto' || isCharacterId(v)
}

/** Which character an agent is drawn as. 'auto' spreads agents over the roster by agent id. */
export function characterFor(choice: CharacterChoice, agentId: string): CharacterId {
  if (choice !== 'auto') return choice
  let h = 0
  for (const ch of agentId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return CHARACTERS[h % CHARACTERS.length]!.id
}

export function buildRig(id: CharacterId, style: ChibiStyle): CharacterRig {
  const def = BY_ID.get(id)
  if (def?.kind === 'plush' && def.design) return buildPlushRig(def.design)
  return buildChibiRig(style)
}

const profiles = new Map<string, RigProfile>()

export function clipsForRig(rig: CharacterRig): AnimationClip[] {
  return chibiClips(rig.profile)
}

export function profileOf(id: CharacterId): RigProfile | null {
  const def = BY_ID.get(id)
  if (!def?.design) return null
  let p = profiles.get(id)
  if (!p) {
    p = plushProfile(def.design)
    profiles.set(id, p)
  }
  return p
}
