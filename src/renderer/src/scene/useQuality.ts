import { QUALITY_PRESETS, type QualityPreset } from '../config/render'
import { useSettings } from '../store/settings'

export function useQuality(): QualityPreset {
  return QUALITY_PRESETS[useSettings((s) => s.quality)]
}
