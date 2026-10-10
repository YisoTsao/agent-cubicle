import { create } from 'zustand'
import type { QualityLevel } from '../config/render'
import { isChoice, type CharacterChoice } from '../characters/roster'
import { DEFAULT_SCENE, isSceneId, type SceneId } from '../config/themes'
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
  /** Scene theme (office / hacker). */
  scene: SceneId
  setScene(scene: SceneId): void
  /** 'iso' = fixed isometric view, 'free' = orbit / zoom. */
  camera: 'iso' | 'free'
  setCamera(camera: 'iso' | 'free'): void
  /** Bumped by the "reset view" button. */
  cameraResets: number
  resetCamera(): void
  toggleDiagnostics(): void
}

const params = new URLSearchParams(window.location.search)
const urlScene = params.get('scene')
const urlCamera = params.get('camera')
const forcedScene: SceneId | null = isSceneId(urlScene) ? urlScene : null
const forcedCamera: 'iso' | 'free' | null =
  urlCamera === 'iso' || urlCamera === 'free' ? urlCamera : null
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
  scene: forcedScene ?? DEFAULT_SCENE,
  setScene: (scene) => {
    set({ scene })
    void window.cubicle.settings.set({ scene })
  },
  camera: forcedCamera ?? 'iso',
  setCamera: (camera) => {
    set({ camera })
    void window.cubicle.settings.set({ camera })
  },
  cameraResets: 0,
  resetCamera: () => set((s) => ({ cameraResets: s.cameraResets + 1 })),
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
    if (!forcedScene && isSceneId(s.scene)) useSettings.setState({ scene: s.scene })
    if (!forcedCamera) useSettings.setState({ camera: s.camera })
  })
}
