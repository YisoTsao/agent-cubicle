import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  OrthographicCamera,
  ShaderMaterial,
  Vector3,
} from 'three'
import { THEMES } from '../config/themes'
import { useSettings } from '../store/settings'

// The sky around the floating room: a star catalogue-like field with real star colours, a
// power-law brightness spread (a few bright stars, many faint ones) and, in space, a Milky Way
// band. The camera is orthographic, so a star sphere would only ever show a thin patch of itself;
// instead each star is a fixed *direction* and the vertex shader maps the view-space direction
// onto the screen (about ±35° across the window). Orbiting the camera therefore turns the sky.

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** Black-body-ish colour for a star temperature (K), blue-white through orange. */
function starColor(kelvin: number): Color {
  const t = (kelvin - 3000) / 7000
  const stops = [
    new Color('#ffb46b'),
    new Color('#ffd9a8'),
    new Color('#fff4e8'),
    new Color('#dbe6ff'),
    new Color('#b4ccff'),
  ]
  const x = Math.min(0.999, Math.max(0, t)) * (stops.length - 1)
  const i = Math.floor(x)
  return stops[i]!.clone().lerp(stops[i + 1]!, x - i)
}

function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(Math.PI * 2 * r())
}

function starGeometry(count: number, band: boolean): BufferGeometry {
  const r = rng(77)
  const dir = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const size = new Float32Array(count)
  // Milky Way: a great circle through the default view, stars thick around it.
  const normal = new Vector3(1, -0.45, 0.55).normalize()
  const u = new Vector3(0.3, 0.2, 1).normalize()
  const w = new Vector3().crossVectors(normal, u)
  const v = new Vector3()
  for (let i = 0; i < count; i++) {
    const inBand = band && i < count * 0.7
    if (inBand) {
      const a = r() * Math.PI * 2
      const lat = gauss(r) * 0.14
      v.copy(u)
        .multiplyScalar(Math.cos(a))
        .addScaledVector(w, Math.sin(a))
        .multiplyScalar(Math.cos(lat))
        .addScaledVector(normal, Math.sin(lat))
    } else {
      const z = r() * 2 - 1
      const a = r() * Math.PI * 2
      const s = Math.sqrt(1 - z * z)
      v.set(s * Math.cos(a), z, s * Math.sin(a))
    }
    dir.set([v.x, v.y, v.z], i * 3)
    // Apparent brightness: steep power law.
    const b = Math.pow(r(), inBand ? 9 : 7)
    const kelvin = 3200 + Math.pow(r(), 1.6) * 7000
    const c = starColor(kelvin).multiplyScalar(inBand ? 0.35 + b * 0.65 : 0.5 + b * 0.9)
    col.set([c.r, c.g, c.b], i * 3)
    size[i] = inBand ? 1.3 + b * 2.4 : 1.5 + b * 3.6
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(dir, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setAttribute('size', new Float32BufferAttribute(size, 1))
  return g
}

const VERT = /* glsl */ `
  uniform float uHalf;
  uniform float uDepth;
  uniform float uPx;
  uniform float uTime;
  attribute float size;
  varying vec3 vColor;
  void main() {
    vec3 d = normalize(mat3(modelViewMatrix) * position);
    // Only the hemisphere in front of the camera is drawn.
    float front = step(d.z, -0.05);
    vec2 xy = d.xy * uHalf / 0.6;
    gl_Position = projectionMatrix * vec4(xy, -uDepth, 1.0);
    gl_Position.w = mix(0.0, gl_Position.w, front);
    float tw = 1.0 + 0.12 * sin(uTime * 1.3 + position.x * 91.0 + position.y * 57.0);
    gl_PointSize = size * uPx;
    vColor = color * tw;
  }
`

const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    float core = exp(-d * d * 7.0);
    float halo = exp(-d * 3.5) * 0.25;
    float a = (core + halo) * step(d, 1.0);
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`

function StarField({ count, band }: { count: number; band: boolean }) {
  const geometry = useMemo(() => starGeometry(count, band), [count, band])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        vertexColors: true,
        // Not "transparent", so it is drawn in the opaque queue (renderOrder -10: first) and the
        // room paints over it; additive blending still applies.
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          uHalf: { value: 6 },
          uDepth: { value: 60 },
          uPx: { value: 1 },
          uTime: { value: 0 },
        },
      }),
    [],
  )
  const camera = useThree((s) => s.camera)
  useFrame(({ clock, gl }) => {
    const cam = camera as OrthographicCamera
    const u = material.uniforms
    const halfW = (cam.right - cam.left) / 2 / cam.zoom
    const halfH = (cam.top - cam.bottom) / 2 / cam.zoom
    u['uHalf']!.value = Math.max(halfW, halfH)
    u['uDepth']!.value = (cam.near + cam.far) * 0.5
    u['uPx']!.value = gl.getPixelRatio()
    u['uTime']!.value = clock.elapsedTime
  })
  return (
    <points
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-10}
      onUpdate={(p) => p.matrixAutoUpdate && p.updateMatrix()}
    />
  )
}

export function Sky() {
  const sky = THEMES[useSettings((s) => s.scene)].sky
  if (sky === 'none') return null
  return sky === 'space' ? (
    <StarField count={24000} band />
  ) : (
    <StarField count={2600} band={false} />
  )
}
