import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3, type Camera } from 'three'
import { agentDebug } from '../characters/debug'
import type { PresentationState } from '../characters/presentation'
import { useAgents } from '../store/agents'
import type { RenderStats } from './Diagnostics'

// Test/diagnostics hooks on window.__cubicleDev (installed only when diagnostics are enabled).

export interface CubicleDevApi {
  agents(): { id: string; name: string; state: string; deskId: string }[]
  setState(agentId: string, state: PresentationState): void
  respawn(): void
  stats(): RenderStats | null
  pose(agentId: string): {
    x: number
    z: number
    yaw: number
    moving: boolean
    place: string
    hips: [number, number, number]
    gesture: string | null
    posture: string | null
    /** Head position in CSS pixels relative to the canvas. */
    screen: [number, number] | null
  } | null
}

let view: { camera: Camera; width: number; height: number } | null = null

/** Mount inside <Canvas> so the dev API can project world positions to the screen. */
export function DevCameraProbe() {
  const camera = useThree((s) => s.camera)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  useEffect(() => {
    view = { camera, width, height }
    return () => {
      view = null
    }
  }, [camera, width, height])
  return null
}

export function installDevApi(): () => void {
  const v = new Vector3()
  const api: CubicleDevApi = {
    agents: () =>
      useAgents
        .getState()
        .agents.map(({ id, name, state, deskId }) => ({ id, name, state, deskId })),
    setState: (id, state) => useAgents.getState().setState(id, state),
    respawn: () => useAgents.getState().respawn(),
    stats: () => (window as unknown as { __cubicleStats?: RenderStats }).__cubicleStats ?? null,
    pose: (id) => {
      const h = agentDebug.get(id)
      if (!h) return null
      h.hips.getWorldPosition(v)
      const hips: [number, number, number] = [v.x, v.y, v.z]
      let screen: [number, number] | null = null
      if (view) {
        h.head.getWorldPosition(v).project(view.camera)
        screen = [((v.x + 1) / 2) * view.width, ((1 - v.y) / 2) * view.height]
      }
      return {
        x: h.loco.x,
        z: h.loco.z,
        yaw: h.loco.yaw,
        moving: h.loco.moving,
        place: h.loco.place.id,
        hips,
        gesture: h.gesture(),
        posture: h.posture(),
        screen,
      }
    },
  }
  const w = window as unknown as { __cubicleDev?: CubicleDevApi }
  w.__cubicleDev = api
  return () => {
    delete w.__cubicleDev
  }
}
