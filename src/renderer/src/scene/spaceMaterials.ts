import {
  CanvasTexture,
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'

// Materials and procedural textures of the space-station furniture set. These are not part of
// the colour palette (the station is not a recoloured office): every surface is authored here.

const cache = new Map<string, MeshStandardMaterial>()

function std(
  name: string,
  color: string,
  o: {
    roughness?: number
    metalness?: number
    emissive?: string
    emissiveIntensity?: number
    opacity?: number
    map?: CanvasTexture
  } = {},
): MeshStandardMaterial {
  const hit = cache.get(name)
  if (hit) return hit
  const m = new MeshStandardMaterial({
    name: `space:${name}`,
    color: new Color(color),
    roughness: o.roughness ?? 0.6,
    metalness: o.metalness ?? 0,
  })
  if (o.emissive) {
    m.emissive = new Color(o.emissive)
    m.emissiveIntensity = o.emissiveIntensity ?? 1
  }
  if (o.opacity !== undefined) {
    m.transparent = true
    m.opacity = o.opacity
    m.depthWrite = false
  }
  if (o.map) m.map = o.map
  cache.set(name, m)
  return m
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** Deterministic pseudo-random so the station looks identical on every launch. */
function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** Bulkhead: a grid of recessed panels with rivets. */
function wallTexture(): CanvasTexture {
  return canvasTexture(1024, 512, (ctx) => {
    ctx.fillStyle = '#c9d0dc'
    ctx.fillRect(0, 0, 1024, 512)
    const cols = 8
    const rows = 4
    const pw = 1024 / cols
    const ph = 512 / rows
    const r = rng(5)
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const x = i * pw
        const y = j * ph
        const shade = 196 + Math.floor(r() * 26)
        ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 12})`
        ctx.fillRect(x + 6, y + 6, pw - 12, ph - 12)
        ctx.strokeStyle = 'rgba(40,50,70,0.55)'
        ctx.lineWidth = 3
        ctx.strokeRect(x + 6, y + 6, pw - 12, ph - 12)
        ctx.fillStyle = 'rgba(60,70,90,0.8)'
        for (const [dx, dy] of [
          [16, 16],
          [pw - 16, 16],
          [16, ph - 16],
          [pw - 16, ph - 16],
        ] as const) {
          ctx.beginPath()
          ctx.arc(x + dx, y + dy, 3.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
  })
}

/** Deck plating: dark steel tiles with a faint grating and an orange guide line. */
function deckTexture(): CanvasTexture {
  const t = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#2f3646'
    ctx.fillRect(0, 0, 512, 512)
    const n = 4
    const s = 512 / n
    const r = rng(9)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const v = 48 + Math.floor(r() * 12)
        ctx.fillStyle = `rgb(${v},${v + 6},${v + 18})`
        ctx.fillRect(i * s + 4, j * s + 4, s - 8, s - 8)
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.lineWidth = 1
        for (let k = 8; k < s - 8; k += 10) {
          ctx.beginPath()
          ctx.moveTo(i * s + 8, j * s + k)
          ctx.lineTo(i * s + s - 8, j * s + k)
          ctx.stroke()
        }
      }
    ctx.strokeStyle = '#ff7a1a'
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, s * 2)
    ctx.lineTo(512, s * 2)
    ctx.stroke()
  })
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(2, 2)
  return t
}

function hazardTexture(): CanvasTexture {
  const t = canvasTexture(128, 32, (ctx) => {
    ctx.fillStyle = '#ffd21a'
    ctx.fillRect(0, 0, 128, 32)
    ctx.fillStyle = '#15181f'
    for (let x = -32; x < 160; x += 32) {
      ctx.beginPath()
      ctx.moveTo(x, 32)
      ctx.lineTo(x + 16, 32)
      ctx.lineTo(x + 48, 0)
      ctx.lineTo(x + 32, 0)
      ctx.fill()
    }
  })
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

/** The view from the porthole: stars and a curved horizon of the Earth. */
function earthViewTexture(): CanvasTexture {
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#01030a'
    ctx.fillRect(0, 0, 512, 512)
    const r = rng(3)
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(255,255,255,${(0.3 + r() * 0.7).toFixed(2)})`
      ctx.fillRect(r() * 512, r() * 512, 1 + r() * 1.5, 1 + r() * 1.5)
    }
    // Earth: a huge disc whose upper rim crosses the lower half of the view.
    const cx = 200
    const cy = 900
    const R = 560
    const g = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R)
    g.addColorStop(0, '#0b3a8f')
    g.addColorStop(0.8, '#1f6fd6')
    g.addColorStop(1, '#8fd2ff')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R - 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#3c9b4f'
    for (let i = 0; i < 9; i++) {
      ctx.beginPath()
      ctx.ellipse(40 + r() * 420, 380 + r() * 130, 30 + r() * 70, 14 + r() * 22, r() * 3, 0, 6.3)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    for (let i = 0; i < 14; i++) {
      ctx.beginPath()
      ctx.ellipse(r() * 512, 340 + r() * 170, 40 + r() * 80, 6 + r() * 10, 0.1, 0, 6.3)
      ctx.fill()
    }
    ctx.restore()
    // Sun glare at the rim.
    const glare = ctx.createRadialGradient(430, 345, 0, 430, 345, 120)
    glare.addColorStop(0, 'rgba(255,250,220,0.95)')
    glare.addColorStop(1, 'rgba(255,250,220,0)')
    ctx.fillStyle = glare
    ctx.fillRect(250, 200, 262, 300)
  })
}

