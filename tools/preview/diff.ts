import { readFileSync } from 'node:fs'

// Silhouette comparison between a reference image and a render (both flattened over a flat
// background, written as ASCII PGM: 0 = figure). Prints the IoU and per-row extents.
//   tsx tools/preview/diff.ts ref.pgm render.pgm [rowStep]

interface Mask {
  w: number
  h: number
  px: number[]
}

function load(file: string): Mask {
  const t = readFileSync(file, 'utf8').split(/\s+/).filter(Boolean)
  return { w: Number(t[1]), h: Number(t[2]), px: t.slice(4).map(Number) }
}

const [refFile, mineFile, stepArg] = process.argv.slice(2)
if (!refFile || !mineFile) throw new Error('usage: diff.ts ref.pgm render.pgm [rowStep]')
const a = load(refFile)
const b = load(mineFile)
if (a.w !== b.w || a.h !== b.h) throw new Error(`size mismatch ${a.w}x${a.h} vs ${b.w}x${b.h}`)

let inter = 0
let union = 0
const rows: { y: number; ra: [number, number]; rb: [number, number] }[] = []
for (let y = 0; y < a.h; y++) {
  const ra: [number, number] = [1e9, -1]
  const rb: [number, number] = [1e9, -1]
  for (let x = 0; x < a.w; x++) {
    const fa = a.px[y * a.w + x] === 0
    const fb = b.px[y * a.w + x] === 0
    if (fa && fb) inter++
    if (fa || fb) union++
    if (fa) {
      ra[0] = Math.min(ra[0], x)
      ra[1] = Math.max(ra[1], x)
    }
    if (fb) {
      rb[0] = Math.min(rb[0], x)
      rb[1] = Math.max(rb[1], x)
    }
  }
  if (ra[1] >= 0 || rb[1] >= 0) rows.push({ y, ra, rb })
}
console.log('IoU', (inter / union).toFixed(4))
const step = Number(stepArg ?? 12)
const fmt = (r: [number, number]) =>
  r[1] < 0 ? '   -    ' : `${String(r[0]).padStart(3)}..${String(r[1]).padStart(3)}`
for (const { y, ra, rb } of rows)
  if (y % step === 0)
    console.log(
      String(y).padStart(3),
      'ref',
      fmt(ra),
      ' mine',
      fmt(rb),
      ' dL',
      rb[0] - ra[0],
      ' dR',
      rb[1] - ra[1],
    )
