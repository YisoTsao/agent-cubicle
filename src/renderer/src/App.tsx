import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import { QUALITY_PRESETS, RENDERER } from './config/render'
import { THEMES } from './config/themes'
import { CameraControls } from './scene/CameraControls'
import { Effects } from './scene/Effects'
import { IsoCamera } from './scene/IsoCamera'
import { Lighting } from './scene/Lighting'
import { OfficeScene } from './scene/OfficeScene'
import { useQuality } from './scene/useQuality'
import { FrameCap, usePageVisible } from './scene/FrameDriver'
import { connectAgents, useAgents } from './store/agents'
import { loadPersistedSettings, useSettings } from './store/settings'
import { CharacterPreview } from './ui/CharacterPreview'
import { AgentPicker } from './ui/AgentPicker'
import { DevPanel } from './ui/DevPanel'
import { IntegrationPanel } from './ui/IntegrationPanel'
import { DevCameraProbe, installDevApi } from './ui/devApi'
import { DiagnosticsPanel, StatsProbe, type RenderStats } from './ui/Diagnostics'

const PREVIEW = new URLSearchParams(window.location.search).get('preview')

export function App() {
  // `?preview=<character>[,view=front][,posture=stand][,gesture=stand_idle]`: a single character
  // on a plain backdrop, used to compare the models against the reference art.
  return PREVIEW ? <CharacterPreview spec={PREVIEW} /> : <OfficeApp />
}

function OfficeApp() {
  const q = useQuality()
  const showDiagnostics = useSettings((s) => s.showDiagnostics)
  const toggleDiagnostics = useSettings((s) => s.toggleDiagnostics)
  const showcase = useSettings((s) => s.showcase)
  const scene = useSettings((s) => s.scene)
  const overflow = useAgents((s) => s.overflow)
  const [stats, setStats] = useState<RenderStats | null>(null)
  const [ready, setReady] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)

  useEffect(() => connectAgents(), [])
  useEffect(() => loadPersistedSettings(), [])

  // Long-running desktop app (SPEC §6/§8): stop rendering when nobody can see the window, and
  // cap Low quality at 30 FPS. Agent state keeps updating in the main process meanwhile.
  const visible = usePageVisible()
  const capped = q === QUALITY_PRESETS.low
  const keepRendering = useSettings((s) => s.keepRendering)
  const frameloop = !visible && !showcase && !keepRendering ? 'never' : capped ? 'demand' : 'always'
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
        frameloop={frameloop}
        onCreated={() => setReady(true)}
      >
        <color attach="background" args={[THEMES[scene].background]} />
        <IsoCamera />
        <CameraControls />
        <Lighting />
        <Suspense fallback={null}>
          <OfficeScene />
        </Suspense>
        <Effects />
        {frameloop === 'demand' && <FrameCap fps={30} />}
        <StatsProbe onSample={showDiagnostics ? setStats : noop} />
        {showDiagnostics && <DevCameraProbe />}
      </Canvas>
      {overflow > 0 && (
        <div className="overflow-badge" data-testid="overflow-badge">
          +{overflow} more agent{overflow > 1 ? 's' : ''}
        </div>
      )}
      {!showcase && (
        <button
          className="connect-button"
          onClick={() => setConnectOpen((v) => !v)}
          data-testid="connect-button"
        >
          設定
        </button>
      )}
      {!showcase && <AgentPicker />}
      {connectOpen && <IntegrationPanel onClose={() => setConnectOpen(false)} />}
      {showDiagnostics && <DiagnosticsPanel stats={stats} />}
      {showDiagnostics && !showcase && <DevPanel />}
    </main>
  )
}

function noop() {}
