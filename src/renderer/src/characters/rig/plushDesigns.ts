import type { FeatureCtx, PlushDesign } from './plushRig'

// The six "mojojojo" flocked figures. Heads, ears and faces were measured from the product art
// (`mojojojo-y` for the duck, `mojojojo-all` for the series); the body is shared.
//
// Head tables are [half-width, height above the head bottom]. Series-art measurements were taken
// on a 4× crop where a figure is ~400 px wide; U converts them to the duck photo's pixel scale.

const U = 1.085
type Pt = [number, number]
const scale = (pts: Pt[]): Pt[] => pts.map(([a, b]) => [a * U, b * U])

interface EyeLook {
  /** Coloured ring behind the pupil (the "glass" rim of the eyes). */
  ring?: string
  ringR?: number
  pupil: string
  r: number
  /** Depth of the eye socket bead above the surface. */
  lid?: string
}

function eyes(ctx: FeatureCtx, x: number, y: number, look: EyeLook): void {
  for (const side of [1, -1] as const) {
    const bone = side === 1 ? 'eye_L' : 'eye_R'
    const ex = side * x
    const z = ctx.surfaceZ(ex, y)
    if (look.ring) {
      const rr = look.ringR ?? look.r * 1.3
      ctx.ellipsoid({ bone, at: [ex, y, z], radii: [rr, rr, 4], color: look.ring, mat: 'plastic' })
    }
    ctx.ellipsoid({
      bone,
      at: [ex, y, z + 1],
      radii: [look.r, look.r, look.r * 0.8],
      color: look.pupil,
      mat: 'gloss',
    })
    ctx.ellipsoid({
      bone,
      at: [ex - look.r * 0.3, y + look.r * 0.35, z + look.r * 0.7],
      radii: [look.r * 0.22, look.r * 0.22, look.r * 0.15],
      color: '#ffffff',
      mat: 'gloss',
    })
    if (look.lid) {
      // Half-closed lid: a flattened fur-coloured cap over the upper half of the eye.
      ctx.ellipsoid({
        bone,
        at: [ex, y + look.r * 0.55, z + 1],
        radii: [look.r * 1.35, look.r * 0.75, look.r * 0.95],
        color: look.lid,
        mat: 'plastic',
      })
    }
  }
}

/** Elliptical dome above the widest row: half-width a, height b, starting at height h0. */
function dome(a: number, b: number, h0: number): Pt[] {
  const pts: Pt[] = []
  for (let i = 1; i < 9; i++) {
    const phi = (i / 9) * (Math.PI / 2)
    pts.push([a * Math.cos(phi), h0 + b * Math.sin(phi)])
  }
  pts.push([0, h0 + b])
  return pts
}

// ---------------------------------------------------------------------------------------------
// You never know (the duck, `mojojojo-y`)

export const DUCK: PlushDesign = {
  id: 'duck',
  fur: '#f9c448',
  // Measured row by row from the product photo (head 262 px wide, 212 px tall); the dome above
  // the widest point is the ellipse that fits those rows (the raw rows are too noisy to light well).
  head: [
    [0, -3],
    [75, -2],
    [100, 2],
    [108, 6],
    [113, 17],
    [119, 29],
    [124, 41],
    [127.5, 53],
    [130, 65],
    [131, 77],
    [131.5, 89],
    ...dome(131.5, 123, 89),
  ],
  headDepth: 0.96,
  eye: { x: 34, y: 110 },
  features(ctx) {
    eyes(ctx, 34, 110, { ring: '#adb4bc', ringR: 15, pupil: '#1c1a19', r: 11 })
    // Bill (measured on a 4.5× crop of the face): a broad arched upper lip over a flatter pad,
    // flanked by two round knobs, all orange-red.
    const z = ctx.surfaceZ(0, 66)
    ctx.ellipsoid({ at: [0, 71, z + 9], radii: [31, 19, 15], color: '#ee4a1f', mat: 'plastic' })
    ctx.ellipsoid({ at: [0, 58, z + 7], radii: [33, 10, 13], color: '#df3b15', mat: 'plastic' })
    for (const side of [1, -1] as const) {
      ctx.ellipsoid({
        at: [side * 41, 63, ctx.surfaceZ(side * 41, 63) + 5],
        radii: [10.5, 10.5, 10],
        color: '#ee4a1f',
        mat: 'plastic',
      })
    }
  },
}

// ---------------------------------------------------------------------------------------------
// Kuro (black, rabbit-eared). Heads of the series are cushions in the outline below; the two
// rabbit-ear lobes are part of the outline (a cut-out between them).

export const KURO: PlushDesign = {
  id: 'kuro',
  fur: '#2a211b',
  head: scale([
    [0, -3],
    [95, 0],
    [116, 10],
    [123, 25],
    [125, 50],
    [126, 100],
    [125, 150],
    [124, 200],
    [122, 225],
    [116, 238],
    [104, 247],
    [85, 252],
    [55, 255],
    [0, 257],
  ]),
  cushion: {
    hole: scale([
      [0, 222],
      [7, 238],
      [13, 248],
      [14, 259],
    ]),
    thickness: 100,
    rim: 86,
  },
  headDepth: 0.9,
  eye: { x: 35, y: 117 },
  features(ctx) {
    eyes(ctx, 35, 117, { ring: '#a9c3d8', ringR: 21, pupil: '#15110f', r: 11.5 })
    ctx.heart({ at: [0, 62, ctx.surfaceZ(0, 62) + 1], width: 46, color: '#f089a6', tilt: 0.1 })
  },
}

