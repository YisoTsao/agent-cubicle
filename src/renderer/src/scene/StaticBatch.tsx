import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, type Material } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Merges every static mesh in its subtree into one mesh per (material, castShadow) pair.
// Furniture is authored as many small primitives for readability; this collapses them so draw
// calls scale with material count, not part count (SPEC §6 — geometry merging).
//
// Excluded: InstancedMesh (already batched), lights, and anything under an object with
// `userData.dynamic = true` (animated parts).

interface Bucket {
  material: Material
  castShadow: boolean
  receiveShadow: boolean
  geometries: BufferGeometry[]
}

export function StaticBatch({ children }: { children: ReactNode }) {
  const source = useRef<Group>(null)
  const output = useRef<Group>(null)

  useLayoutEffect(() => {
    const src = source.current
    const out = output.current
    if (!src || !out) return

    src.updateWorldMatrix(true, true)
    const toLocal = new Matrix4().copy(src.matrixWorld).invert()
    const buckets = new Map<string, Bucket>()
    const merged: Mesh[] = []
    const hidden: Mesh[] = []

    src.traverse((obj) => {
      if (!(obj instanceof Mesh) || obj instanceof InstancedMesh) return
      if (isDynamic(obj, src) || Array.isArray(obj.material)) return
      const material = obj.material as Material
      const key = `${material.uuid}|${obj.castShadow ? 1 : 0}`
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { material, castShadow: obj.castShadow, receiveShadow: false, geometries: [] }
        buckets.set(key, bucket)
      }
      bucket.receiveShadow ||= obj.receiveShadow
      // Normalise to non-indexed + common attributes so heterogeneous primitives can merge.
      const geo = (
        obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone()
      ) as BufferGeometry
      for (const name of Object.keys(geo.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name)
      }
      geo.morphAttributes = {}
      geo.clearGroups()
      geo.applyMatrix4(new Matrix4().multiplyMatrices(toLocal, obj.matrixWorld))
      bucket.geometries.push(geo)
      hidden.push(obj)
    })

    for (const b of buckets.values()) {
      const geometry = mergeGeometries(b.geometries, false)
      b.geometries.forEach((g) => g.dispose())
      if (!geometry) continue
      geometry.computeBoundingSphere()
      const mesh = new Mesh(geometry, b.material)
      mesh.castShadow = b.castShadow
      mesh.receiveShadow = b.receiveShadow
      mesh.name = `batch:${b.material.name || b.material.uuid}`
      merged.push(mesh)
      out.add(mesh)
    }
    for (const m of hidden) m.visible = false

    return () => {
      for (const m of merged) {
        out.remove(m)
        m.geometry.dispose() // materials are shared app-wide; never dispose them here
      }
      for (const m of hidden) m.visible = true
    }
  }, [])

  return (
    <>
      <group ref={source}>{children}</group>
      <group ref={output} />
    </>
  )
}

function isDynamic(obj: Mesh, root: Group): boolean {
  for (let o: typeof obj.parent | Mesh = obj; o && o !== root; o = o.parent) {
    if (o.userData['dynamic']) return true
  }
  return false
}
