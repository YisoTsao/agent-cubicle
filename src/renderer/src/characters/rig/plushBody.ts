import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three'
import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js'

// The body of every plush figure: one soft cushion whose outline is the toy's silhouette
// (shoulders, arm bulges, belly, two stubby legs and the notch between them) and whose thickness
// rounds off towards the edge like a stuffed pillow. Built once by sampling an implicit surface
//
//      f(x, y, z) = T(x, y)² − z²        T = thickness from the distance to the outline
//
// with marching cubes, so there are no seams between torso, arms and legs. Coordinates here are
// the reference-photo pixels of plushRig.ts: x from the figure's axis, y down from the top.

type Pt = [number, number]

export interface BodyShell {
  /** px: x right of the axis, y down (photo rows), z forward. */
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

const CELL = 2.5
const MASK_STEP = 1.5

function lerpTable(table: Pt[], y: number): number {
  if (y <= table[0]![1] || y >= table[table.length - 1]![1]) return 0
  for (let i = 1; i < table.length; i++) {
    const [h1, y1] = table[i]!
    const [h0, y0] = table[i - 1]!
    if (y <= y1) return h0 + ((h1 - h0) * (y - y0)) / Math.max(1e-6, y1 - y0)
  }
  return 0
}

/** 1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s: number
    for (;;) {
      const p = v[k]!
      s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p)
      if (s <= z[k]!) k--
      else break
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++
    const p = v[k]!
    d[q] = (q - p) * (q - p) + f[p]!
  }
}

/** Squared distance from every cell to the nearest cell where `seed` is 1. */
function edt2d(seed: Uint8Array, w: number, h: number): Float64Array {
  const INF = 1e12
  const g = new Float64Array(w * h)
  for (let i = 0; i < g.length; i++) g[i] = seed[i] ? 0 : INF
  const n = Math.max(w, h)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x]!
    edt1d(f, h, d, v, z)
    for (let y = 0; y < h; y++) g[y * w + x] = d[y]!
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x]!
    edt1d(f, w, d, v, z)
    for (let x = 0; x < w; x++) g[y * w + x] = d[x]!
  }
  return g
}

function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 3)
  const kernel: number[] = []
  let sum = 0
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel.push(v)
    sum += v
  }
  const k = kernel.map((v) => v / sum)
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0
      for (let i = -r; i <= r; i++)
        a += src[y * w + Math.min(w - 1, Math.max(0, x + i))]! * k[i + r]!
      tmp[y * w + x] = a
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0
      for (let i = -r; i <= r; i++)
        a += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]! * k[i + r]!
      out[y * w + x] = a
    }
  return out
}

export interface BodySpec {
  /** Half-width per row of the upper body incl. arms (table of [half-width, y]). */
  upper: Pt[]
  /** Half-width per row of one leg, and the leg axis (px from the figure's axis). */
  leg?: Pt[]
  legAxis?: number
  /** Optional central cut-out per row: |x| below this is outside (the dip between two ears). */
  hole?: Pt[]
  /** Half-thickness of the cushion (px) and the width of the rounded rim. */
  thickness: number
  rim: number
  /** Super-ellipse exponent of the rim profile (higher = squarer edge). */
  rimPower: number
  /** Gaussian blur (px) of the distance field: softens armpits and the leg notch. */
  soften: number
  /** Above `neck.y` the cushion is only `neck.thickness` thick; it eases to full by `neck.full`. */
  neck?: { y: number; full: number; thickness: number }
}

