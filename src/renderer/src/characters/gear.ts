import type { SceneId } from '../config/themes'
import { createHackerGear, hackerOutfit } from './hackerGear'
import { createSpaceGear } from './spaceGear'
import type { ChibiStyle } from './rig/chibiRig'
import type { CharacterRig } from './roster'

// What a character wears in each scene, beyond its own body: glasses and a headset in the hacker
// base, a full space suit on the station.

export interface SceneGear {
  attach(): void
  detach(): void
  dispose(): void
}

/** Does this scene dress the figures in a space suit (plush: an inflated white skin)? */
export const isSuited = (scene: SceneId): boolean => scene === 'space'

const SPACE_OUTFIT = { shirt: '#f1f4f9', pants: '#e4e8f0', shoes: '#7c8496', glove: '#aab2c4' }
const spaceStyles = new Map<ChibiStyle, ChibiStyle>()

/** The chibi's clothes for a scene (plush figures wear the same fur everywhere). */
export function outfitFor(scene: SceneId, style: ChibiStyle): ChibiStyle {
  if (scene === 'hacker') return hackerOutfit(style)
  if (scene === 'space') {
    let out = spaceStyles.get(style)
    if (!out) {
      out = { ...style, ...SPACE_OUTFIT }
      spaceStyles.set(style, out)
    }
    return out
  }
  return style
}

export function createSceneGear(scene: SceneId, rig: CharacterRig): SceneGear | null {
  if (scene === 'hacker') {
    const gear = createHackerGear(rig.gear)
    return {
      attach: () => rig.bones.head.add(gear.group),
      detach: () => rig.bones.head.remove(gear.group),
      dispose: () => gear.dispose(),
    }
  }
  if (scene === 'space') {
    const headFromSpine = rig.bones.neck.position.y + rig.bones.head.position.y
    const gear = createSpaceGear(rig.gear, headFromSpine)
    return {
      attach: () => {
        rig.bones.head.add(gear.head)
        rig.bones.spine.add(gear.spine)
      },
      detach: () => {
        rig.bones.head.remove(gear.head)
        rig.bones.spine.remove(gear.spine)
      },
      dispose: () => gear.dispose(),
    }
  }
  return null
}