// ---------------------------------------------------------------------------------------------
// Naughty (red bear)

export const NAUGHTY: PlushDesign = {
  id: 'naughty',
  fur: '#e5291d',
  head: scale([
    [0, -3],
    [105, 0],
    [138, 10],
    [148, 25],
    [151, 60],
    [152, 110],
    [150, 140],
    [153, 165],
    [148, 178],
    [130, 186],
    [100, 190],
    [60, 192],
    [0, 193],
  ]),
  cushion: { thickness: 112, rim: 98 },
  headDepth: 0.88,
  eye: { x: 36, y: 139 },
  features(ctx) {
    eyes(ctx, 36, 139, { ring: '#4a2418', ringR: 17, pupil: '#120d0b', r: 11.5 })
    const z = ctx.surfaceZ(0, 72)
    ctx.ellipsoid({ at: [0, 72, z - 8], radii: [73, 56, 22], color: '#fff3e6', mat: 'plastic' })
    ctx.heart({ at: [0, 86, ctx.surfaceZ(0, 86) + 17], width: 46, color: '#2438b8', tilt: 0.15 })
  },
}

// ---------------------------------------------------------------------------------------------
// Nicky (blue cat); the pointed ears are part of the outline.

export const NICKY: PlushDesign = {
  id: 'nicky',
  fur: '#1f3aa6',
  head: scale([
    [0, -3],
    [100, 0],
    [120, 10],
    [135, 30],
    [141, 80],
    [138, 120],
    [128, 150],
    [126, 160],
    [112, 190],
    [98, 210],
    [88, 225],
    [84, 234],
    [76, 238],
    [0, 240],
  ]),
  cushion: {
    hole: scale([
      [0, 168],
      [40, 200],
      [62, 225],
      [72, 238],
      [72, 242],
    ]),
    thickness: 100,
    rim: 88,
  },
  headDepth: 0.88,
  eye: { x: 34, y: 146 },
  features(ctx) {
    eyes(ctx, 34, 146, { ring: '#4c7d5e', ringR: 15, pupil: '#0e1210', r: 10.5 })
    const z = ctx.surfaceZ(0, 80)
    ctx.ellipsoid({ at: [0, 81, z - 8], radii: [73, 49, 20], color: '#f5f1ee', mat: 'plastic' })
    ctx.heart({ at: [0, 98, ctx.surfaceZ(0, 98) + 16], width: 43, color: '#e5303c', tilt: 0.15 })
    for (const side of [1, -1] as const) {
      for (const [dy, dyOut] of [
        [-4, 8],
        [-12, -2],
        [-20, -12],
      ] as const) {
        ctx.tube({
          a: [side * 14, 78 + dy, z + 14],
          b: [side * 62, 78 + dy + dyOut, z + 4],
          r: 1.4,
          color: '#8a7466',
        })
      }
    }
  },
}

// ---------------------------------------------------------------------------------------------
// Belle (pink, long shaggy fur)

export const BELLE: PlushDesign = {
  id: 'belle',
  fur: '#ecb4b0',
  shaggy: 1,
  head: scale([
    [0, -3],
    [100, 0],
    [135, 10],
    [147, 40],
    [148, 100],
    [146, 160],
    [140, 175],
    [125, 184],
    [90, 188],
    [0, 190],
  ]),
  cushion: { thickness: 110, rim: 96 },
  headDepth: 0.88,
  eye: { x: 35, y: 119 },
  features(ctx) {
    eyes(ctx, 35, 119, { ring: '#2f6b4a', ringR: 15, pupil: '#0f2a1c', r: 10.5, lid: '#e9a6b0' })
    ctx.heart({ at: [-13, 74, ctx.surfaceZ(-13, 74) + 2], width: 41, color: '#f29db4', tilt: 0.1 })
  },
}

// ---------------------------------------------------------------------------------------------
// John (cream dog with big black floppy ears)

export const JOHN: PlushDesign = {
  id: 'john',
  fur: '#f2e6bc',
  head: scale([
    [0, -3],
    [88, 0],
    [105, 12],
    [108, 50],
    [106, 110],
    [96, 150],
    [75, 170],
    [40, 177],
    [0, 179],
  ]),
  cushion: { thickness: 92, rim: 80 },
  headDepth: 0.88,
  eye: { x: 34, y: 103 },
  features(ctx) {
    eyes(ctx, 34, 103, { ring: '#5db4b8', ringR: 14, pupil: '#10201f', r: 9.5 })
    ctx.heart({ at: [0, 52, ctx.surfaceZ(0, 52) + 1], width: 52, color: '#e8342a', tilt: 0.1 })
    for (const side of [1, -1] as const) {
      ctx.ellipsoid({
        at: [side * 131, 114, -4],
        radii: [98, 45, 32],
        color: '#1d1a1a',
        mat: 'gloss',
        rot: [0, 0, side * -0.72],
      })
    }
  },
}

export const PLUSH_DESIGNS = [DUCK, KURO, NAUGHTY, NICKY, BELLE, JOHN] as const
