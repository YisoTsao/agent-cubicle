import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { materials } from '../scene/materials'
import { useSettings } from '../store/settings'
import { createSceneGear, isSuited, outfitFor } from './gear'
import type { AgentView } from '../store/agents'
import { AnimationController } from './AnimationController'
import { agentDebug } from './debug'
import { overlayTexture } from './icons'
import { Locomotion } from './Locomotion'
import { crowdOffset, removeBody } from './crowd'
import { claimSlot, releaseAll } from './placeBook'
import { CHIBI_MANIFEST, resolveClips, type ClipRole } from './manifest'
import { PLACES, type Place } from './places'
import {
  PRESENTATION,
  PROP_FOR_GESTURE,
  gestureFor,
  placeIdFor,
  type PresentationState,
} from './presentation'
import { buildRig, clipsForRig, type CharacterRig } from './roster'
import { chibiClips } from './rig/chibiClips'

// One agent on screen: skinned rig + animation layers + locomotion + secondary motion + overlay
// + hand props. All Three.js objects created here are disposed on unmount (SPEC §7 lifecycle).

const RESOLVED = resolveClips(
  CHIBI_MANIFEST,
  chibiClips().map((c) => c.name),
)
RESOLVED.warnings.forEach((w) => console.warn('[character]', w))

/** Fixed animation time per state in showcase mode (picks a readable frame of each clip). */
const SHOWCASE_TIME: Partial<Record<PresentationState, number>> = { IDLE: 0.8, READ: 1.2 }
const SHOWCASE_DEFAULT_TIME = 1.25

const IDLE_FOR_POSTURE: Record<Place['posture'], ClipRole> = {
  sit: 'sit_idle',
  sit_sofa: 'idle_coffee',
  stand: 'stand_idle',
}

/** A new state must hold this long before the character walks somewhere else. */
export const PLACE_DEBOUNCE_MS = 1000

