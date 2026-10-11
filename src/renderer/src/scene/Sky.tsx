import { Stars } from '@react-three/drei'
import { useMemo } from 'react'
import { AdditiveBlending, BackSide, CanvasTexture, SRGBColorSpace } from 'three'
import { THEMES } from '../config/themes'
import { useSettings } from '../store/settings'

// What surrounds the floating room: stars at night, stars plus the Earth and the Moon from the
// station. Everything is far behind the diorama (the camera looks along (-1,-1,-1)), so these
// are fixed backdrop objects: unlit, toneMapped:false.

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function planetTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  g.addColorStop(0, '#0a3a8f')
  g.addColorStop(0.5, '#1b66cc')
  g.addColorStop(1, '#0a3a8f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1024, 512)
  const r = rng(21)
  ctx.fillStyle = '#3d9a52'
  for (let i = 0; i < 22; i++) {
    ctx.beginPath()
    ctx.ellipse(r() * 1024, 90 + r() * 330, 30 + r() * 90, 16 + r() * 40, r() * 3, 0, 6.3)
    ctx.fill()
  }
  ctx.fillStyle = '#c9b27a'
  for (let i = 0; i < 6; i++) {
    ctx.beginPath()
    ctx.ellipse(r() * 1024, 150 + r() * 220, 20 + r() * 40, 10 + r() * 20, r() * 3, 0, 6.3)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  for (let i = 0; i < 40; i++) {
    ctx.beginPath()
    ctx.ellipse(r() * 1024, r() * 512, 40 + r() * 100, 5 + r() * 12, 0, 0, 6.3)
    ctx.fill()
  }
  ctx.fillStyle = '#f2f6ff'
  ctx.fillRect(0, 0, 1024, 26)
  ctx.fillRect(0, 486, 1024, 26)
  const t = new CanvasTexture(ctx.canvas)
  t.colorSpace = SRGBColorSpace
  return t
}

function Earth() {
  const map = useMemo(() => planetTexture(), [])
  return (
    <group position={[-25, -25.1, -18]}>
      <mesh>
        <sphereGeometry args={[5, 48, 32]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      <mesh scale={1.06}>
        <sphereGeometry args={[5, 48, 32]} />
        <meshBasicMaterial
          color="#5aa9ff"
          transparent
          opacity={0.28}
          side={BackSide}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function Moon({ glow }: { glow: string }) {
  return (
    <group position={[-27.5, -19.4, -21.1]}>
      <mesh>
        <sphereGeometry args={[0.7, 32, 24]} />
        <meshBasicMaterial color="#f4efd8" toneMapped={false} />
      </mesh>
      <mesh scale={1.7}>
        <sphereGeometry args={[0.7, 32, 24]} />
        <meshBasicMaterial
          color={glow}
          transparent
          opacity={0.16}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export function Sky() {
  const sky = THEMES[useSettings((s) => s.scene)].sky
  if (sky === 'none') return null
  const space = sky === 'space'
  return (
    <group>
      <Stars
        radius={55}
        depth={25}
        count={space ? 3200 : 1600}
        factor={space ? 4 : 3}
        saturation={0}
        fade
        speed={0}
      />
      {space ? <Earth /> : <Moon glow="#9ab4ff" />}
    </group>
  )
}
