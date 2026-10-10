import { Canvas } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { AnimationController } from '../characters/AnimationController'
import { CHIBI_MANIFEST, resolveClips, type ClipRole } from '../characters/manifest'
import { buildRig, clipsForRig, isCharacterId } from '../characters/roster'
import { DEFAULT_STYLE } from '../characters/rig/chibiRig'
import { createHackerGear, hackerOutfit } from '../characters/hackerGear'
import { ACESFilmicToneMapping, NoToneMapping, SRGBColorSpace } from 'three'
import { Lighting } from '../scene/Lighting'

// Developer preview: one character on a plain backdrop, frozen in a pose, seen from a fixed
// angle. Used to compare the 3D models against the reference art and to render picker thumbnails.
//   ?preview=duck,view=front,posture=stand,gesture=stand_idle,t=1.2,zoom=1
//   photo=1 matches the camera to the 600×663 duck product photo (1 px = 2 mm, floor at y=612)
//   light=scene uses the office lighting; the default is flat studio light so colours read true

const VIEWS: Record<string, [number, number, number]> = {
  front: [0, 0, 6],
  side: [6, 0, 0],
  iso: [4.2, 3.4, 4.2],
  back: [0, 0, -6],
}

function parse(spec: string): { id: string; opts: Record<string, string> } {
  const [id = 'chibi', ...rest] = spec.split(',')
  const opts: Record<string, string> = {}
  for (const part of rest) {
    const [k, v] = part.split('=')
    if (k && v) opts[k] = v
  }
  return { id, opts }
}

export function CharacterPreview({ spec }: { spec: string }) {
  const { id, opts } = useMemo(() => parse(spec), [spec])
  const [ready, setReady] = useState(false)
  const view = opts['view'] ?? 'front'
  const photo = opts['photo'] === '1'
  const zoomOpt = Number(opts['zoom'] ?? '1')
  const dir = VIEWS[view] ?? VIEWS['front']!
  const target: [number, number, number] = photo
    ? [-0.0054, 0.5046, 0]
    : [0, Number(opts['cy'] ?? '0.62'), 0]
  const zoom = photo ? 1 / 0.0018 : (window.innerHeight / 1.7) * zoomOpt
  const cam: [number, number, number] = [
    dir[0] + (view === 'front' ? target[0] : 0),
    dir[1] + target[1],
    dir[2],
  ]
  return (
    <main className="stage" data-ready={ready ? 'true' : 'false'} data-testid="stage">
      <Canvas
        shadows
        dpr={1}
        gl={{
          antialias: true,
          toneMapping: opts['light'] === 'scene' ? ACESFilmicToneMapping : NoToneMapping,
          outputColorSpace: SRGBColorSpace,
          preserveDrawingBuffer: true,
        }}
        onCreated={() => setReady(true)}
      >
        <color attach="background" args={[opts['bg'] ? `#${opts['bg']}` : '#fbdde3']} />
        <OrthographicCamera
          makeDefault
          position={cam}
          zoom={zoom}
          near={0.1}
          far={50}
          onUpdate={(c) => {
            c.lookAt(...target)
            c.updateProjectionMatrix()
          }}
        />
        {opts['light'] === 'scene' ? (
          <Lighting />
        ) : (
          <>
            <hemisphereLight args={['#fffaf0', '#d9a15a', 1.9]} />
            <directionalLight position={[1.5, 2.5, 4]} intensity={1.9} />
            <directionalLight position={[-3, 1, 2]} intensity={0.5} />
          </>
        )}
        <Suspense fallback={null}>
          <Figure id={id} opts={opts} />
        </Suspense>
      </Canvas>
    </main>
  )
}

function Figure({ id, opts }: { id: string; opts: Record<string, string> }) {
  const hacker = opts['scene'] === 'hacker'
  const rig = useMemo(
    () =>
      buildRig(
        isCharacterId(id) ? id : 'chibi',
        hacker ? hackerOutfit(DEFAULT_STYLE) : DEFAULT_STYLE,
      ),
    [id, hacker],
  )
  useEffect(() => {
    if (!hacker) return
    const gear = createHackerGear(rig.gear)
    rig.bones.head.add(gear.group)
    return () => {
      rig.bones.head.remove(gear.group)
      gear.dispose()
    }
  }, [rig, hacker])
  const controller = useMemo(
    () =>
      new AnimationController(
        rig.root,
        clipsForRig(rig),
        CHIBI_MANIFEST,
        resolveClips(
          CHIBI_MANIFEST,
          clipsForRig(rig).map((c) => c.name),
        ),
      ),
    [rig],
  )
  useEffect(
    () => () => {
      controller.dispose()
      rig.dispose()
    },
    [controller, rig],
  )
  const posture = (opts['posture'] ?? 'stand') as ClipRole
  const gesture = (opts['gesture'] ?? 'stand_idle') as ClipRole
  const t = Number(opts['t'] ?? '1')
  useFrame(() => {
    if (opts['posture'] === 'rest') return // bind pose, no clip
    controller.play(posture, 0)
    controller.play(gesture, 0)
    controller.setTime(t)
    rig.root.updateMatrixWorld(true)
  })
  return <primitive object={rig.root} />
}
