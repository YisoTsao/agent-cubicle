import { Environment, Lightformer } from '@react-three/drei'
import { LIGHTING } from '../config/render'
import { useQuality } from './useQuality'

// Key light (sun through the window side) + sky/ground fill + a procedural IBL for soft
// reflections. No HDR download: Lightformers keep it offline and CSP-friendly.

export function Lighting() {
  const q = useQuality()
  const { sun, hemisphere } = LIGHTING
  const e = sun.shadowExtent
  return (
    <>
      <hemisphereLight args={[hemisphere.sky, hemisphere.ground, hemisphere.intensity]} />
      <directionalLight
        position={sun.position}
        intensity={sun.intensity}
        color={sun.color}
        castShadow={q.shadows}
        shadow-mapSize={[q.shadowMapSize, q.shadowMapSize]}
        shadow-bias={sun.shadowBias}
        shadow-normalBias={sun.shadowNormalBias}
        shadow-radius={sun.shadowRadius}
        shadow-camera-left={-e}
        shadow-camera-right={e}
        shadow-camera-top={e}
        shadow-camera-bottom={-e}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      <Environment resolution={64} environmentIntensity={LIGHTING.environmentIntensity}>
        <Lightformer
          form="rect"
          intensity={2}
          color="#fff3e0"
          position={[0, 5, 0]}
          rotation-x={Math.PI / 2}
          scale={[10, 10, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.2}
          color="#ffe2c4"
          position={[6, 2, 6]}
          rotation-y={Math.PI / 4}
          scale={[8, 4, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.6}
          color="#d8e6f5"
          position={[-6, 2, -2]}
          rotation-y={-Math.PI / 2.5}
          scale={[6, 4, 1]}
        />
      </Environment>
    </>
  )
}
