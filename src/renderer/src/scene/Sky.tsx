import { Stars } from '@react-three/drei'
import { THEMES } from '../config/themes'
import { useSettings } from '../store/settings'

// What surrounds the floating room: just stars. A backdrop Earth / Moon looked crude next to the
// furniture, so the only Earth and Moon are the ones seen through the windows.

export function Sky() {
  const sky = THEMES[useSettings((s) => s.scene)].sky
  if (sky === 'none') return null
  const space = sky === 'space'
  return (
    <group>
      <Stars
        radius={55}
        depth={25}
        count={space ? 3200 : 1600}
        factor={space ? 4 : 3}
        saturation={0}
        fade
        speed={0}
      />
    </group>
  )
}
