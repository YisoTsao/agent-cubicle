import { create } from 'zustand'
import type { QualityLevel } from '../config/render'

interface SettingsState {
  quality: QualityLevel
  showDiagnostics: boolean
  /** Showcase mode freezes time-based motion so screenshots are reproducible. */
  showcase: boolean
  setQuality(quality: QualityLevel): void
  toggleDiagnostics(): void
}

const params = new URLSearchParams(window.location.search)
const initialQuality = params.get('quality')

export const useSettings = create<SettingsState>((set) => ({
  quality:
    initialQuality === 'high' || initialQuality === 'low' || initialQuality === 'balanced'
      ? initialQuality
      : 'balanced',
  showDiagnostics: params.has('diagnostics'),
  showcase: params.has('showcase'),
  setQuality: (quality) => set({ quality }),
  toggleDiagnostics: () => set((s) => ({ showDiagnostics: !s.showDiagnostics })),
}))