export function AgentCharacter({ agent }: { agent: AgentView }) {
  const showcase = useSettings((s) => s.showcase)
  const scene = useSettings((s) => s.scene)
  const overlayRef = useRef<Sprite>(null)
  const tagRef = useRef<Group>(null)

  const rig = useMemo(
    () => buildRig(agent.character, outfitFor(scene, agent.style), isSuited(scene)),
    [agent.character, agent.style, scene],
  )
  // Per-scene gear: neon glasses + headset (hacker), helmet + life-support pack (space).
  const gear = useMemo(() => createSceneGear(scene, rig), [rig, scene])
  useEffect(() => {
    if (!gear) return
    gear.attach()
    return () => {
      gear.detach()
      gear.dispose()
    }
  }, [gear])
  const controller = useMemo(
    () => new AnimationController(rig.root, clipsForRig(rig), CHIBI_MANIFEST, RESOLVED),
    [rig],
  )
  const loco = useMemo(
    () =>
      new Locomotion(
        resolvePlace(
          agent.id,
          placeIdFor(agent.state, agent.deskId, agent.deskId),
          agent.deskId,
          null,
        ),
      ),
    // Spawn location only; later state changes walk instead of re-creating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rig],
  )
  const props = useMemo(() => createHandProps(), [])
  const overlayMaterial = useMemo(
    () => new SpriteMaterial({ transparent: true, depthWrite: false }),
    [],
  )

  // Per-state-entry bookkeeping (refs: mutated every frame, never rendered).
  const onceDone = useRef(false)
  /** State whose gesture is shown (lags agent.state while a place change is debounced). */
  const committed = useRef(agent.state)
  const overlayPop = useRef(0)

  useEffect(() => {
    controller.onOnceFinished = () => {
      onceDone.current = true
    }
    return () => {
      controller.dispose()
      rig.dispose()
    }
  }, [controller, rig])

  useEffect(() => {
    const id = agent.id
    return () => {
      releaseAll(id)
      removeBody(id)
    }
  }, [agent.id])

  useEffect(() => {
    return () => {
      props.dispose()
      overlayMaterial.dispose() // shared icon textures are app-lifetime; not disposed here
    }
  }, [props, overlayMaterial])

  // React to state changes: pick the target place and walk (or snap, in showcase mode).
  // React to state changes. Changing *place* is debounced: real tool calls are often shorter
  // than the walk, and a character pacing back and forth reads as noise. Until the move is
  // committed the previous gesture keeps playing; overlays and screens update immediately.
  useLayoutEffect(() => {
    overlayPop.current = 0
    const targetId = placeIdFor(agent.state, agent.deskId, loco.place.id)
    const commit = () => {
      committed.current = agent.state
      onceDone.current = false
      const target = resolvePlace(agent.id, targetId, agent.deskId, loco.place.id)
      if (showcase) loco.teleport(target)
      else loco.goTo(target)
    }
    const alreadyThere = targetId === loco.place.id || targetId === loco.place.group
    if (showcase || alreadyThere) {
      commit()
      return
    }
    const timer = setTimeout(commit, PLACE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [agent.id, agent.state, agent.deskId, loco, showcase])

  useEffect(() => {
    agentDebug.set(agent.id, {
      root: rig.root,
      hips: rig.bones.hips,
      head: rig.bones.head,
      loco,
      gesture: () => controller.current('gesture'),
      posture: () => controller.current('posture'),
    })
    return () => {
      agentDebug.delete(agent.id)
    }
  }, [agent.id, rig, loco, controller])

  const scratch = useMemo(() => ({ v: new Vector3(), w: new Vector3() }), [])

  useFrame(({ clock }, delta) => {
    const dt = showcase ? 0 : delta
    const fade = showcase ? 0 : undefined
    loco.update(dt)
    const [ox, oz] = crowdOffset(agent.id, loco.x, loco.z, loco.yaw, loco.moving, dt)
    rig.root.position.set(loco.x + ox, 0, loco.z + oz)
    rig.root.rotation.y = loco.yaw

    // Base layers: posture from locomotion, gesture from presentation state.
    const settledPosture = loco.place.posture
    const posture: ClipRole = loco.moving ? 'walk' : settledPosture
    let gesture: ClipRole = loco.moving
      ? 'walk_arms'
      : gestureFor(committed.current, settledPosture)
    if (CHIBI_MANIFEST.clips[gesture].loop === 'once' && onceDone.current) {
      gesture = IDLE_FOR_POSTURE[settledPosture]
    }
    controller.play(posture, fade)
    controller.play(gesture, fade)
    if (showcase) controller.setTime(SHOWCASE_TIME[agent.state] ?? SHOWCASE_DEFAULT_TIME)
    else controller.update(dt)

    // Secondary layer: applied after the mixer on channels no clip animates (bone scale).
    const t = showcase ? 0.5 : clock.elapsedTime
    const blink = (t + agent.id.length * 0.37) % 4.2 < 0.12 ? 0.1 : 1
    rig.bones.eye_L.scale.y = blink
    rig.bones.eye_R.scale.y = blink
    rig.bones.spine.scale.set(1 + Math.sin(t * 1.6) * 0.008, 1 + Math.sin(t * 1.6) * 0.012, 1)

    rig.root.updateMatrixWorld(true)
    updateHandProps(
      props,
      rig,
      loco.moving ? null : (PROP_FOR_GESTURE[gesture] ?? null),
      loco.yaw,
      scratch,
    )

    // Overlay layer: icon floating above the head, popping in on state entry.
    const overlay = overlayRef.current
    if (overlay) {
      const p = PRESENTATION[agent.state]
      const kind = p.overlay
      overlay.visible = !!kind
      if (kind) {
        const tex = overlayTexture(kind)
        if (overlayMaterial.map !== tex) {
          overlayMaterial.map = tex
          overlayMaterial.needsUpdate = true
        }
        overlayMaterial.opacity = p.muted ? 0.7 : 1
        overlayPop.current = showcase ? 1 : Math.min(1, overlayPop.current + delta * 4)
        const pop = easeOutBack(overlayPop.current)
        rig.bones.head.getWorldPosition(scratch.v)
        overlay.position.set(
          scratch.v.x,
          scratch.v.y + rig.profile.overlayHeight + Math.sin(t * 2.4) * 0.025,
          scratch.v.z,
        )
        overlay.scale.setScalar(rig.profile.overlaySize * pop)
      }
    }

    if (tagRef.current) {
      rig.bones.head.getWorldPosition(scratch.v)
      tagRef.current.position.set(scratch.v.x, scratch.v.y + rig.profile.tagHeight, scratch.v.z)
    }
  })

  return (
    <>
      <primitive object={rig.root} />
      <primitive object={props.mug} />
      <primitive object={props.book} />
      <sprite ref={overlayRef} material={overlayMaterial} renderOrder={10} visible={false} />
      <group ref={tagRef}>
        <Html center zIndexRange={[10, 0]} className="name-tag-anchor">
          <div className="name-tag" data-testid="name-tag">
            {agent.name}
            {agent.detail && <span className="name-tag__detail">{agent.detail}</span>}
          </div>
        </Html>
      </group>
    </>
  )
}

/**
 * Claim a slot in the target group; if it's full fall back to the agent's own desk, then the
 * waiting area, then stay put. Never throws: someone always has somewhere to be.
 */
function resolvePlace(
  agentId: string,
  target: string,
  deskId: string,
  current: string | null,
): Place {
  for (const candidate of [target, deskId, 'wait']) {
    const slot = claimSlot(agentId, candidate, current)
    if (slot) return slot
  }
  return (current && PLACES[current]) || PLACES['wait:0']!
}

function easeOutBack(x: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

// ---------------------------------------------------------------------------------------------
// Hand props: kept upright in world space and placed at the hand each frame, which is far more
// robust than parenting to a bone whose orientation changes with every arm pose.

interface HandProps {
  mug: Group
  book: Group
  dispose(): void
}

function createHandProps(): HandProps {
  const mugGeo = mergeGeometries([
    new CylinderGeometry(0.038, 0.033, 0.085, 18).translate(0, 0.0425, 0),
    new TorusGeometry(0.024, 0.008, 8, 14).rotateY(Math.PI / 2).translate(0, 0.045, 0.04),
  ])!
  const mug = new Group()
  const mugMesh = new Mesh(mugGeo, materials.terracottaPot)
  mugMesh.castShadow = true
  mug.add(mugMesh)

  const coverGeo = new BoxGeometry(0.15, 0.014, 0.2)
  const pagesGeo = new BoxGeometry(0.14, 0.016, 0.19)
  const book = new Group()
  for (const side of [-1, 1]) {
    const cover = new Mesh(coverGeo, materials.fabricBlue)
    cover.position.set((side * 0.15) / 2, 0, 0)
    cover.rotation.z = side * -0.18
    cover.castShadow = true
    const pages = new Mesh(pagesGeo, materials.paper)
    pages.position.set((side * 0.14) / 2, 0.013, 0)
    pages.rotation.z = side * -0.18
    book.add(cover, pages)
  }
  mug.visible = false
  book.visible = false
  return {
    mug,
    book,
    dispose() {
      mugGeo.dispose()
      coverGeo.dispose()
      pagesGeo.dispose()
    },
  }
}

function updateHandProps(
  props: HandProps,
  rig: CharacterRig,
  active: 'mug' | 'book' | null,
  yaw: number,
  scratch: { v: Vector3; w: Vector3 },
) {
  props.mug.visible = active === 'mug'
  props.book.visible = active === 'book'
  if (active === 'mug') {
    rig.bones.hand_R.getWorldPosition(scratch.v)
    // Held just in front of the fist (the hand sphere would otherwise swallow it).
    props.mug.position.set(
      scratch.v.x + Math.sin(yaw) * 0.07,
      scratch.v.y - 0.07,
      scratch.v.z + Math.cos(yaw) * 0.07,
    )
    props.mug.rotation.set(0, yaw + Math.PI / 2, 0)
  } else if (active === 'book') {
    rig.bones.hand_L.getWorldPosition(scratch.v)
    rig.bones.hand_R.getWorldPosition(scratch.w)
    props.book.position.copy(scratch.v).add(scratch.w).multiplyScalar(0.5)
    props.book.position.y += 0.03
    // Open book faces the reader: tilt its top edge back towards the head.
    props.book.rotation.set(0, yaw, 0)
    props.book.rotateX(-0.95)
  }
}
