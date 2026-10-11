import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef, type ComponentRef } from 'react'
import type { OrthographicCamera } from 'three'
import { cameraPose, frameHeightFor } from '../config/render'
import { useSettings } from '../store/settings'
import { roomExtra } from './props/layout'

/**
 * Free view: drag to orbit, wheel / pinch to zoom, right-drag is off (the diorama stays
 * centred). Leaving it restores the fixed isometric camera exactly.
 */
export function CameraControls() {
  const mode = useSettings((s) => s.camera)
  const resets = useSettings((s) => s.cameraResets)
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const height = useThree((s) => s.size.height)
  const extra = roomExtra(useSettings((s) => s.desks))
  const frame = frameHeightFor(extra)
  const pose = cameraPose(extra)

  useEffect(() => {
    if (resets === 0) return
    // Back to the exact isometric pose (OrbitControls.reset() would restore whatever the camera
    // was at construction, which is not guaranteed to be the isometric one).
    camera.position.set(...pose.position)
    camera.up.set(0, 1, 0)
    camera.zoom = height / frame
    ref.current?.target.set(...pose.target)
    camera.lookAt(...pose.target)
    camera.updateProjectionMatrix()
    ref.current?.update()
    // Only when the button is pressed, not when the viewport resizes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resets, extra])

  useEffect(() => {
    if (mode !== 'free') return
    return () => {
      camera.position.set(...pose.position)
      camera.up.set(0, 1, 0)
      camera.zoom = height / frame
      camera.lookAt(...pose.target)
      camera.updateProjectionMatrix()
    }
    // `pose` is derived from `extra`, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, camera, height, frame, extra])

  if (mode !== 'free') return null
  const base = height / frame
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      target={pose.target}
      enablePan={false}
      enableDamping
      dampingFactor={0.12}
      rotateSpeed={0.7}
      minPolarAngle={0.35}
      maxPolarAngle={1.42}
      minZoom={base * 0.55}
      maxZoom={base * 3.2}
    />
  )
}
