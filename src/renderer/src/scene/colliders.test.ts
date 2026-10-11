import { AnimationMixer, Matrix4, Vector3, type Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { CHIBI_MANIFEST, resolveClips, type ClipRole } from '../characters/manifest'
import { PLACES } from '../characters/places'
import { DEFAULT_STYLE } from '../characters/rig/chibiRig'
import { CHARACTERS, buildRig, clipsForRig } from '../characters/roster'
import { createSceneGear, isSuited, outfitFor } from '../characters/gear'
import { HARD_SINK, SOFT_SINK, collidersFor } from './colliders'
import { THEMES, type SceneId } from '../config/themes'

// Nobody may sink into the sofa, chair, desk, console… in any pose they take there. Every
// character is posed exactly as the app poses it (posture clip + gesture clip at the place's
// yaw / position) and each skinned vertex is tested against the furniture boxes.

const GESTURES: Record<string, ClipRole[]> = {
  'desk-a': ['type_fast', 'sit_idle', 'read', 'think', 'wave_attention', 'confused', 'celebrate'],
  'desk-b': ['type_fast', 'sit_idle', 'read', 'think', 'wave_attention', 'confused', 'celebrate'],
  'lounge:0': ['idle_coffee', 'sit_idle'],
  'lounge:1': ['idle_coffee', 'sit_idle'],
  'terminal:0': ['stand_terminal', 'stand_idle'],
  'terminal:1': ['stand_terminal', 'stand_idle'],
  'coffee:0': ['stand_idle'],
}

/** Seat surfaces a sitting body must rest on: no hovering more than MAX_GAP above them. */
const MAX_GAP = 0.05

interface Hit {
  place: string
  gesture: string
  time: number
  box: string
  depth: number
}

function penetrations(id: string, scene: SceneId): Hit[] {
  const colliders = collidersFor(THEMES[scene].furniture)
  const rig = buildRig(id, outfitFor(scene, DEFAULT_STYLE), isSuited(scene))
  // Scene gear (space helmet + pack, hacker headset) is part of the body for collisions.
  const gear = createSceneGear(scene, rig)
  gear?.attach()
  const clips = clipsForRig(rig)
  const resolved = resolveClips(
    CHIBI_MANIFEST,
    clips.map((c) => c.name),
  )
  const mixer = new AnimationMixer(rig.root)
  const mesh = rig.mesh
  const pos = mesh.geometry.getAttribute('position')
  const stride = 4
  const v = new Vector3()
  const hits: Hit[] = []

  for (const [placeId, gestures] of Object.entries(GESTURES)) {
    const place = PLACES[placeId]!
    for (const gesture of gestures) {
      for (const t of [0.15, 0.5, 0.85]) {
        mixer.stopAllAction()
        const posture = CHIBI_MANIFEST.clips[place.posture].clip
        const pClip =
          clips.find((c) => c.name === resolved.clipFor[place.posture]) ??
          clips.find((c) => c.name === posture)!
        const gClip = clips.find((c) => c.name === resolved.clipFor[gesture])!
        for (const clip of [pClip, gClip]) mixer.clipAction(clip).play()
        mixer.setTime(t * Math.max(pClip.duration, gClip.duration))
        rig.root.position.set(place.pos[0], 0, place.pos[1])
        rig.root.rotation.y = place.yaw
        rig.root.updateMatrixWorld(true)
        mesh.skeleton.update()
        const worst = new Map<string, number>()
        const lowest = new Map<string, number>()
        const points: Vector3[] = []
        for (let i = 0; i < pos.count; i += stride) {
          mesh.getVertexPosition(i, v)
          v.applyMatrix4(mesh.matrixWorld as Matrix4)
          points.push(v.clone())
        }
        // Gear meshes are plain geometry parented to bones: sample their world positions too.
        if (gear)
          rig.root.traverse((o) => {
            const m = o as Mesh
            if (!m.isMesh || m === mesh) return
            const p = m.geometry.getAttribute('position')
            for (let i = 0; i < p.count; i += 3)
              points.push(m.localToWorld(new Vector3().fromBufferAttribute(p, i)))
          })
        for (const v of points) {
          for (const c of colliders) {
            if (c.name.includes('seat') || c.name.includes('cushion')) {
              if (v.x > c.min[0] && v.x < c.max[0] && v.z > c.min[2] && v.z < c.max[2])
                lowest.set(c.name, Math.min(lowest.get(c.name) ?? Infinity, v.y - c.max[1]))
            }
            const sink = c.soft ? SOFT_SINK : HARD_SINK
            const dx = Math.min(v.x - c.min[0], c.max[0] - v.x)
            const dy = Math.min(v.y - c.min[1], c.max[1] - v.y)
            const dz = Math.min(v.z - c.min[2], c.max[2] - v.z)
            if (dx <= 0 || dy <= 0 || dz <= 0) continue
            const depth = Math.min(dx, dy, dz)
            if (depth > sink && depth > (worst.get(c.name) ?? 0)) worst.set(c.name, depth)
          }
        }
        for (const [box, depth] of worst)
          hits.push({ place: placeId, gesture, time: t, box, depth })
        if (place.posture !== 'stand') {
          // The body must rest on the seat it is placed at, not hover above it.
          const seat = colliders.find(
            (c) =>
              (c.name.includes('seat') || c.name.includes('cushion')) &&
              place.pos[0] > c.min[0] &&
              place.pos[0] < c.max[0] &&
              place.pos[1] > c.min[2] &&
              place.pos[1] < c.max[2],
          )
          const gap = seat ? (lowest.get(seat.name) ?? Infinity) : Infinity
          if (!(gap <= MAX_GAP))
            hits.push({
              place: placeId,
              gesture,
              time: t,
              box: `hovers ${(gap * 100).toFixed(0)} cm above ${seat?.name ?? 'nothing'}`,
              depth: gap,
            })
        }
      }
    }
  }
  gear?.detach()
  gear?.dispose()
  rig.dispose()
  return hits
}

describe.each(['office', 'space'] as const)('%s scene', (scene) => {
  describe.each(CHARACTERS.map((c) => c.id))('%s does not sink into furniture', (id) => {
    it('in every place and pose', { timeout: 180_000 }, () => {
      const hits = penetrations(id, scene)
      const summary = new Map<string, number>()
      for (const h of hits) {
        const key = `${h.place} / ${h.box}`
        summary.set(key, Math.max(summary.get(key) ?? 0, h.depth))
      }
      const lines = [...summary].map(([k, d]) => `${k}: ${(d * 100).toFixed(1)} cm`)
      expect(lines).toEqual([])
    })
  })
})

describe('two characters sharing a spot', () => {
  const PAIRS = [
    { a: 'lounge:0', b: 'lounge:1', gesture: 'idle_coffee', axis: 'z' },
    { a: 'terminal:0', b: 'terminal:1', gesture: 'stand_terminal', axis: 'x' },
  ] as const

  it.each(PAIRS)(
    '$a and $b fit side by side without overlapping',
    { timeout: 120_000 },
    ({ a, b, gesture, axis }) => {
      for (const scene of ['office', 'space'] as const) {
        for (const { id } of CHARACTERS) {
          const extents: [number, number][] = []
          for (const placeId of [a, b]) {
            const rig = buildRig(id, outfitFor(scene, DEFAULT_STYLE), isSuited(scene))
            const gear = createSceneGear(scene, rig)
            gear?.attach()
            const clips = clipsForRig(rig)
            const resolved = resolveClips(
              CHIBI_MANIFEST,
              clips.map((c) => c.name),
            )
            const place = PLACES[placeId]!
            const mixer = new AnimationMixer(rig.root)
            for (const role of [place.posture, gesture] as const)
              mixer.clipAction(clips.find((c) => c.name === resolved.clipFor[role])!).play()
            mixer.setTime(0.5)
            rig.root.position.set(place.pos[0], 0, place.pos[1])
            rig.root.rotation.y = place.yaw
            rig.root.updateMatrixWorld(true)
            rig.mesh.skeleton.update()
            const v = new Vector3()
            let lo = Infinity
            let hi = -Infinity
            const pos = rig.mesh.geometry.getAttribute('position')
            for (let i = 0; i < pos.count; i += 5) {
              rig.mesh.getVertexPosition(i, v)
              v.applyMatrix4(rig.mesh.matrixWorld)
              const c = axis === 'z' ? v.z : v.x
              lo = Math.min(lo, c)
              hi = Math.max(hi, c)
            }
            extents.push([lo, hi])
            gear?.detach()
            gear?.dispose()
            rig.dispose()
          }
          const [first, second] = extents as [[number, number], [number, number]]
          // Slot b is at the larger coordinate on both axes.
          const overlap = first[1] - second[0]
          expect(
            overlap,
            `${scene}/${id}: bodies overlap by ${(overlap * 100).toFixed(0)} cm`,
          ).toBeLessThan(0.04)
        }
      }
    },
  )
})
