import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import { BACKGROUND, RENDERER } from './config/render'
import { Effects } from './scene/Effects'
import { IsoCamera } from './scene/IsoCamera'
import { Lighting } from './scene/Lighting'
import { OfficeScene } from './scene/OfficeScene'
import { useQuality } from './scene/useQuality'
import { connectAgents } from './store/agents'
import { useSettings } from './store/settings'
import { DevPanel } from './ui/DevPanel'
import { DevCameraProbe, installDevApi } from './ui/devApi'
import { DiagnosticsPanel, StatsProbe, type RenderStats } from './ui/Diagnostics'

export function App() {
  const q = useQuality()
  const showDiagnostics = useSettings((s) => s.showDiagnostics)
  const toggleDiagnostics = useSettings((s) => s.toggleDiagnostics)
  const showcase = useSettings((s) => s.showcase)
  const [stats, setStats] = useState<RenderStats | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => connectAgents(), [])
  useEffect(() => (showDiagnostics ? installDevApi() : undefined), [showDiagnostics])

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
        {showDiagnostics && <DevCameraProbe />}
      </Canvas>
      {showDiagnostics && <DiagnosticsPanel stats={stats} />}
      {showDiagnostics && !showcase && <DevPanel />}
    </main>
  )
}

function noop() {}
