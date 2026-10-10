import { AnimationMixer, Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { CHIBI_MANIFEST, resolveClips, type ClipRole } from '../characters/manifest'
import { PLACES } from '../characters/places'
import { DEFAULT_STYLE } from '../characters/rig/chibiRig'
import { CHARACTERS, buildRig, clipsForRig } from '../characters/roster'
import { COLLIDERS, HARD_SINK, SOFT_SINK } from './colliders'

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

function penetrations(id: string): Hit[] {
  const rig = buildRig(id, DEFAULT_STYLE)
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
        for (let i = 0; i < pos.count; i += stride) {
          mesh.getVertexPosition(i, v)
          v.applyMatrix4(mesh.matrixWorld as Matrix4)
          for (const c of COLLIDERS) {
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
          const seat = COLLIDERS.find(
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
  rig.dispose()
  return hits
}

describe.each(CHARACTERS.map((c) => c.id))('%s does not sink into furniture', (id) => {
  it('in every place and pose', { timeout: 120_000 }, () => {
    const hits = penetrations(id)
    const summary = new Map<string, number>()
    for (const h of hits) {
      const key = `${h.place} / ${h.box}`
      summary.set(key, Math.max(summary.get(key) ?? 0, h.depth))
    }
    const lines = [...summary].map(([k, d]) => `${k}: ${(d * 100).toFixed(1)} cm`)
    expect(lines).toEqual([])
  })
})

describe('two characters on the sofa', () => {
  it('fit side by side without overlapping each other', () => {
    for (const { id } of CHARACTERS) {
      const extents: [number, number][] = []
      for (const placeId of ['lounge:0', 'lounge:1']) {
        const rig = buildRig(id, DEFAULT_STYLE)
        const clips = clipsForRig(rig)
        const resolved = resolveClips(
          CHIBI_MANIFEST,
          clips.map((c) => c.name),
        )
        const place = PLACES[placeId]!
        const mixer = new AnimationMixer(rig.root)
        for (const role of [place.posture, 'idle_coffee'] as const)
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
          lo = Math.min(lo, v.z)
          hi = Math.max(hi, v.z)
        }
        extents.push([lo, hi])
        rig.dispose()
      }
      const [a, b] = extents as [[number, number], [number, number]]
      const overlap = a[1] - b[0]
      expect(overlap, `${id}: bodies overlap by ${(overlap * 100).toFixed(0)} cm`).toBeLessThan(
        0.04,
      )
    }
  })
})
