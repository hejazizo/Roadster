import { useFrame } from '@react-three/fiber'
import { useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  ShaderMaterial,
  type Color,
  type Vector3,
} from 'three'
import { useRaceStore } from '../state/raceStore'

export type ParticlesHandle = {
  // Spawns one particle; the oldest is recycled when the pool is full.
  emit(position: Vector3, velocity: Vector3, life: number, size: number, color: Color): void
}

type ParticlesProps = {
  ref: Ref<ParticlesHandle>
  count: number // pool size
  additive?: boolean // glowing (embers) instead of opaque-ish (dust)
  drag?: number // 1/s, how quickly particles lose their velocity
  lift?: number // m/s², upward acceleration (negative sinks)
  grow?: number // size at the end of life, as a multiple of the start size
  fadeIn?: number // fraction of the life spent fading in
  opacity?: number
}

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uViewportHeight;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // World-space size: half the viewport height spans tan(fov / 2) at unit distance.
    gl_PointSize = aAlpha > 0.0 ? aSize * projectionMatrix[1][1] * uViewportHeight * 0.5 / -mv.z : 0.0;
    vAlpha = aAlpha;
    vColor = aColor;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.0, 1.0, r);
    gl_FragColor = vec4(vColor, a * a * vAlpha * uOpacity);
  }
`

type Motion = { drag: number; lift: number; grow: number; fadeIn: number }

// The particle data and its GPU buffers. Slots are recycled oldest first.
class ParticlePool {
  readonly geometry = new BufferGeometry()
  readonly material: ShaderMaterial
  private readonly position: BufferAttribute
  private readonly size: BufferAttribute
  private readonly alpha: BufferAttribute
  private readonly color: BufferAttribute
  private readonly velocity: Float32Array
  private readonly age: Float32Array
  private readonly life: Float32Array // 0 marks a free slot
  private readonly startSize: Float32Array
  private readonly count: number
  private next = 0

  constructor(count: number, additive: boolean, opacity: number) {
    this.count = count
    this.position = new BufferAttribute(new Float32Array(count * 3), 3)
    this.size = new BufferAttribute(new Float32Array(count), 1)
    this.alpha = new BufferAttribute(new Float32Array(count), 1)
    this.color = new BufferAttribute(new Float32Array(count * 3), 3)
    this.geometry.setAttribute('position', this.position)
    this.geometry.setAttribute('aSize', this.size)
    this.geometry.setAttribute('aAlpha', this.alpha)
    this.geometry.setAttribute('aColor', this.color)
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uViewportHeight: { value: 1 }, uOpacity: { value: opacity } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    })
    this.velocity = new Float32Array(count * 3)
    this.age = new Float32Array(count)
    this.life = new Float32Array(count)
    this.startSize = new Float32Array(count)
  }

  emit(p: Vector3, v: Vector3, life: number, size: number, c: Color) {
    const i = this.next
    this.next = (i + 1) % this.count
    this.position.setXYZ(i, p.x, p.y, p.z)
    this.velocity.set([v.x, v.y, v.z], i * 3)
    this.color.setXYZ(i, c.r, c.g, c.b)
    this.age[i] = 0
    this.life[i] = life
    this.startSize[i] = size
  }

  clear() {
    this.life.fill(0)
    this.alpha.array.fill(0)
    this.alpha.needsUpdate = true
  }

  setViewportHeight(pixels: number) {
    this.material.uniforms.uViewportHeight.value = pixels
  }

  update(dt: number, { drag, lift, grow, fadeIn }: Motion) {
    const keep = Math.exp(-drag * dt)
    const pos = this.position.array as Float32Array
    const v = this.velocity
    for (let i = 0; i < this.count; i++) {
      const life = this.life[i]
      if (life === 0) {
        this.alpha.setX(i, 0)
        continue
      }
      const age = (this.age[i] += dt)
      if (age >= life) {
        this.life[i] = 0
        this.alpha.setX(i, 0)
        continue
      }
      v[i * 3] *= keep
      v[i * 3 + 1] = v[i * 3 + 1] * keep + lift * dt
      v[i * 3 + 2] *= keep
      pos[i * 3] += v[i * 3] * dt
      pos[i * 3 + 1] += v[i * 3 + 1] * dt
      pos[i * 3 + 2] += v[i * 3 + 2] * dt
      const t = age / life
      this.size.setX(i, this.startSize[i] * (1 + (grow - 1) * t))
      this.alpha.setX(i, (1 - t) * (fadeIn > 0 ? Math.min(t / fadeIn, 1) : 1))
    }
    this.position.needsUpdate = true
    this.size.needsUpdate = true
    this.alpha.needsUpdate = true
    this.color.needsUpdate = true
  }
}

// A fixed pool of round, soft, camera-facing particles in world space, drawn in one call.
// Particles freeze while the game is paused and vanish on a restart.
export default function Particles({
  ref,
  count,
  additive = false,
  drag = 0,
  lift = 0,
  grow = 1,
  fadeIn = 0,
  opacity = 1,
}: ParticlesProps) {
  const runId = useRef(useRaceStore.getState().runId)
  const pool = useMemo(() => new ParticlePool(count, additive, opacity), [count, additive, opacity])

  useImperativeHandle(ref, () => ({ emit: pool.emit.bind(pool) }), [pool])

  useFrame(({ gl }, dt) => {
    const race = useRaceStore.getState()
    if (race.runId !== runId.current) {
      runId.current = race.runId
      pool.clear()
    }
    pool.setViewportHeight(gl.domElement.height)
    if (!race.paused) pool.update(dt, { drag, lift, grow, fadeIn })
  })

  return (
    <points
      geometry={pool.geometry}
      material={pool.material}
      frustumCulled={false}
      // Drawn after the opaque world and the tire marks.
      renderOrder={1}
    />
  )
}