export function buildBodyShell(spec: BodySpec): BodyShell {
  const tables = [spec.upper, spec.leg ?? []]
  const ys = tables.flatMap((t) => t.map(([, y]) => y))
  const maxHw = Math.max(
    ...spec.upper.map(([hw]) => hw),
    ...(spec.leg ?? []).map(([hw]) => hw + (spec.legAxis ?? 0)),
  )
  const X0 = -Math.ceil(maxHw + 14)
  const X1 = -X0
  const Y0 = Math.floor(Math.min(...ys) - 12)
  const Y1 = Math.ceil(Math.max(...ys) + 12)
  const w = Math.ceil((X1 - X0) / MASK_STEP)
  const h = Math.ceil((Y1 - Y0) / MASK_STEP)

  // Silhouette mask.
  const inside = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    const y = Y0 + (j + 0.5) * MASK_STEP
    const hw = lerpTable(spec.upper, y)
    const lw = spec.leg ? lerpTable(spec.leg, y) : 0
    const hole = spec.hole ? lerpTable(spec.hole, y) : 0
    for (let i = 0; i < w; i++) {
      const x = X0 + (i + 0.5) * MASK_STEP
      const inBody = Math.abs(x) <= hw && Math.abs(x) >= hole
      const inLeg = lw > 0 && Math.abs(Math.abs(x) - (spec.legAxis ?? 0)) <= lw
      if (inBody || inLeg) inside[j * w + i] = 1
    }
  }
  const outside = new Uint8Array(w * h)
  for (let i = 0; i < outside.length; i++) outside[i] = inside[i] ? 0 : 1
  const dIn = edt2d(outside, w, h) // distance of inside cells to the nearest outside cell
  const dOut = edt2d(inside, w, h)
  const signed = new Float32Array(w * h)
  for (let i = 0; i < signed.length; i++)
    signed[i] = inside[i] ? Math.sqrt(dIn[i]!) * MASK_STEP : -Math.sqrt(dOut[i]!) * MASK_STEP
  const soft = gaussianBlur(signed, w, h, spec.soften / MASK_STEP)

  // Thickness T(x, y) on the mask grid.
  const thick = new Float32Array(w * h)
  for (let i = 0; i < thick.length; i++) {
    const t = Math.min(1, Math.max(0, soft[i]! / spec.rim))
    thick[i] = spec.thickness * (1 - (1 - t) ** spec.rimPower) ** (1 / spec.rimPower)
  }
  const neckCap = (y: number): number => {
    if (!spec.neck) return Infinity
    const { y: y0, full, thickness } = spec.neck
    const t = Math.min(1, Math.max(0, (y - y0) / (full - y0)))
    return thickness + (spec.thickness - thickness) * t * t * (3 - 2 * t)
  }
  const sample = (x: number, y: number): number => {
    const fx = (x - X0) / MASK_STEP - 0.5
    const fy = (y - Y0) / MASK_STEP - 0.5
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    if (ix < 0 || iy < 0 || ix >= w - 1 || iy >= h - 1) return 0
    const ax = fx - ix
    const ay = fy - iy
    const a = thick[iy * w + ix]!
    const b = thick[iy * w + ix + 1]!
    const c = thick[(iy + 1) * w + ix]!
    const d = thick[(iy + 1) * w + ix + 1]!
    return Math.min(neckCap(y), (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay)
  }

  // Marching cubes over the field f = T − |z|.
  const Z = spec.thickness + 6
  const nx = Math.ceil((X1 - X0) / CELL) + 1
  const ny = Math.ceil((Y1 - Y0) / CELL) + 1
  const nz = Math.ceil((2 * Z) / CELL) + 1
  const val = new Float32Array(nx * ny * nz)
  const at = (i: number, j: number, k: number) => (k * ny + j) * nx + i
  for (let k = 0; k < nz; k++) {
    const z = -Z + k * CELL
    for (let j = 0; j < ny; j++) {
      const y = Y0 + j * CELL
      for (let i = 0; i < nx; i++) {
        const x = X0 + i * CELL
        // Smooth in z (no |z| kink at the mid-plane): the surface is z² = T².
        const t = sample(x, y)
        val[at(i, j, k)] = (z * z - t * t) / Z // negative inside
      }
    }
  }

  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const cache = new Map<number, number>()
  const corner: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ]
  const edgeCorners: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ]
  const cv = new Float32Array(8)
  const edgeVertex = (ci: number, cj: number, ck: number, e: number): number => {
    const [a, b] = edgeCorners[e]!
    const A = corner[a]!
    const B = corner[b]!
    const na = at(ci + A[0], cj + A[1], ck + A[2])
    const nb = at(ci + B[0], cj + B[1], ck + B[2])
    const lo = Math.min(na, nb)
    const axis = A[0] !== B[0] ? 0 : A[1] !== B[1] ? 1 : 2
    const key = lo * 3 + axis
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const va = cv[a]!
    const vb = cv[b]!
    const t = va === vb ? 0.5 : -va / (vb - va)
    const x = X0 + (ci + A[0] + (B[0] - A[0]) * t) * CELL
    const y = Y0 + (cj + A[1] + (B[1] - A[1]) * t) * CELL
    const z = -Z + (ck + A[2] + (B[2] - A[2]) * t) * CELL
    // Normal of f = T − |z|: (−∂T/∂x, −∂T/∂y, sign z), pointing out of the cushion.
    const e1 = 1.5
    const tx = (sample(x + e1, y) - sample(x - e1, y)) / (2 * e1)
    const ty = (sample(x, y + e1) - sample(x, y - e1)) / (2 * e1)
    let nxv = -tx
    let nyv = -ty
    let nzv = z >= 0 ? 1 : -1
    const len = Math.hypot(nxv, nyv, nzv) || 1
    nxv /= len
    nyv /= len
    nzv /= len
    const idx = positions.length / 3
    positions.push(x, y, z)
    normals.push(nxv, nyv, nzv)
    cache.set(key, idx)
    return idx
  }

  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let cubeIndex = 0
        for (let c = 0; c < 8; c++) {
          const o = corner[c]!
          const v = val[at(i + o[0], j + o[1], k + o[2])]!
          cv[c] = v
          if (v < 0) cubeIndex |= 1 << c
        }
        if (edgeTable[cubeIndex] === 0) continue
        const base = cubeIndex << 4
        for (let t = 0; triTable[base + t]! !== -1; t += 3) {
          const a = edgeVertex(i, j, k, triTable[base + t]!)
          const b = edgeVertex(i, j, k, triTable[base + t + 1]!)
          const c = edgeVertex(i, j, k, triTable[base + t + 2]!)
          if (a === b || b === c || a === c) continue
          // Wind the triangle so its face normal agrees with the field normal.
          const pa = a * 3
          const pb = b * 3
          const pc = c * 3
          const ux = positions[pb]! - positions[pa]!
          const uy = positions[pb + 1]! - positions[pa + 1]!
          const uz = positions[pb + 2]! - positions[pa + 2]!
          const vx = positions[pc]! - positions[pa]!
          const vy = positions[pc + 1]! - positions[pa + 1]!
          const vz = positions[pc + 2]! - positions[pa + 2]!
          const fx = uy * vz - uz * vy
          const fy = uz * vx - ux * vz
          const fz = ux * vy - uy * vx
          const dot = fx * normals[pa]! + fy * normals[pa + 1]! + fz * normals[pa + 2]!
          if (dot >= 0) indices.push(a, b, c)
          else indices.push(a, c, b)
        }
      }

  const shell: BodyShell = {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  }
  taubinSmooth(shell.positions, shell.indices, 12)
  return shell
}

