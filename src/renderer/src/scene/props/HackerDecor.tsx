import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace } from 'three'
import { useSettings } from '../../store/settings'
import { ROOM, WINDOW } from './Room'

// Extra dressing for the hacker scene: neon strips, a wall of falling code where the window is,
// a neon sign and a glowing floor edge. Unlit materials with toneMapped:false so the bloom pass
// lights them up. Everything here is decoration: nothing is solid and no route passes through it.

const half = ROOM.half

const neon = (color: string) => new MeshBasicMaterial({ color, toneMapped: false })

function Strip({
  color,
  size,
  position,
}: {
  color: string
  size: [number, number, number]
  position: [number, number, number]
}) {
  const material = useMemo(() => neon(color), [color])
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh position={position} material={material}>
      <boxGeometry args={size} />
    </mesh>
  )
}

const GLYPHS = 'アイウエオカキクケコサシスセソ0123456789ABCDEF<>/{}$#'

/** Deterministic pseudo-random so screenshots are reproducible. */
function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function CodeRain() {
  const showcase = useSettings((s) => s.showcase)
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 560
    canvas.height = 440
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return { canvas, texture }
  }, [])
  const material = useMemo(
    () => new MeshBasicMaterial({ map: texture, toneMapped: false }),
    [texture],
  )
  const columns = useMemo(() => {
    const r = rng(11)
    return Array.from({ length: 28 }, () => ({ y: r() * 30, speed: 4 + r() * 8, seed: r() }))
  }, [])

  const draw = (time: number) => {
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgba(2, 14, 8, 0.55)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.font = '16px monospace'
    const r = rng(7)
    columns.forEach((col, i) => {
      const head = (col.y + time * col.speed) % 34
      for (let k = 0; k < 14; k++) {
        const row = Math.floor(head) - k
        if (row < 0) continue
        const a = 1 - k / 14
        ctx.fillStyle = k === 0 ? '#d8ffe8' : `rgba(57, 255, 20, ${a.toFixed(2)})`
        const ch = GLYPHS[Math.floor((r() + col.seed + row * 0.37) * 997) % GLYPHS.length]!
        ctx.fillText(ch, i * 20 + 2, row * 16 + 14)
      }
    })
    texture.needsUpdate = true
  }

  useEffect(() => {
    // Frozen, fully drawn frame for screenshots; otherwise animate from the first frame.
    draw(showcase ? 12 : 0)
    return () => {
      texture.dispose()
      material.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showcase])

  let acc = 0
  useFrame((_, delta) => {
    if (showcase) return
    acc += delta
    if (acc < 0.1) return
    draw(performance.now() / 1000)
    acc = 0
  })

  return (
    <mesh position={[WINDOW.cx, WINDOW.cy, -half + 0.024]} material={material}>
      <planeGeometry args={[WINDOW.w, WINDOW.h]} />
    </mesh>
  )
}

function NeonSign() {
  const material = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#05070d'
    ctx.fillRect(0, 0, 512, 256)
    ctx.font = 'bold 120px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = '#ff2bd6'
    ctx.shadowBlur = 24
    ctx.fillStyle = '#ff7be9'
    ctx.fillText('ROOT', 256, 100)
    ctx.font = 'bold 42px monospace'
    ctx.fillStyle = '#19e3ff'
    ctx.shadowColor = '#19e3ff'
    ctx.fillText('#!/bin/sh', 256, 205)
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
    <mesh position={[-half + 0.03, 1.95, 2.3]} rotation={[0, Math.PI / 2, 0]} material={material}>
      <planeGeometry args={[0.62, 0.31]} />
    </mesh>
  )
}

export function HackerDecor({ extra = 0 }: { extra?: number }) {
  return (
    <group>
      {/* Neon strips on both walls and along the floor edge */}
      <Strip color="#19e3ff" size={[half * 2, 0.03, 0.025]} position={[0, 2.15, -half + 0.03]} />
      <Strip
        color="#ff2bd6"
        size={[0.025, 0.03, half * 2 + extra]}
        position={[-half + 0.03, 2.15, extra / 2]}
      />
      <Strip color="#19e3ff" size={[half * 2, 0.02, 0.02]} position={[0, 0.035, -half + 0.05]} />
      <Strip
        color="#ff2bd6"
        size={[0.02, 0.02, half * 2 + extra]}
        position={[-half + 0.05, 0.035, extra / 2]}
      />
      {/* Frame the code wall */}
      <Strip
        color="#39ff14"
        size={[WINDOW.w + 0.2, 0.03, 0.03]}
        position={[WINDOW.cx, WINDOW.cy + WINDOW.h / 2 + 0.06, -half + 0.04]}
      />
      <Strip
        color="#39ff14"
        size={[WINDOW.w + 0.2, 0.03, 0.03]}
        position={[WINDOW.cx, WINDOW.cy - WINDOW.h / 2 - 0.06, -half + 0.04]}
      />
      <CodeRain />
      <NeonSign />
    </group>
  )
}
