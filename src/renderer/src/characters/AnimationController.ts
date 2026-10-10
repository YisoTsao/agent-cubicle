import {
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type AnimationAction,
  type Object3D,
} from 'three'
import type { CharacterManifest, ClipRole, ResolvedClips } from './manifest'
import { LAYER_BONES, type Layer } from './rig/skeleton'

// Drives one character's AnimationMixer with independent cross-faded layers (SPEC §7).
// Layers use disjoint bone masks, so posture (sit/stand/walk) and gesture (type/read/wave)
// blend without fighting over the same tracks.

export const DEFAULT_FADE = 0.35

interface LayerState {
  role: ClipRole | null
  action: AnimationAction | null
}

export class AnimationController {
  readonly mixer: AnimationMixer
  private readonly layerClips = new Map<string, AnimationClip>()
  private readonly layers: Record<Layer, LayerState> = {
    posture: { role: null, action: null },
    gesture: { role: null, action: null },
  }
  private readonly onFinished = (e: { action: AnimationAction }) => this.handleFinished(e.action)
  private disposed = false
  /** Called when a `once` role finishes playing (before its `then` role starts). */
  onOnceFinished: ((role: ClipRole) => void) | null = null

  constructor(
    private readonly root: Object3D,
    private readonly clips: readonly AnimationClip[],
    private readonly manifest: CharacterManifest,
    private readonly resolved: ResolvedClips,
  ) {
    this.mixer = new AnimationMixer(root)
    this.mixer.addEventListener('finished', this.onFinished as never)
  }

  /** Currently requested role per layer (for tests / diagnostics). */
  current(layer: Layer): ClipRole | null {
    return this.layers[layer].role
  }

  /**
   * Cross-fade `role` in on its layer. Re-requesting the active role is a no-op, so callers may
   * call this every frame. Missing clips resolve through the manifest fallback chain.
   */
  play(role: ClipRole, fade = DEFAULT_FADE): void {
    if (this.disposed) return
    const spec = this.manifest.clips[role]
    const layer = spec.layer
    const state = this.layers[layer]
    if (state.role === role) return

    const clipName = this.resolved.clipFor[role]
    const clip = clipName ? this.layerClip(clipName, layer) : null
    state.role = role
    if (!clip) return // nothing playable: keep whatever pose we have — never stop rendering

    const next = this.mixer.clipAction(clip)
    if (next === state.action) return // different role resolved to the same clip
    const once = this.manifest.clips[role].loop === 'once' && clipName === spec.clip
    next.reset()
    next.setLoop(once ? LoopOnce : LoopRepeat, Infinity)
    next.clampWhenFinished = once
    next.enabled = true
    next.setEffectiveTimeScale(1)
    next.setEffectiveWeight(1)
    if (state.action && fade > 0) {
      next.crossFadeFrom(state.action, fade, false)
    } else {
      state.action?.stop()
    }
    next.play()
    state.action = next
  }

  update(dt: number): void {
    if (!this.disposed) this.mixer.update(dt)
  }

  /** Jump every active action to a fixed time (showcase screenshots). */
  setTime(t: number): void {
    if (!this.disposed) this.mixer.setTime(t)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.mixer.removeEventListener('finished', this.onFinished as never)
    this.mixer.stopAllAction()
    for (const clip of this.layerClips.values()) this.mixer.uncacheClip(clip)
    this.mixer.uncacheRoot(this.root)
    this.layerClips.clear()
  }

  private handleFinished(action: AnimationAction): void {
    for (const layer of Object.keys(this.layers) as Layer[]) {
      const state = this.layers[layer]
      if (state.action !== action || !state.role) continue
      const finished = state.role
      this.onOnceFinished?.(finished)
      const then = this.manifest.clips[finished].then
      if (then && state.role === finished) this.play(then)
    }
  }

  /** Full clip filtered to the layer's bone mask (cached). */
  private layerClip(clipName: string, layer: Layer): AnimationClip | null {
    const key = `${clipName}@${layer}`
    const cached = this.layerClips.get(key)
    if (cached) return cached
    const source = this.clips.find((c) => c.name === clipName)
    if (!source) return null
    const mask = new Set<string>(LAYER_BONES[layer])
    const tracks = source.tracks.filter((t) => mask.has(t.name.split('.')[0]!))
    if (tracks.length === 0) return null
    const clip = new AnimationClip(key, source.duration, tracks)
    this.layerClips.set(key, clip)
    return clip
  }
}