/** A compact mission-clock readout for the wall. */
function clockTexture(): CanvasTexture {
  return canvasTexture(256, 96, (ctx) => {
    ctx.fillStyle = '#03120a'
    ctx.fillRect(0, 0, 256, 96)
    ctx.fillStyle = '#43ff8a'
    ctx.font = 'bold 34px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('MET 142:07', 128, 42)
    ctx.font = '20px monospace'
    ctx.fillStyle = '#4de3ff'
    ctx.fillText('ORBIT 408 KM', 128, 74)
  })
}

let wall: MeshStandardMaterial | null = null
let deck: MeshStandardMaterial | null = null
let hazard: MeshStandardMaterial | null = null
let earthView: MeshBasicMaterial | null = null
let clock: MeshBasicMaterial | null = null

export const S = {
  hull: std('hull', '#dfe4ec', { roughness: 0.45, metalness: 0.3 }),
  hullMid: std('hullMid', '#aab3c2', { roughness: 0.5, metalness: 0.5 }),
  hullDark: std('hullDark', '#2a303d', { roughness: 0.55, metalness: 0.5 }),
  steel: std('steel', '#8e98aa', { roughness: 0.3, metalness: 0.85 }),
  seat: std('seat', '#222a38', { roughness: 0.92 }),
  pad: std('pad', '#1c2330', { roughness: 0.95 }),
  orange: std('orange', '#ff7a1a', { roughness: 0.55 }),
  yellow: std('yellow', '#ffd21a', { roughness: 0.6 }),
  white: std('white', '#f2f5fa', { roughness: 0.5 }),
  ledCyan: std('ledCyan', '#0b1a22', { emissive: '#4de3ff', emissiveIntensity: 3 }),
  ledGreen: std('ledGreen', '#0a1a10', { emissive: '#43ff8a', emissiveIntensity: 3 }),
  ledAmber: std('ledAmber', '#1a1208', { emissive: '#ff9a1a', emissiveIntensity: 3 }),
  ledRed: std('ledRed', '#1a0808', { emissive: '#ff3b3b', emissiveIntensity: 3 }),
  light: std('light', '#f0f6ff', { emissive: '#e8f1ff', emissiveIntensity: 1.0 }),
  grow: std('grow', '#12031a', { emissive: '#c43bff', emissiveIntensity: 2.2 }),
  leaf: std('leaf', '#3da35a', { roughness: 0.7, emissive: '#1d6b33', emissiveIntensity: 0.5 }),
  glass: std('glass', '#9fd8ff', { roughness: 0.05, metalness: 0.1, opacity: 0.22 }),
  get wall() {
    return (wall ??= std('wall', '#ffffff', {
      roughness: 0.6,
      metalness: 0.25,
      map: wallTexture(),
    }))
  },
  get deck() {
    return (deck ??= std('deck', '#ffffff', { roughness: 0.4, metalness: 0.6, map: deckTexture() }))
  },
  get hazard() {
    return (hazard ??= std('hazard', '#ffffff', { roughness: 0.6, map: hazardTexture() }))
  },
  get earthView() {
    return (earthView ??= new MeshBasicMaterial({ map: earthViewTexture(), toneMapped: false }))
  },
  get clock() {
    return (clock ??= new MeshBasicMaterial({ map: clockTexture(), toneMapped: false }))
  },
}
