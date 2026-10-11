import { OrthographicCamera } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { OrthographicCamera as OrthoCam } from 'three'
import { CAMERA, frameHeightFor } from '../config/render'
import { useSettings } from '../store/settings'
import { roomExtra } from './props/layout'

/** Fixed isometric showcase camera; zoom tracks viewport height so framing is resolution-independent. */
export function IsoCamera() {
  const ref = useRef<OrthoCam>(null)
  const height = useThree((s) => s.size.height)
  const frame = frameHeightFor(roomExtra(useSettings((s) => s.desks)))

  useLayoutEffect(() => {
    const cam = ref.current
    if (!cam) return
    cam.zoom = height / frame
    cam.lookAt(...CAMERA.target)
    cam.updateProjectionMatrix()
  }, [height, frame])

  return (
    <OrthographicCamera
      ref={ref}
      makeDefault
      position={CAMERA.position}
      near={CAMERA.near}
      far={CAMERA.far}
    />
  )
}
