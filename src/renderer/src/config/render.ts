import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three'

// Single source of truth for rendering (SPEC §6). Scene code reads from here; never hardcode.

export type QualityLevel = 'high' | 'balanced' | 'low'

export interface QualityPreset {
  maxDpr: number
  shadowMapSize: number
  shadows: boolean
  ambientOcclusion: boolean
  bloom: boolean
  antialias: 'smaa' | 'none'
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  high: {
    maxDpr: 2,
    shadowMapSize: 2048,
    shadows: true,
    ambientOcclusion: true,
    bloom: true,
    antialias: 'smaa',
  },
  balanced: {
    maxDpr: 1.5,
    shadowMapSize: 1024,
    shadows: true,
    ambientOcclusion: true,
    bloom: true,
    antialias: 'smaa',
  },
  low: {
    maxDpr: 1,
    shadowMapSize: 512,
    shadows: true,
    ambientOcclusion: false,
    bloom: false,
    antialias: 'none',
  },
}

export const RENDERER = {
  toneMapping: ACESFilmicToneMapping,
  toneMappingExposure: 1.14,
  outputColorSpace: SRGBColorSpace,
  shadowMapType: PCFSoftShadowMap,
} as const

/** True isometric: camera looks down the (1,1,1) diagonal → ≈35.264° elevation, 45° azimuth. */
export const CAMERA = {
  position: [12, 12, 12] as [number, number, number],
  target: [0, 1.3, 0] as [number, number, number],
  /** World units visible vertically at zoom 1; zoom is derived from viewport height. */
  frameHeight: 7.5,
  near: 0.1,
  far: 100,
}

export const LIGHTING = {
  sun: {
    position: [-6, 10, 5] as [number, number, number],
    intensity: 2.6,
    color: '#ffdcae',
    shadowBias: -0.0004,
    shadowNormalBias: 0.02,
    shadowRadius: 6,
    shadowExtent: 5.2,
  },
  hemisphere: { sky: '#fff1dc', ground: '#d2a982', intensity: 1.0 },
  environmentIntensity: 0.55,
}

export const BACKGROUND = '#f1e5d3'

/** Cozy low-saturation palette. All scene colors come from here to keep the art direction coherent. */
export const PALETTE = {
  wallCream: '#f3e2c8',
  wallTrim: '#d8c3a5',
  floorWood: '#c99a6b',
  floorWoodDark: '#b9875a',
  woodLight: '#d4a774',
  woodMid: '#b07c4f',
  woodDark: '#7d5638',
  sage: '#8fae8b',
  sageDark: '#6b8f6a',
  sageLight: '#a6c0a0',
  terracotta: '#d4866a',
  mustard: '#e3b75a',
  dustyBlue: '#7d9bb8',
  blush: '#e8b4a6',
  charcoal: '#3e3a37',
  offWhite: '#f8f3ea',
  metal: '#9aa0a6',
  screenGlow: '#9fd4ff',
  windowLight: '#ffe9c4',
  sunPatch: '#ffcf8e',
  terminalGreen: '#5dffa0',
  ledGreen: '#7dffa8',
  ledAmber: '#ffc46b',
  rackPanel: '#55504b',
  terminalBg: '#1d2a2a',
  white: '#ffffff',
  lampShade: '#f4e6cc',
  skin: '#f1c7a5',
  hair: '#4a3328',
  eye: '#2b2220',
  cheek: '#f0a39a',
} as const
