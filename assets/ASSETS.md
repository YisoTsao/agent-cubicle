# Asset conventions

- Format: glTF 2.0 binary (`.glb`); PBR metal/rough materials.
- Units: **1 unit = 1 metre**. Y-up. Characters face **+Z** in their local space, origin at floor level between the feet (seated rigs: origin on the floor below the hips).
- Textures: ≤1K for props, ≤2K for characters / hero props; KTX2 (Basis) compressed; colour maps sRGB, data maps linear.
- Geometry: Meshopt or Draco compressed; polycount proportional to on-screen size.
- Materials: reuse the shared palette in `src/renderer/src/config/render.ts` where possible.
- Static props are merged at runtime by `StaticBatch`; mark animated sub-trees with `userData.dynamic = true`.
