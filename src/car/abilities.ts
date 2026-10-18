import type { RapierRigidBody, useRapier } from '@react-three/rapier'
import { MathUtils, Quaternion, Vector3 } from 'three'
import { TUNING } from '../config/tuning'
import type { Assist } from './handling'
import type { PhysicsWorld, QueryFlags, Ray } from './respawn'
import type { CarControls } from './useCarControls'

const { fuel, boost, hop, glide, airControl, landing } = TUNING.car

export type VehicleController = ReturnType<
  ReturnType<typeof useRapier>['world']['createVehicleController']
>

// What the ground probe below the car casts against: solid level geometry, not the car.
export type GroundProbe = { world: PhysicsWorld; ray: Ray; flags: QueryFlags }

export type AbilityState = {
  fuel: number
  grounded: boolean
  boosting: boolean
  gliding: boolean
  hops: number // bumped on every hop, so readers (sound) can spot a new one
  airTime: number // s since the wheels last touched the ground
  hopBuffer: number // s a hop press is still waiting for the ground
  sinceHop: number // s since the last hop
  landingAssist: number // s of landing assist left
}

export const createAbilityState = (): AbilityState => ({
  fuel: fuel.max,
  grounded: false,
  boosting: false,
  gliding: false,
  hops: 0,
  airTime: 0,
  hopBuffer: 0,
  sinceHop: Infinity,
  landingAssist: 0,
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
const level = new Vector3()
const groundUp = new Vector3()
const WORLD_UP = new Vector3(0, 1, 0)

// Refill and drop any glide, e.g. on reset. The hop count carries on, so a reset doesn't
// look like a hop to its readers.
export function resetAbilities(state: AbilityState, body: RapierRigidBody) {
  Object.assign(state, { ...createAbilityState(), hops: state.hops })
  body.setGravityScale(1, true)
}

// Boost, hop, glide, air control and fuel for one physics step. Call after `updateVehicle`,
// which refreshes the wheel contacts used for the grounded check.
export function stepAbilities(
  state: AbilityState,
  body: RapierRigidBody,
  vc: VehicleController,
  c: CarControls,
  dt: number,
  assist: Assist,
  probe: GroundProbe,
) {
  const mass = body.mass()
  const r = body.rotation()
  quat.set(r.x, r.y, r.z, r.w)
  forward.set(0, 0, 1).applyQuaternion(quat)
  up.set(0, 1, 0).applyQuaternion(quat)

  let grounded = false
  for (let i = 0; i < vc.numWheels(); i++) grounded ||= vc.wheelIsInContact(i)
  if (grounded && !state.grounded && state.airTime > landing.minAirTime) {
    state.landingAssist = landing.assistTime
  }
  state.grounded = grounded
  state.airTime = grounded ? 0 : state.airTime + dt
  state.sinceHop += dt
  state.landingAssist = Math.max(0, state.landingAssist - dt)

  // A press is kept for a moment until the car can hop (buffer), and the car can still hop
  // just after driving off an edge (coyote time).
  state.hopBuffer = c.hopPressed ? hop.buffer : Math.max(0, state.hopBuffer - dt)
  const canHop = state.sinceHop > hop.cooldown && state.airTime <= hop.coyoteTime
  if (state.hopBuffer > 0 && canHop) {
    // Cancel any fall first (coyote hop), so every hop is the same height.
    const v = body.linvel()
    const falling = Math.min(0, v.x * up.x + v.y * up.y + v.z * up.z)
    impulse.copy(up).multiplyScalar((hop.velocity - falling) * mass)
    body.applyImpulse(impulse, true)
    state.hops++
    state.hopBuffer = 0
    state.sinceHop = 0
  }

  const v = body.linvel()
  vel.set(v.x, v.y, v.z)

  state.boosting = c.boost && state.fuel > 0 && vel.dot(forward) < boost.maxSpeed
  if (state.boosting) {
    impulse.copy(forward).multiplyScalar(boost.acceleration * mass * dt)
    body.applyImpulse(impulse, true)
    state.fuel -= boost.fuelPerSecond * dt
  }

  // Glide floats on the way down; on the way up it gives only a little extra lift.
  const gliding = !grounded && c.hop && state.fuel > 0
  const gravityScale = !gliding ? 1 : vel.y > 0 ? glide.riseGravityScale : glide.gravityScale
  if (body.gravityScale() !== gravityScale) body.setGravityScale(gravityScale, true)
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
  }
  if (!grounded) steerInAir(body, c, dt, gliding ? 1 : airControl.plainFactor, assist, probe)
  else if (state.landingAssist > 0) settleLanding(body, dt, assist)

  if (grounded && !state.boosting) state.fuel += fuel.rechargePerSecond * dt
  state.fuel = MathUtils.clamp(state.fuel, 0, fuel.max)
}

// The "up" the car levels to in the air: world up, blending to the normal of the ground
// below as it comes within `groundProbe`, so it lands flat on a ramp.
function levelNormal(body: RapierRigidBody, { world, ray, flags }: GroundProbe) {
  level.copy(WORLD_UP)
  const p = body.translation()
  ray.origin = { x: p.x, y: p.y, z: p.z }
  ray.dir = { x: 0, y: -1, z: 0 }
  const range = airControl.groundProbe
  const hit = world.castRayAndGetNormal(ray, range, true, flags, undefined, undefined, body)
  if (hit && hit.normal.y > 0.5) {
    const near = 1 - hit.timeOfImpact / range
    level.lerp(groundUp.set(hit.normal.x, hit.normal.y, hit.normal.z), near).normalize()
  }
  return level
}

// Car-local axes: +X left, +Y up, +Z forward. Positive X spin dips the nose, positive
// Y spin turns left, positive Z spin lifts the left side. `strength` scales the pitch and
// bank angles and the yaw control (1 gliding, less while plainly airborne); levelling out
// always runs, at the assist's rate.
function steerInAir(
  body: RapierRigidBody,
  c: CarControls,
  dt: number,
  strength: number,
  assist: Assist,
  probe: GroundProbe,
) {
  const turn = -c.steer // positive turns left
  left.set(1, 0, 0).applyQuaternion(quat)
  const n = levelNormal(body, probe)
  const pitch = -Math.asin(MathUtils.clamp(forward.dot(n), -1, 1)) // nose down is positive
  const roll = Math.asin(MathUtils.clamp(left.dot(n), -1, 1)) // left side up is positive
  const pitchTarget = c.pitch * airControl.pitchAngle * strength
  const bank = -turn * airControl.bankAngle * strength // left side down when turning left
  const levelRate = airControl.levelRate * assist.airLevel

  const w = body.angvel()
  quatInv.copy(quat).invert()
  spin.set(w.x, w.y, w.z).applyQuaternion(quatInv)
  const k = dampFactor(airControl.damping, dt)
  spin.x += ((pitchTarget - pitch) * levelRate - spin.x) * k
  spin.y += (turn * airControl.yawRate - spin.y) * dampFactor(airControl.damping * strength, dt)
  spin.z += ((bank - roll) * levelRate - spin.z) * k
  body.setAngvel(spin.applyQuaternion(quat), true)
}

// Just after a landing: damp roll and yaw spin so the car settles instead of bouncing round.
function settleLanding(body: RapierRigidBody, dt: number, assist: Assist) {
  const w = body.angvel()
  quatInv.copy(quat).invert()
  spin.set(w.x, w.y, w.z).applyQuaternion(quatInv)
  const k = 1 - dampFactor(landing.spinDamping * assist.landing, dt)
  spin.y *= k
  spin.z *= k
  body.setAngvel(spin.applyQuaternion(quat), true)
}
