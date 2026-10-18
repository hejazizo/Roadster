import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { useRef, type RefObject } from 'react'
import { Color, MathUtils, Vector3, type Object3D } from 'three'
import type { CarTelemetry } from '../car/telemetry'
import { useRaceStore } from '../state/raceStore'
import Particles, { type ParticlesHandle } from './Particles'
import TireMarks from './TireMarks'

// Embers and heat behind the nozzles while thrusting (per nozzle, at full thrust).
const EMBER_RATE = 70 // per second
const EMBER_COLOR = new Color(4, 1.6, 0.4) // HDR, so it blooms
const EMBER_SPEED = 6 // m/s out of the nozzle
const HEAT_RATE = 25
const HEAT_COLOR = new Color(0.35, 0.12, 0.03) // faint additive glow
// Dust kicked up by a landing, per wheel on the ground, at full impact.
const DUST_PER_WHEEL = 18
const DUST_COLOR = new Color('#b9ab8f')
// Tyre smoke from sliding wheels, per wheel at full skid.
const SMOKE_RATE = 18
const SMOKE_COLOR = new Color('#d8d8d8')
const SMOKE_MIN_SKID = 0.4

const pos = new Vector3()
const dir = new Vector3()
const vel = new Vector3()
const carVel = new Vector3()
const spread = new Vector3()
const tangent = new Vector3()
const bitangent = new Vector3()

const rand = (min: number, max: number) => min + Math.random() * (max - min)
// A random vector in the unit ball.
const jitter = (out: Vector3) => out.randomDirection().multiplyScalar(Math.random())

type CarEffectsProps = {
  body: RefObject<RapierRigidBody | null>
  telemetry: RefObject<CarTelemetry>
  thrust: RefObject<number>
  nozzles: RefObject<(Object3D | null)[]>
}

// World-space effects around the car: exhaust embers, landing dust, tyre smoke and marks.
export default function CarEffects({ body, telemetry, thrust, nozzles }: CarEffectsProps) {
  const embers = useRef<ParticlesHandle>(null)
  const dust = useRef<ParticlesHandle>(null)
  const landings = useRef(telemetry.current.landings)
  // Fractional particles carried to the next frame, so low rates still emit.
  const carry = useRef({ ember: 0, heat: 0, smoke: 0 })

  // Emits `rate * dt` particles on average, keeping the remainder in carry[key].
  const count = (key: keyof typeof carry.current, rate: number, dt: number) => {
    const total = carry.current[key] + rate * dt
    const n = Math.floor(total)
    carry.current[key] = total - n
    return n
  }

  useFrame((_, dt) => {
    const t = telemetry.current
    const newLanding = t.landings !== landings.current
    landings.current = t.landings
    if (useRaceStore.getState().paused) return
    const v = body.current?.linvel()
    carVel.set(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0)

    const power = thrust.current
    if (power > 0.01 && embers.current) {
      for (const nozzle of nozzles.current) {
        if (!nozzle) continue
        nozzle.updateWorldMatrix(true, false)
        nozzle.getWorldPosition(pos)
        nozzle.getWorldDirection(dir).negate() // −Z is the exhaust
        for (let i = count('ember', EMBER_RATE * power, dt); i > 0; i--) {
          vel
            .copy(dir)
            .multiplyScalar(EMBER_SPEED * power * rand(0.6, 1.2))
            .add(carVel)
            .add(jitter(spread).multiplyScalar(1.5))
          spread.copy(pos).addScaledVector(dir, rand(0, 0.3 * power))
          embers.current.emit(spread, vel, rand(0.2, 0.45), rand(0.04, 0.09), EMBER_COLOR)
        }
        for (let i = count('heat', HEAT_RATE * power, dt); i > 0; i--) {
          vel
            .copy(dir)
            .multiplyScalar(3 * power)
            .add(carVel)
            .add(jitter(spread))
          spread.copy(pos).addScaledVector(dir, rand(0.2, 0.6 * power))
          embers.current.emit(spread, vel, rand(0.25, 0.4), rand(0.25, 0.45), HEAT_COLOR)
        }
      }
    }

    if (!dust.current) return
    for (const w of t.wheels) {
      if (!w.contact) continue
      // Two directions across the ground at the contact.
      tangent.set(1, 0, 0).cross(w.normal)
      if (tangent.lengthSq() < 1e-4) tangent.set(0, 0, 1).cross(w.normal)
      tangent.normalize()
      bitangent.crossVectors(w.normal, tangent)

      if (newLanding) {
        const impact = t.landingImpact
        const n = Math.round(DUST_PER_WHEEL * (0.3 + 0.7 * impact))
        for (let i = 0; i < n; i++) {
          const angle = Math.random() * Math.PI * 2
          const speed = rand(1, 4) * (0.4 + impact)
          vel
            .copy(tangent)
            .multiplyScalar(Math.cos(angle) * speed)
            .addScaledVector(bitangent, Math.sin(angle) * speed)
            .addScaledVector(w.normal, rand(0.3, 1.5) * (0.5 + impact))
            .addScaledVector(carVel, 0.3)
          spread.copy(w.point).addScaledVector(w.normal, 0.15)
          const size = rand(0.5, 1) * (0.6 + 0.6 * impact)
          dust.current.emit(spread, vel, rand(0.8, 1.6), size, DUST_COLOR)
        }
      }

      if (w.skid > SMOKE_MIN_SKID) {
        const amount = MathUtils.inverseLerp(SMOKE_MIN_SKID, 1, w.skid)
        for (let i = count('smoke', SMOKE_RATE * amount, dt); i > 0; i--) {
          vel
            .copy(carVel)
            .multiplyScalar(0.2)
            .add(jitter(spread).multiplyScalar(0.6))
            .addScaledVector(w.normal, 0.6)
          spread.copy(w.point).addScaledVector(w.normal, 0.2)
          dust.current.emit(spread, vel, rand(0.7, 1.2), rand(0.4, 0.7), SMOKE_COLOR)
        }
      }
    }
  })

  return (
    <>
      <TireMarks telemetry={telemetry} />
      <Particles ref={embers} count={600} additive drag={3} lift={1.5} grow={1.8} />
      <Particles
        ref={dust}
        count={500}
        drag={2.5}
        lift={0.4}
        grow={3}
        fadeIn={0.1}
        opacity={0.55}
      />
    </>
  )
}
