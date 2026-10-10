import { CanvasTexture, SRGBColorSpace } from 'three'
import type { OverlayKind } from './presentation'

// Status overlay icons (SPEC §7 overlay layer), drawn once on canvas and shared app-wide.

const SIZE = 128
const cache = new Map<OverlayKind, CanvasTexture>()

export function overlayTexture(kind: OverlayKind): CanvasTexture {
  let tex = cache.get(kind)
  if (!tex) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIZE
    DRAW[kind](canvas.getContext('2d')!)
    tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 4
    cache.set(kind, tex)
  }
  return tex
}

const c = SIZE / 2

function shadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'rgba(60, 40, 20, 0.35)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 3
}

function glyph(ctx: CanvasRenderingContext2D, text: string, color: string, size: number, dy = 0) {
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = color
  ctx.font = `800 ${size}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, c, c + dy)
}

function badge(ctx: CanvasRenderingContext2D, fill: string) {
  shadow(ctx)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(c, c, 52, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(c, c, 45, 0, Math.PI * 2)
  ctx.fill()
}

const DRAW: Record<OverlayKind, (ctx: CanvasRenderingContext2D) => void> = {
  thought(ctx) {
    shadow(ctx)
    ctx.fillStyle = '#ffffff'
    for (const [x, y, r] of [
      [44, 58, 26],
      [70, 48, 30],
      [92, 62, 24],
      [64, 72, 26],
      [24, 104, 8],
      [14, 120, 5],
    ] as const) {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#8a7a6a'
    for (const x of [48, 66, 84]) {
      ctx.beginPath()
      ctx.arc(x, 60, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  warning(ctx) {
    shadow(ctx)
    ctx.fillStyle = '#ffffff'
    roundedTriangle(ctx, 60)
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#f2b632'
    roundedTriangle(ctx, 50)
    glyph(ctx, '!', '#4a3a1a', 60, 10)
  },
  error(ctx) {
    badge(ctx, '#e0574a')
    glyph(ctx, '!', '#ffffff', 64, 3)
  },
  check(ctx) {
    badge(ctx, '#5fb87a')
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 12
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(42, 66)
    ctx.lineTo(57, 81)
    ctx.lineTo(87, 49)
    ctx.stroke()
  },
  question(ctx) {
    badge(ctx, '#9aa5b4')
    glyph(ctx, '?', '#ffffff', 64, 3)
  },
}

function roundedTriangle(ctx: CanvasRenderingContext2D, r: number) {
  const pts = [0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3
    return [c + Math.cos(a) * r, c + 8 + Math.sin(a) * r] as const
  })
  ctx.beginPath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 14
  ctx.strokeStyle = ctx.fillStyle as string
  ctx.moveTo(...pts[0]!)
  ctx.lineTo(...pts[1]!)
  ctx.lineTo(...pts[2]!)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}
