import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'

/** Re-render at a fixed rate when the Canvas runs with frameloop="demand" (Low / battery). */
export function FrameCap({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / fps)
    return () => clearInterval(id)
  }, [fps, invalidate])
  return null
}

/** Tracks whether the window is actually visible (minimized / hidden / fully occluded → false). */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [setVisible])
  return visible
}
