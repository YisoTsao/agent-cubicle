import { create } from 'zustand'
import type { QualityLevel } from '../config/render'
import { isChoice, type CharacterChoice } from '../characters/roster'
import { forcedChoice, useAgents } from './agents'

interface SettingsState {
  quality: QualityLevel
  alwaysOnTop: boolean
  showDiagnostics: boolean
  /** Showcase mode freezes time-based motion so screenshots are reproducible. */
  showcase: boolean
  /** Never pause when hidden/occluded (tests and soak runs). */
  keepRendering: boolean
  /** No vignette: flat edges for compositing (app icon). */
  cleanCapture: boolean
  setQuality(quality: QualityLevel): void
  setAlwaysOnTop(on: boolean): void
  setCharacter(choice: CharacterChoice): void
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
  keepRendering: params.has('keepRendering'),
  cleanCapture: params.has('cleanCapture'),
  setQuality: (quality) => {
    set({ quality })
    void window.cubicle.settings.set({ quality })
  },
  setAlwaysOnTop: (alwaysOnTop) => {
    set({ alwaysOnTop })
    void window.cubicle.settings.set({ alwaysOnTop })
  },
  setCharacter: (choice) => {
    useAgents.getState().setChoice(choice)
    void window.cubicle.settings.set({ character: choice })
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
    if (!forcedChoice && isChoice(s.character)) useAgents.getState().setChoice(s.character)
  })
}
