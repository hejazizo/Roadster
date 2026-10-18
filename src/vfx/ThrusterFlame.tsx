import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  DataTexture,
  DoubleSide,
  ShaderMaterial,
  SpriteMaterial,
  type Group,
  type Sprite,
} from 'three'
import { FLAME, type PlumeStyle } from './plumes'
import { useRaceStore } from '../state/raceStore'

const CORE_SCALE = 0.55 // core width and length as a fraction of the outer flame
const FLICKER = 0.12 // length wobble, as a fraction
const GLOW_OFFSET = 0.08 // m behind the nozzle, clear of the bodywork

// Unit cone along −Z: base (open) at the origin, tip at z = −1.
const geometry = new ConeGeometry(1, 1, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5)

// Soft round spot: white, with alpha falling off from the centre.
function glowTexture(size = 64) {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2)
      const a = Math.max(0, 1 - r) ** 2
      data.set([255, 255, 255, Math.round(a * 255)], (y * size + x) * 4)
    }
  }
  const texture = new DataTexture(data, size, size)
  texture.needsUpdate = true
  return texture
}

const glowMap = glowTexture()
const glowMaterial = (color: Color) =>
  new SpriteMaterial({
    map: glowMap,
    color,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  })

const vertexShader = /* glsl */ `
  varying float vT;
  varying float vFacing;
  void main() {
    vT = -position.z;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Edges seen side-on fade out, so the cone reads as a soft volume.
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform float uIntensity;
  varying float vT;
  varying float vFacing;
  void main() {
    float a = pow(clamp(1.0 - vT, 0.0, 1.0), 1.5) * mix(0.3, 1.0, clamp(vFacing, 0.0, 1.0)) * uIntensity;
    gl_FragColor = vec4(mix(uBase, uTip, vT) * a, 1.0);
  }
`

const flameMaterial = (base: Color, tip: Color) =>
  new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uBase: { value: base }, uTip: { value: tip }, uIntensity: { value: 0 } },
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: DoubleSide,
  })

// Cheap smooth noise in −1…1.
const wobble = (t: number) =>
  Math.sin(t * 31) * 0.5 + Math.sin(t * 53 + 1.7) * 0.3 + Math.sin(t * 97) * 0.2

type ThrusterFlameProps = {
  thrust: () => number // 0–1
  seed: number // desynchronises the flicker of neighbouring nozzles
  style?: PlumeStyle
}

// An exhaust plume along the nozzle's −Z: an outer cone around a brighter core, and a glow.
export default function ThrusterFlame({ thrust, seed, style = FLAME }: ThrusterFlameProps) {
  const group = useRef<Group>(null)
  const cones = useRef<Group>(null)
  const glow = useRef<Sprite>(null)
  const outer = useRef<ShaderMaterial>(null)
  const core = useRef<ShaderMaterial>(null)
  const time = useRef(seed * 10)
  const materials = useMemo(
    () => ({
      outer: flameMaterial(style.outerBase, style.outerTip),
      core: flameMaterial(style.coreBase, style.coreTip),
      glow: glowMaterial(style.glow),
    }),
    [style],
  )

  useFrame((_, dt) => {
    const g = group.current
    if (!g || !cones.current || !glow.current) return
    if (!useRaceStore.getState().paused) time.current += dt
    const t = thrust()
    g.visible = t > 0.01
    if (!g.visible) return
    const flicker = 1 + FLICKER * wobble(time.current)
    const radius = style.radius * (0.6 + 0.4 * t)
    cones.current.scale.set(radius, radius, style.length() * t * flicker)
    for (const m of [outer.current, core.current]) if (m) m.uniforms.uIntensity.value = t
    glow.current.scale.setScalar(style.glowSize * (0.4 + 0.6 * t) * flicker)
    glow.current.material.opacity = t
  })

  return (
    <group ref={group} visible={false}>
      <group ref={cones}>
        <mesh geometry={geometry} renderOrder={2}>
          <primitive ref={outer} object={materials.outer} attach="material" />
        </mesh>
        <mesh geometry={geometry} scale={[CORE_SCALE, CORE_SCALE, CORE_SCALE]} renderOrder={2}>
          <primitive ref={core} object={materials.core} attach="material" />
        </mesh>
      </group>
      <sprite
        ref={glow}
        material={materials.glow}
        position={[0, 0, -GLOW_OFFSET]}
        renderOrder={2}
      />
    </group>
  )
}
