import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing'
import type { ReactElement } from 'react'
import { THEMES } from '../config/themes'
import { useSettings } from '../store/settings'
import { useQuality } from './useQuality'

// Light post-processing: AO grounds furniture, Bloom only catches emissive screens/LEDs.
export function Effects() {
  const q = useQuality()
  const cleanCapture = useSettings((s) => s.cleanCapture)
  const theme = THEMES[useSettings((s) => s.scene)]
  const passes: ReactElement[] = []
  if (q.ambientOcclusion)
    passes.push(
      <N8AO
        key="ao"
        aoRadius={0.6}
        intensity={2.2}
        distanceFalloff={0.6}
        halfRes
        quality="medium"
      />,
    )
  if (q.bloom)
    passes.push(
      <Bloom
        key="bloom"
        mipmapBlur
        intensity={theme.bloom.intensity}
        luminanceThreshold={theme.bloom.threshold}
        luminanceSmoothing={0.15}
      />,
    )
  if (!cleanCapture)
    passes.push(<Vignette key="vignette" offset={0.35} darkness={theme.vignette} />)
  if (q.antialias === 'smaa') passes.push(<SMAA key="smaa" />)

  return (
    // Remount when the pass list changes; the composer does not diff children.
    <EffectComposer key={passes.map((p) => p.key).join('|')} multisampling={0}>
      {passes}
    </EffectComposer>
  )
}
