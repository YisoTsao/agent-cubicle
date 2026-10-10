import { BACKGROUND, LIGHTING, PALETTE } from './render'

// Scene themes: the same room, furniture and walking routes, dressed differently. A theme swaps
// the colour palette (every shared material follows), the lighting, the backdrop and the bloom,
// and may add decor. Character bodies never change with the scene, only a little gear
// (hacker headset / glasses) is added.

export type Palette = { [K in keyof typeof PALETTE]: string }

export type SceneId = 'office' | 'hacker'

export interface Lighting {
  sun: { position: [number, number, number]; intensity: number; color: string }
  hemisphere: { sky: string; ground: string; intensity: number }
  environmentIntensity: number
  /** Coloured point lights (world position), used for the neon glow. */
  accents: {
    color: string
    position: [number, number, number]
    intensity: number
    distance: number
  }[]
}

export interface SceneTheme {
  id: SceneId
  name: string
  note: string
  palette: Palette
  background: string
  lighting: Lighting
  bloom: { intensity: number; threshold: number }
  floor: 'plank' | 'grid'
  /** Spines of the books on the shelf. */
  bookColors: string[]
  /** Vignette strength. */
  vignette: number
}

const office: SceneTheme = {
  id: 'office',
  name: '溫暖辦公室',
  note: '原本的暖色小辦公室',
  palette: { ...PALETTE },
  background: BACKGROUND,
  lighting: {
    sun: {
      position: LIGHTING.sun.position,
      intensity: LIGHTING.sun.intensity,
      color: LIGHTING.sun.color,
    },
    hemisphere: { ...LIGHTING.hemisphere },
    environmentIntensity: LIGHTING.environmentIntensity,
    accents: [],
  },
  bloom: { intensity: 0.55, threshold: 0.9 },
  floor: 'plank',
  bookColors: [
    PALETTE.terracotta,
    PALETTE.mustard,
    PALETTE.dustyBlue,
    PALETTE.sage,
    PALETTE.offWhite,
    PALETTE.blush,
    PALETTE.woodDark,
  ],
  vignette: 0.35,
}

const hacker: SceneTheme = {
  id: 'hacker',
  name: '駭客基地',
  note: '深色霓虹、綠色終端機',
  palette: {
    ...PALETTE,
    wallCream: '#101729',
    wallTrim: '#1a2540',
    floorWood: '#0c1020',
    floorWoodDark: '#080b17',
    woodLight: '#262f4d',
    woodMid: '#1b2340',
    woodDark: '#121832',
    sage: '#2b3150',
    sageDark: '#20253f',
    sageLight: '#3a4166',
    terracotta: '#6a2a8c',
    mustard: '#19e3ff',
    dustyBlue: '#2c64ff',
    blush: '#221238',
    charcoal: '#090b12',
    offWhite: '#c9d3ff',
    metal: '#6b7a9c',
    screenGlow: '#46ffb2',
    windowLight: '#2438ff',
    sunPatch: '#2a58ff',
    terminalGreen: '#39ff14',
    terminalBg: '#021a0d',
    ledGreen: '#39ff14',
    ledAmber: '#ff2bd6',
    rackPanel: '#1c2340',
    lampShade: '#0e2a33',
    skin: PALETTE.skin,
    hair: PALETTE.hair,
    eye: PALETTE.eye,
    cheek: PALETTE.cheek,
  },
  background: '#04060d',
  lighting: {
    sun: { position: [-6, 10, 5], intensity: 0.55, color: '#7a92ff' },
    hemisphere: { sky: '#1b2a63', ground: '#06070f', intensity: 0.85 },
    environmentIntensity: 0.22,
    accents: [
      { color: '#19e3ff', position: [-1.5, 1.7, -1.4], intensity: 2.6, distance: 4.5 },
      { color: '#ff2bd6', position: [-1.9, 1.3, 1.1], intensity: 1.8, distance: 4 },
      { color: '#39ff14', position: [1.2, 1.5, -1.8], intensity: 2.4, distance: 4 },
    ],
  },
  bloom: { intensity: 1.15, threshold: 0.55 },
  floor: 'grid',
  bookColors: ['#19e3ff', '#ff2bd6', '#39ff14', '#2c64ff', '#8a5cff', '#c9d3ff', '#1b2340'],
  vignette: 0.6,
}

export const THEMES: Record<SceneId, SceneTheme> = { office, hacker }
export const SCENE_IDS = Object.keys(THEMES) as SceneId[]
export const DEFAULT_SCENE: SceneId = 'office'

export function isSceneId(v: unknown): v is SceneId {
  return typeof v === 'string' && v in THEMES
}
