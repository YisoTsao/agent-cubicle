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

/**
 * Whether anyone can see the window. Combines the page Visibility API (occlusion, tab-level
 * hiding) with explicit hide/minimize/restore events from the main process, because
 * BrowserWindow.hide() does not reliably change document.visibilityState on every platform.
 */
export function usePageVisible(): boolean {
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible')
  const [windowVisible, setWindowVisible] = useState(true)
  useEffect(() => {
    const onChange = () => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    const off = window.cubicle.onWindowVisibility(setWindowVisible)
    return () => {
      document.removeEventListener('visibilitychange', onChange)
      off()
    }
  }, [])
  return pageVisible && windowVisible
}
