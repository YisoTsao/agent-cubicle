import { useMemo, useEffect } from 'react'
import { CanvasTexture, CatmullRomCurve3, MeshBasicMaterial, SRGBColorSpace, Vector3 } from 'three'
import { ROOM, WINDOW } from './Room'

// Extra dressing for the night scene: a night sky in the window, warm string lights along the
// walls and a candle on the coffee table. Unlit, toneMapped:false so the bloom makes them glow.

const half = ROOM.half

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function NightWindow() {
  const material = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 560
    canvas.height = 440
    const ctx = canvas.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 0, 440)
    g.addColorStop(0, '#070b24')
    g.addColorStop(1, '#2a2f6e')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 560, 440)
    const r = rng(17)
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(255,255,240,${(0.3 + r() * 0.7).toFixed(2)})`
      ctx.fillRect(r() * 560, r() * 300, 1 + r() * 2, 1 + r() * 2)
    }
    // Crescent moon
    ctx.fillStyle = '#fff6d6'
    ctx.shadowColor = '#fff6d6'
    ctx.shadowBlur = 30
    ctx.beginPath()
    ctx.arc(400, 120, 52, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#12184a'
    ctx.beginPath()
    ctx.arc(424, 108, 46, 0, Math.PI * 2)
    ctx.fill()
    // Distant skyline with a few lit windows
    ctx.fillStyle = '#0a0d26'
    let x = 0
    while (x < 560) {
      const w = 30 + r() * 40
      const h = 70 + r() * 110
      ctx.fillRect(x, 440 - h, w, h)
      ctx.fillStyle = '#ffd98a'
      for (let k = 0; k < 4; k++)
        if (r() > 0.55) ctx.fillRect(x + 6 + r() * (w - 14), 440 - h + 10 + r() * (h - 24), 4, 5)
      ctx.fillStyle = '#0a0d26'
      x += w + 2
    }
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return new MeshBasicMaterial({ map: texture, toneMapped: false })
  }, [])
  useEffect(
    () => () => {
      material.map?.dispose()
      material.dispose()
    },
    [material],
  )
  return (
    <mesh position={[WINDOW.cx, WINDOW.cy, -half + 0.024]} material={material}>
      <planeGeometry args={[WINDOW.w, WINDOW.h]} />
    </mesh>
  )
}

/** A drooping wire with warm bulbs between two points. */
function StringLights({
  from,
  to,
  sag = 0.16,
  count = 14,
}: {
  from: [number, number, number]
  to: [number, number, number]
  sag?: number
  count?: number
}) {
  const bulbs = useMemo(() => {
    const mid = new Vector3(
      (from[0] + to[0]) / 2,
      Math.min(from[1], to[1]) - sag,
      (from[2] + to[2]) / 2,
    )
    const curve = new CatmullRomCurve3([new Vector3(...from), mid, new Vector3(...to)])
    return Array.from({ length: count }, (_, i) => {
      const p = curve.getPoint((i + 0.5) / count)
      return { p: [p.x, p.y, p.z] as [number, number, number], warm: i % 3 !== 1 }
    })
  }, [from, to, sag, count])
  const warm = useMemo(() => new MeshBasicMaterial({ color: '#ffc46b', toneMapped: false }), [])
  const rose = useMemo(() => new MeshBasicMaterial({ color: '#ff8fb3', toneMapped: false }), [])
  useEffect(
    () => () => {
      warm.dispose()
      rose.dispose()
    },
    [warm, rose],
  )
  return (
    <group>
      {bulbs.map((b, i) => (
        <mesh key={i} position={b.p} material={b.warm ? warm : rose}>
          <sphereGeometry args={[0.028, 10, 8]} />
        </mesh>
      ))}
    </group>
  )
}

function Candle() {
  const flame = useMemo(() => new MeshBasicMaterial({ color: '#ffb347', toneMapped: false }), [])
  useEffect(() => () => flame.dispose(), [flame])
  return (
    <group position={[-0.7, 0.425, 1.45]}>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.08, 14]} />
        <meshStandardMaterial color="#f4ead6" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.1, 0]} material={flame}>
        <sphereGeometry args={[0.014, 10, 8]} />
      </mesh>
    </group>
  )
}

export function NightDecor({ extra = 0 }: { extra?: number }) {
  return (
    <group>
      <NightWindow />
      <StringLights
        from={[-half + 0.1, 2.5, -half + 0.08]}
        to={[half - 0.1, 2.5, -half + 0.08]}
        count={18}
      />
      <StringLights
        from={[-half + 0.08, 2.5, -half + 0.1]}
        to={[-half + 0.08, 2.5, half - 0.1 + extra]}
        count={Math.round(18 * (1 + extra / (half * 2)))}
      />
      <Candle />
    </group>
  )
}
