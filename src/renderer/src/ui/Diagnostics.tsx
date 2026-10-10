import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

export interface RenderStats {
  fps: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
}

/** Samples renderer.info inside the Canvas and publishes it on `window.__cubicleStats` (SPEC §8 diagnostics). */
export function StatsProbe({ onSample }: { onSample: (s: RenderStats) => void }) {
  const get = useThree((s) => s.get)
  const acc = useRef({ frames: 0, elapsed: 0 })
  useEffect(() => {
    // EffectComposer issues several renders per frame; accumulate them instead of keeping only the last.
    const { info } = get().gl
    info.autoReset = false
    return () => {
      info.autoReset = true
    }
  }, [get])
  useFrame(({ gl }, delta) => {
    // Runs before the composer's render, so info holds the previous frame's totals.
    const frameCalls = gl.info.render.calls
    const frameTris = gl.info.render.triangles
    gl.info.reset()
    acc.current.frames++
    acc.current.elapsed += delta
    if (acc.current.elapsed < 0.5) return
    const info = gl.info
    const stats: RenderStats = {
      fps: Math.round(acc.current.frames / acc.current.elapsed),
      drawCalls: frameCalls,
      triangles: frameTris,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
    }
    acc.current = { frames: 0, elapsed: 0 }
    ;(window as unknown as { __cubicleStats?: RenderStats }).__cubicleStats = stats
    onSample(stats)
  })
  return null
}

export function DiagnosticsPanel({ stats }: { stats: RenderStats | null }) {
  if (!stats) return null
  return (
    <div className="diagnostics" data-testid="diagnostics">
      <div>FPS {stats.fps}</div>
      <div>Draw calls {stats.drawCalls}</div>
      <div>Triangles {stats.triangles.toLocaleString()}</div>
      <div>Geometries {stats.geometries}</div>
      <div>Textures {stats.textures}</div>
      <div>Programs {stats.programs}</div>
    </div>
  )
}
