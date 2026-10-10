import { create } from 'zustand'
import type { QualityLevel } from '../config/render'

interface SettingsState {
  quality: QualityLevel
  alwaysOnTop: boolean
  showDiagnostics: boolean
  /** Showcase mode freezes time-based motion so screenshots are reproducible. */
  showcase: boolean
  setQuality(quality: QualityLevel): void
  setAlwaysOnTop(on: boolean): void
  toggleDiagnostics(): void
}

const params = new URLSearchParams(window.location.search)
const urlQuality = params.get('quality')
/** A quality forced via URL (tests/screenshots) wins over the persisted preference. */
const forcedQuality: QualityLevel | null =
  urlQuality === 'high' || urlQuality === 'low' || urlQuality === 'balanced' ? urlQuality : null

export const useSettings = create<SettingsState>((set) => ({
  quality: forcedQuality ?? 'balanced',
  alwaysOnTop: false,
  showDiagnostics: params.has('diagnostics'),
  showcase: params.has('showcase'),
  setQuality: (quality) => {
    set({ quality })
    void window.cubicle.settings.set({ quality })
  },
  setAlwaysOnTop: (alwaysOnTop) => {
    set({ alwaysOnTop })
    void window.cubicle.settings.set({ alwaysOnTop })
  },
  toggleDiagnostics: () => set((s) => ({ showDiagnostics: !s.showDiagnostics })),
}))

/** Load persisted preferences from the main process once at startup. */
export function loadPersistedSettings(): void {
  void window.cubicle.settings.get().then((s) => {
    useSettings.setState({
      alwaysOnTop: s.alwaysOnTop,
      ...(forcedQuality ? {} : { quality: s.quality }),
    })
  })
}
