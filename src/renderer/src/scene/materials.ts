import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'
import { PALETTE } from '../config/render'
import { THEMES, type Palette, type SceneId } from '../config/themes'

// Shared, app-lifetime materials. Reusing instances keeps shader programs and state changes low;
// never create materials inline in props (SPEC §6 — material sharing).

type Key = keyof typeof PALETTE

const cache = new Map<string, MeshStandardMaterial>()
/** Which palette keys each shared material is made from (so a theme change can recolour it). */
const recipes = new Map<string, { color: Key; emissive?: Key }>()

/** The active palette; materials created later start from it. */
let current: Palette = PALETTE

function make(
  name: string,
  color: Key,
  opts: { roughness?: number; metalness?: number; emissive?: Key; emissiveIntensity?: number } = {},
): MeshStandardMaterial {
  const existing = cache.get(name)
  if (existing) return existing
  const mat = new MeshStandardMaterial({
    name,
    color: new Color(current[color]),
    roughness: opts.roughness ?? 0.75,
    metalness: opts.metalness ?? 0,
  })
  if (opts.emissive) {
    mat.emissive = new Color(current[opts.emissive])
    mat.emissiveIntensity = opts.emissiveIntensity ?? 1
  }
  cache.set(name, mat)
  recipes.set(name, { color, ...(opts.emissive ? { emissive: opts.emissive } : {}) })
  return mat
}

