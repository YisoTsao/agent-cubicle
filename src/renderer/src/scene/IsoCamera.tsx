import { OrthographicCamera } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { OrthographicCamera as OrthoCam } from 'three'
import { CAMERA, cameraPose, frameHeightFor } from '../config/render'
import { useSettings } from '../store/settings'
import { roomExtra } from './props/layout'

/** Fixed isometric showcase camera; zoom tracks viewport height so framing is resolution-independent. */
export function IsoCamera() {
  const ref = useRef<OrthoCam>(null)
  const height = useThree((s) => s.size.height)
  const extra = roomExtra(useSettings((s) => s.desks))
  const frame = frameHeightFor(extra)
  const pose = cameraPose(extra)

  useLayoutEffect(() => {
    const cam = ref.current
    if (!cam) return
    cam.zoom = height / frame
    cam.position.set(...pose.position)
    cam.lookAt(...pose.target)
    cam.updateProjectionMatrix()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, frame, extra])

  return (
    <OrthographicCamera
      ref={ref}
      makeDefault
      position={pose.position}
      near={CAMERA.near}
      far={CAMERA.far}
    />
  )
}
