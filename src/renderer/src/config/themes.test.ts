import { describe, expect, it } from 'vitest'
import { PALETTE } from './render'
import { SCENE_IDS, THEMES, isSceneId } from './themes'
import { applyMaterialTheme, materials } from '../scene/materials'

describe('scene themes', () => {
  it('every theme defines every palette colour as a valid hex', () => {
    for (const id of SCENE_IDS)
      for (const key of Object.keys(PALETTE))
        expect(THEMES[id].palette[key as keyof typeof PALETTE], `${id}.${key}`).toMatch(
          /^#[0-9a-f]{6}$/i,
        )
  })

  it('validates scene ids', () => {
    expect(isSceneId('office')).toBe(true)
    expect(isSceneId('hacker')).toBe(true)
    expect(isSceneId('x')).toBe(false)
    expect(isSceneId(null)).toBe(false)
  })

  it('recolours the shared materials in place and back', () => {
    const wall = materials.wall
    const sage = materials.fabricSage
    const led = materials.led
    applyMaterialTheme('hacker')
    expect(materials.wall).toBe(wall) // same instance: merged furniture keeps working
    expect(`#${wall.color.getHexString()}`).toBe(THEMES.hacker.palette.wallCream.toLowerCase())
    expect(`#${sage.color.getHexString()}`).toBe(THEMES.hacker.palette.sage.toLowerCase())
    expect(`#${led.emissive.getHexString()}`).toBe(THEMES.hacker.palette.ledGreen.toLowerCase())
    applyMaterialTheme('office')
    expect(`#${wall.color.getHexString()}`).toBe(THEMES.office.palette.wallCream.toLowerCase())
  })
})