/** Dark floor with a glowing grid (the hacker scene). */
function gridTexture(): CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = current.floorWood
  ctx.fillRect(0, 0, size, size)
  const cells = 4
  const step = size / cells
  ctx.strokeStyle = '#19e3ff'
  ctx.shadowColor = '#19e3ff'
  ctx.shadowBlur = 6
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.55
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath()
    ctx.moveTo(i * step, 0)
    ctx.lineTo(i * step, size)
    ctx.moveTo(0, i * step)
    ctx.lineTo(size, i * step)
    ctx.stroke()
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/** Subtle plank pattern so the floor reads as wood without any downloaded texture. */
function plankTexture(): CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const base = new Color(current.floorWood)
  const dark = new Color(current.floorWoodDark)
  const rows = 10
  const rowH = size / rows
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let r = 0; r < rows; r++) {
    let x = -rand() * size * 0.5
    while (x < size) {
      const w = size * (0.3 + rand() * 0.35)
      const c = base.clone().lerp(dark, rand() * 0.4)
      ctx.fillStyle = `#${c.getHexString()}`
      ctx.fillRect(x, r * rowH, w, rowH)
      // fine grain
      ctx.globalAlpha = 0.06
      for (let g = 0; g < 6; g++) {
        ctx.fillStyle = g % 2 ? '#ffffff' : '#000000'
        ctx.fillRect(x, r * rowH + rand() * rowH, w, 1 + rand() * 1.5)
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(70,40,20,0.35)'
      ctx.fillRect(x, r * rowH, 2, rowH)
      x += w
    }
    ctx.fillStyle = 'rgba(70,40,20,0.3)'
    ctx.fillRect(0, r * rowH, size, 2)
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/** Four soft-edged window panes, used as the sunlight decal on the floor. */
function windowPaneTexture(): CanvasTexture {
  const w = 256
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.filter = 'blur(4px)'
  ctx.fillStyle = '#ffffff'
  const pad = 18
  const gap = 10
  const pw = (w - pad * 2 - gap) / 2
  const ph = (h - pad * 2 - gap) / 2
  for (const [i, j] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    ctx.fillRect(pad + i * (pw + gap), pad + j * (ph + gap), pw, ph)
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}

let floorMat: MeshStandardMaterial | null = null
let floorKind: 'plank' | 'grid' = 'plank'
let sunPatchMat: MeshBasicMaterial | null = null

/**
 * Re-dress every shared material for a scene theme, in place: merged static furniture keeps its
 * material instances, so nothing needs rebuilding.
 */
export function applyMaterialTheme(id: SceneId): void {
  const theme = THEMES[id]
  current = theme.palette
  floorKind = theme.floor
  for (const [name, mat] of cache) {
    const r = recipes.get(name)
    if (!r) continue
    mat.color.set(current[r.color])
    if (r.emissive) mat.emissive.set(current[r.emissive])
  }
  if (floorMat) {
    floorMat.map?.dispose()
    const map = theme.floor === 'grid' ? gridTexture() : plankTexture()
    map.repeat.set(theme.floor === 'grid' ? 1.35 : 2.7, theme.floor === 'grid' ? 1.35 : 2.7)
    floorMat.map = map
    floorMat.roughness = theme.floor === 'grid' ? 0.35 : 0.62
    floorMat.needsUpdate = true
  }
  sunPatchMat?.color.set(current.sunPatch)
}

export const materials = {
  get floor() {
    if (!floorMat) {
      const map = floorKind === 'grid' ? gridTexture() : plankTexture()
      map.repeat.set(floorKind === 'grid' ? 1.35 : 2.7, floorKind === 'grid' ? 1.35 : 2.7)
      floorMat = new MeshStandardMaterial({
        name: 'floor',
        map,
        roughness: floorKind === 'grid' ? 0.35 : 0.62,
      })
    }
    return floorMat
  },
  get sunPatch() {
    if (!sunPatchMat) {
      sunPatchMat = new MeshBasicMaterial({
        name: 'sunPatch',
        map: windowPaneTexture(),
        color: new Color(current.sunPatch),
        transparent: true,
        opacity: 0.6,
        blending: AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      })
    }
    return sunPatchMat
  },
  get wall() {
    return make('wall', 'wallCream', { roughness: 0.92 })
  },
  get trim() {
    return make('trim', 'wallTrim', { roughness: 0.8 })
  },
  get woodLight() {
    return make('woodLight', 'woodLight', { roughness: 0.6 })
  },
  get woodMid() {
    return make('woodMid', 'woodMid', { roughness: 0.6 })
  },
  get woodDark() {
    return make('woodDark', 'woodDark', { roughness: 0.65 })
  },
  get fabricSage() {
    return make('fabricSage', 'sage', { roughness: 0.95 })
  },
  get fabricTerracotta() {
    return make('fabricTerracotta', 'terracotta', { roughness: 0.95 })
  },
  get fabricMustard() {
    return make('fabricMustard', 'mustard', { roughness: 0.95 })
  },
  get fabricBlue() {
    return make('fabricBlue', 'dustyBlue', { roughness: 0.9 })
  },
  get rug() {
    return make('rug', 'blush', { roughness: 1 })
  },
  get leaf() {
    return make('leaf', 'sage', { roughness: 0.7 })
  },
  get leafDark() {
    return make('leafDark', 'sageDark', { roughness: 0.7 })
  },
  get ceramic() {
    return make('ceramic', 'offWhite', { roughness: 0.35 })
  },
  get terracottaPot() {
    return make('terracottaPot', 'terracotta', { roughness: 0.8 })
  },
  get charcoal() {
    return make('charcoal', 'charcoal', { roughness: 0.5 })
  },
  get metal() {
    return make('metal', 'metal', { roughness: 0.35, metalness: 0.6 })
  },
  get screen() {
    return make('screen', 'charcoal', {
      roughness: 0.2,
      emissive: 'screenGlow',
      emissiveIntensity: 1.4,
    })
  },
  get led() {
    return make('led', 'charcoal', { emissive: 'ledGreen', emissiveIntensity: 3 })
  },
  get lampGlow() {
    return make('lampGlow', 'offWhite', { emissive: 'mustard', emissiveIntensity: 2.2 })
  },
  get frame() {
    return make('frame', 'offWhite', { roughness: 0.5 })
  },
  get windowGlass() {
    return make('windowGlass', 'offWhite', {
      roughness: 0.2,
      emissive: 'windowLight',
      emissiveIntensity: 0.9,
    })
  },
  get paper() {
    return make('paper', 'offWhite', { roughness: 0.9 })
  },
  get bookRed() {
    return make('bookRed', 'terracotta', { roughness: 0.8 })
  },
  get fabricSageLight() {
    return make('fabricSageLight', 'sageLight', { roughness: 0.95 })
  },
  get lampShade() {
    return make('lampShade', 'lampShade', {
      roughness: 0.9,
      emissive: 'mustard',
      emissiveIntensity: 0.25,
    })
  },
  /** White base so per-instance colors show through unchanged. */
  get book() {
    return make('book', 'white', { roughness: 0.8 })
  },
  get terminalScreen() {
    return make('terminalScreen', 'terminalBg', {
      roughness: 0.25,
      emissive: 'terminalBg',
      emissiveIntensity: 0.6,
    })
  },
  get screenIdle() {
    return make('screenIdle', 'charcoal', {
      roughness: 0.2,
      emissive: 'screenGlow',
      emissiveIntensity: 0.25,
    })
  },
  get screenError() {
    return make('screenError', 'charcoal', {
      roughness: 0.2,
      emissive: 'screenError',
      emissiveIntensity: 1.8,
    })
  },
  get terminalTextDim() {
    return make('terminalTextDim', 'terminalGreen', {
      emissive: 'terminalGreen',
      emissiveIntensity: 0.35,
    })
  },
  get terminalText() {
    return make('terminalText', 'terminalGreen', {
      emissive: 'terminalGreen',
      emissiveIntensity: 1.6,
    })
  },
  get rackPanel() {
    return make('rackPanel', 'rackPanel', { roughness: 0.45, metalness: 0.3 })
  },
  get ledAmber() {
    return make('ledAmber', 'charcoal', { emissive: 'ledAmber', emissiveIntensity: 3 })
  },
  get skin() {
    return make('skin', 'skin', { roughness: 0.6 })
  },
  get hair() {
    return make('hair', 'hair', { roughness: 0.7 })
  },
  get eye() {
    return make('eye', 'eye', { roughness: 0.3 })
  },
  get eyeHighlight() {
    return make('eyeHighlight', 'white', { emissive: 'white', emissiveIntensity: 0.6 })
  },
  get cheek() {
    return make('cheek', 'cheek', { roughness: 0.8 })
  },
  get shirt() {
    return make('shirt', 'dustyBlue', { roughness: 0.85 })
  },
  get pants() {
    return make('pants', 'charcoal', { roughness: 0.85 })
  },
}
