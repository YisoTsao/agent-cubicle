import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import { BACKGROUND, RENDERER } from './config/render'
import { Effects } from './scene/Effects'
import { IsoCamera } from './scene/IsoCamera'
import { Lighting } from './scene/Lighting'
import { OfficeScene } from './scene/OfficeScene'
import { useQuality } from './scene/useQuality'
import { useSettings } from './store/settings'
import { DiagnosticsPanel, StatsProbe, type RenderStats } from './ui/Diagnostics'

export function App() {
  const q = useQuality()
  const showDiagnostics = useSettings((s) => s.showDiagnostics)
  const toggleDiagnostics = useSettings((s) => s.toggleDiagnostics)
  const [stats, setStats] = useState<RenderStats | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3' || (e.key === 'd' && e.ctrlKey && e.shiftKey)) toggleDiagnostics()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleDiagnostics])

  return (
    <main className="stage" data-ready={ready ? 'true' : 'false'} data-testid="stage">
      <Canvas
        shadows={{ enabled: q.shadows, type: RENDERER.shadowMapType }}
        dpr={[1, q.maxDpr]}
        gl={{
          antialias: false, // SMAA in post; MSAA is wasted under an EffectComposer
          powerPreference: 'high-performance',
          toneMapping: RENDERER.toneMapping,
          toneMappingExposure: RENDERER.toneMappingExposure,
          outputColorSpace: RENDERER.outputColorSpace,
        }}
        onCreated={() => setReady(true)}
      >
        <color attach="background" args={[BACKGROUND]} />
        <IsoCamera />
        <Lighting />
        <Suspense fallback={null}>
          <OfficeScene />
        </Suspense>
        <Effects />
        <StatsProbe onSample={showDiagnostics ? setStats : noop} />
      </Canvas>
      {showDiagnostics && <DiagnosticsPanel stats={stats} />}
    </main>
  )
}

function noop() {}
