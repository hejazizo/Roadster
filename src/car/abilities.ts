import type { RapierRigidBody, useRapier } from '@react-three/rapier'
import { MathUtils, Quaternion, Vector3 } from 'three'
import { TUNING } from '../config/tuning'
import type { CarControls } from './useCarControls'

const { fuel, boost, hop, glide, airControl } = TUNING.car

export type VehicleController = ReturnType<
  ReturnType<typeof useRapier>['world']['createVehicleController']
>

export type AbilityState = {
  fuel: number
  grounded: boolean
  boosting: boolean
  gliding: boolean
}

export const createAbilityState = (): AbilityState => ({
  fuel: fuel.max,
  grounded: false,
  boosting: false,
  gliding: false,
})

// Frame-rate independent lerp factor for a damping rate.
const dampFactor = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt)

const quat = new Quaternion()
const quatInv = new Quaternion()
const forward = new Vector3()
const up = new Vector3()
const left = new Vector3()
const vel = new Vector3()
const flatVel = new Vector3()
const heading = new Vector3()
const spin = new Vector3()
const impulse = new Vector3()

// Refill and drop any glide, e.g. on reset.
export function resetAbilities(state: AbilityState, body: RapierRigidBody) {
  Object.assign(state, createAbilityState())
  body.setGravityScale(1, true)
}

// Boost, hop, glide and fuel for one physics step. Call after `updateVehicle`, which
// refreshes the wheel contacts used for the grounded check.
export function stepAbilities(
  state: AbilityState,
  body: RapierRigidBody,
  vc: VehicleController,
  c: CarControls,
  dt: number,
) {
  const mass = body.mass()
  const r = body.rotation()
  quat.set(r.x, r.y, r.z, r.w)
  forward.set(0, 0, 1).applyQuaternion(quat)
  up.set(0, 1, 0).applyQuaternion(quat)

  let grounded = false
  for (let i = 0; i < vc.numWheels(); i++) grounded ||= vc.wheelIsInContact(i)
  state.grounded = grounded

  if (c.hopPressed && grounded) {
    impulse.copy(up).multiplyScalar(hop.velocity * mass)
    body.applyImpulse(impulse, true)
  }

  const v = body.linvel()
  vel.set(v.x, v.y, v.z)

  state.boosting = c.boost && state.fuel > 0 && vel.dot(forward) < boost.maxSpeed
  if (state.boosting) {
    impulse.copy(forward).multiplyScalar(boost.acceleration * mass * dt)
    body.applyImpulse(impulse, true)
    state.fuel -= boost.fuelPerSecond * dt
  }

  const gliding = !grounded && c.hop && state.fuel > 0
  if (gliding !== state.gliding) body.setGravityScale(gliding ? glide.gravityScale : 1, true)
  state.gliding = gliding
  if (gliding) {
    state.fuel -= glide.fuelPerSecond * dt
    if (vel.y < -glide.maxFallSpeed) {
      vel.y += (-glide.maxFallSpeed - vel.y) * dampFactor(glide.fallDamping, dt)
    }
    // Swing horizontal velocity towards the heading, keeping its speed, so yawing steers.
    flatVel.set(vel.x, 0, vel.z)
    heading.set(forward.x, 0, forward.z)
    const flatSpeed = flatVel.length()
    if (flatSpeed > 0 && heading.lengthSq() > 0) {
      heading.normalize().multiplyScalar(flatSpeed)
      flatVel.lerp(heading, dampFactor(glide.headingAlign, dt)).setLength(flatSpeed)
      vel.set(flatVel.x, vel.y, flatVel.z)
    }
    body.setLinvel(vel, true)
    steerInAir(body, c, dt)
  }

  if (grounded && !state.boosting) state.fuel += fuel.rechargePerSecond * dt
  state.fuel = MathUtils.clamp(state.fuel, 0, fuel.max)
}

// Car-local axes: +X left, +Y up, +Z forward. Positive X spin dips the nose, positive
// Y spin turns left, positive Z spin lifts the left side.
function steerInAir(body: RapierRigidBody, c: CarControls, dt: number) {
  const turn = -c.steer // positive turns left
  left.set(1, 0, 0).applyQuaternion(quat)
  const pitch = -Math.asin(MathUtils.clamp(forward.y, -1, 1)) // nose down is positive
  const roll = Math.asin(MathUtils.clamp(left.y, -1, 1)) // left side up is positive
  const pitchTarget = c.pitch * airControl.pitchAngle
  const bank = -turn * airControl.bankAngle // left side down when turning left

  const w = body.angvel()
  quatInv.copy(quat).invert()
  spin.set(w.x, w.y, w.z).applyQuaternion(quatInv)
  const k = dampFactor(airControl.damping, dt)
  spin.x += ((pitchTarget - pitch) * airControl.levelRate - spin.x) * k
  spin.y += (turn * airControl.yawRate - spin.y) * k
  spin.z += ((bank - roll) * airControl.levelRate - spin.z) * k
  body.setAngvel(spin.applyQuaternion(quat), true)
}
