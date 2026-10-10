import { OrthographicCamera } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { OrthographicCamera as OrthoCam } from 'three'
import { CAMERA } from '../config/render'

/** Fixed isometric showcase camera; zoom tracks viewport height so framing is resolution-independent. */
export function IsoCamera() {
  const ref = useRef<OrthoCam>(null)
  const height = useThree((s) => s.size.height)

  useLayoutEffect(() => {
    const cam = ref.current
    if (!cam) return
    cam.zoom = height / CAMERA.frameHeight
    cam.lookAt(...CAMERA.target)
    cam.updateProjectionMatrix()
  }, [height])

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
