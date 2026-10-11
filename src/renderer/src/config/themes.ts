import { BACKGROUND, LIGHTING, PALETTE } from './render'

// Scene themes: the same room, furniture and walking routes, dressed differently. A theme swaps
// the colour palette (every shared material follows), the lighting, the backdrop and the bloom,
// and may add decor. Character bodies never change with the scene, only a little gear
// (hacker headset / glasses) is added.

export type Palette = { [K in keyof typeof PALETTE]: string }

export type SceneId = 'office' | 'hacker' | 'night' | 'space'

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
  /** Which furniture set is drawn (same footprints, different look). */
  furniture: 'office' | 'space'
  /** What surrounds the floating room. */
  sky: 'none' | 'night' | 'space'
  /** Per-material tweaks that are not colours (glow strength). */
  tweaks?: Record<string, { emissiveIntensity?: number }>
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
  furniture: 'office',
  sky: 'none',
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
  furniture: 'office',
  sky: 'none',
}

const night: SceneTheme = {
  id: 'night',
  name: '夜晚小屋',
  note: '同樣的擺設，夜裡的暖燈與月光',
  palette: {
    ...PALETTE,
    wallCream: '#3d3558',
    wallTrim: '#4d4370',
    floorWood: '#5b3e3c',
    floorWoodDark: '#432a2e',
    woodLight: '#8c5c48',
    woodMid: '#6b4337',
    woodDark: '#4a2c2a',
    sage: '#40595a',
    sageDark: '#2f4647',
    sageLight: '#547372',
    terracotta: '#a8554f',
    mustard: '#f4b84a',
    dustyBlue: '#4f6aa8',
    blush: '#7e4a6c',
    charcoal: '#1d1b28',
    offWhite: '#eadccb',
    metal: '#8b90aa',
    screenGlow: '#8fd0ff',
    windowLight: '#3d4fd0',
    sunPatch: '#5b79ff',
    lampShade: '#ffd9a0',
    ledGreen: '#7dffa8',
  },
  background: '#0a0d22',
  lighting: {
    sun: { position: [-6, 10, 5], intensity: 0.7, color: '#93abff' },
    hemisphere: { sky: '#2c3170', ground: '#170f1f', intensity: 0.8 },
    environmentIntensity: 0.3,
    accents: [
      { color: '#ffb45a', position: [-1.3, 1.15, -2.0], intensity: 2.2, distance: 3.2 },
      { color: '#ffb45a', position: [1.5, 1.05, 0.1], intensity: 1.8, distance: 3.2 },
      { color: '#ff9a3c', position: [-0.55, 0.65, 1.3], intensity: 1.2, distance: 2.2 },
    ],
  },
  bloom: { intensity: 0.85, threshold: 0.72 },
  floor: 'plank',
  bookColors: ['#c46a5a', '#e8b04a', '#6c8ac4', '#6fa08a', '#eadccb', '#b07a9a', '#4a2c2a'],
  vignette: 0.5,
  furniture: 'office',
  sky: 'night',
  tweaks: { lampShade: { emissiveIntensity: 1.5 }, lampGlow: { emissiveIntensity: 4 } },
}

const space: SceneTheme = {
  id: 'space',
  name: '太空站',
  note: '金屬艙壁、舷窗外的地球，人物穿太空服',
  palette: {
    ...PALETTE,
    wallCream: '#cfd6e2',
    wallTrim: '#8e98ab',
    floorWood: '#3a4152',
    floorWoodDark: '#262b38',
    woodLight: '#dfe4ec',
    woodMid: '#aab3c2',
    woodDark: '#5a6376',
    sage: '#2a3342',
    sageDark: '#1f2733',
    sageLight: '#3a4558',
    terracotta: '#ff7a1a',
    mustard: '#ffd21a',
    dustyBlue: '#3b82f6',
    blush: '#2a3342',
    charcoal: '#161a24',
    offWhite: '#eef2f8',
    metal: '#a7b0c0',
    screenGlow: '#4de3ff',
    windowLight: '#3a7bff',
    sunPatch: '#9fc4ff',
    terminalGreen: '#43ff8a',
    terminalBg: '#04141f',
    ledGreen: '#43ff8a',
    ledAmber: '#ff9a1a',
    rackPanel: '#2a3342',
    lampShade: '#dfe8ff',
  },
  background: '#02030a',
  lighting: {
    sun: { position: [-6, 10, 5], intensity: 2.4, color: '#eaf1ff' },
    hemisphere: { sky: '#9db4ff', ground: '#1b1f2e', intensity: 0.55 },
    environmentIntensity: 0.5,
    accents: [
      { color: '#4de3ff', position: [-1.5, 1.7, -1.4], intensity: 1.2, distance: 4.5 },
      { color: '#ff7a1a', position: [-1.9, 1.4, 1.0], intensity: 0.5, distance: 3.2 },
      { color: '#43ff8a', position: [1.2, 1.5, -1.8], intensity: 1.1, distance: 4 },
    ],
  },
  bloom: { intensity: 0.7, threshold: 0.8 },
  floor: 'grid',
  bookColors: ['#ff7a1a', '#4de3ff', '#eef2f8', '#ffd21a', '#43ff8a', '#aab3c2', '#3b82f6'],
  vignette: 0.4,
  furniture: 'space',
  sky: 'space',
}

export const THEMES: Record<SceneId, SceneTheme> = { office, hacker, night, space }
export const SCENE_IDS = Object.keys(THEMES) as SceneId[]
export const DEFAULT_SCENE: SceneId = 'office'

export function isSceneId(v: unknown): v is SceneId {
  return typeof v === 'string' && v in THEMES
}