/**
 * Taubin (λ|μ) smoothing: removes the grid terraces marching cubes leaves on steep walls without
 * shrinking the shape the way plain Laplacian smoothing does.
 */
function taubinSmooth(pos: Float32Array, index: Uint32Array, iterations: number): void {
  const n = pos.length / 3
  const sets: Set<number>[] = Array.from({ length: n }, () => new Set<number>())
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]!
    const b = index[t + 1]!
    const c = index[t + 2]!
    sets[a]!.add(b).add(c)
    sets[b]!.add(a).add(c)
    sets[c]!.add(a).add(b)
  }
  const nbr = sets.map((s) => Uint32Array.from(s))
  const tmp = new Float32Array(pos.length)
  const pass = (factor: number) => {
    for (let i = 0; i < n; i++) {
      const list = nbr[i]!
      if (list.length === 0) {
        tmp[i * 3] = pos[i * 3]!
        tmp[i * 3 + 1] = pos[i * 3 + 1]!
        tmp[i * 3 + 2] = pos[i * 3 + 2]!
        continue
      }
      let x = 0
      let y = 0
      let z = 0
      for (const j of list) {
        x += pos[j * 3]!
        y += pos[j * 3 + 1]!
        z += pos[j * 3 + 2]!
      }
      x /= list.length
      y /= list.length
      z /= list.length
      tmp[i * 3] = pos[i * 3]! + factor * (x - pos[i * 3]!)
      tmp[i * 3 + 1] = pos[i * 3 + 1]! + factor * (y - pos[i * 3 + 1]!)
      tmp[i * 3 + 2] = pos[i * 3 + 2]! + factor * (z - pos[i * 3 + 2]!)
    }
    pos.set(tmp)
  }
  for (let it = 0; it < iterations; it++) {
    pass(0.55)
    pass(-0.58)
  }
}

/** Height of the shell's front surface at (x, y) in shell pixels (0 if there is none nearby). */
export function frontZ(shell: BodyShell): (x: number, y: number) => number {
  const step = 2
  const cells = new Map<number, number>()
  const key = (cx: number, cy: number) => cx * 4096 + cy
  const p = shell.positions
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 2]! <= 0) continue
    const k = key(Math.round(p[i]! / step) + 1024, Math.round(p[i + 1]! / step) + 1024)
    cells.set(k, Math.max(cells.get(k) ?? 0, p[i + 2]!))
  }
  return (x, y) => {
    const cx = Math.round(x / step) + 1024
    const cy = Math.round(y / step) + 1024
    for (let r = 0; r <= 4; r++) {
      let best = 0
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++)
          best = Math.max(best, cells.get(key(cx + dx, cy + dy)) ?? 0)
      if (best > 0) return best
    }
    return 0
  }
}

/** A fresh BufferGeometry from a shell, converted to metres by `toModel`. */
export function shellGeometry(
  shell: BodyShell,
  toModel: (x: number, y: number, z: number) => [number, number, number],
): BufferGeometry {
  const n = shell.positions.length / 3
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const [x, y, z] = toModel(
      shell.positions[i * 3]!,
      shell.positions[i * 3 + 1]!,
      shell.positions[i * 3 + 2]!,
    )
    pos.set([x, y, z], i * 3)
    // Photo rows grow downwards: flip the y component of the normal like the position.
    nor.set([shell.normals[i * 3]!, -shell.normals[i * 3 + 1]!, shell.normals[i * 3 + 2]!], i * 3)
  }
  // Flipping y mirrors the mesh, which reverses every triangle: swap two corners of each.
  const idx = new Uint32Array(shell.indices.length)
  for (let t = 0; t < idx.length; t += 3) {
    idx[t] = shell.indices[t]!
    idx[t + 1] = shell.indices[t + 2]!
    idx[t + 2] = shell.indices[t + 1]!
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setIndex(new Uint32BufferAttribute(idx, 1))
  g.computeVertexNormals()
  return g
}
