import type { RapierRigidBody, useRapier } from '@react-three/rapier'
import { Quaternion, Vector3 } from 'three'
import { TUNING } from '../config/tuning'
import type { VehicleController } from './abilities'

const { spawn } = TUNING.car

type Rapier = ReturnType<typeof useRapier>
export type PhysicsWorld = Rapier['world']
export type Ray = InstanceType<Rapier['rapier']['Ray']>

export type SafePointState = {
  position: Vector3
  yaw: number
  valid: boolean // false until a safe pose has been recorded; respawns go to spawn
  safeTime: number // s the current pose has been safe for
}

export const createSafePoint = (): SafePointState => ({
  position: new Vector3(),
  yaw: 0,
  valid: false,
  safeTime: 0,
})

const Y_AXIS = new Vector3(0, 1, 0)
const PROBE_DIST = 5 // m below the car's centre, well past the wheels' reach
const quat = new Quaternion()
const forward = new Vector3()
const up = new Vector3()

// Height of the first surface below (x, y, z) within maxDist, ignoring the car.
function groundBelow(
  world: PhysicsWorld,
  ray: Ray,
  body: RapierRigidBody,
  x: number,
  y: number,
  z: number,
  maxDist: number,
) {
  ray.origin.x = x
  ray.origin.y = y
  ray.origin.z = z
  ray.dir.x = 0
  ray.dir.y = -1
  ray.dir.z = 0
  const hit = world.castRay(ray, maxDist, true, undefined, undefined, undefined, body)
  return hit ? y - hit.timeOfImpact : null
}

// Records the car's pose as the respawn point once it has been safe for a moment: upright,
// all wheels down, and level ground for `edgeMargin` around it, so a respawn can't leave the
// car hanging over a drop or on a ramp. Call after `updateVehicle` (fresh wheel contacts).
export function stepSafePoint(
  state: SafePointState,
  body: RapierRigidBody,
  vc: VehicleController,
  world: PhysicsWorld,
  ray: Ray,
  dt: number,
) {
  const { minSafeTime, minUpright, edgeMargin, flatTolerance } = TUNING.car.respawn
  const r = body.rotation()
  quat.set(r.x, r.y, r.z, r.w)
  up.set(0, 1, 0).applyQuaternion(quat)
  forward.set(0, 0, 1).applyQuaternion(quat).setY(0).normalize()

  let allWheels = true
  for (let i = 0; i < vc.numWheels(); i++) allWheels &&= vc.wheelIsInContact(i)
  if (
    !allWheels ||
    up.y < minUpright ||
    !onLevelGround(body, world, ray, edgeMargin, flatTolerance)
  ) {
    state.safeTime = 0
    return
  }

  state.safeTime += dt
  if (state.safeTime < minSafeTime) return
  const p = body.translation()
  state.position.set(p.x, p.y, p.z)
  state.yaw = Math.atan2(forward.x, forward.z)
  state.valid = true
}

// Probes the ground under the car and `margin` ahead, behind and to each side (along the
// flattened `forward`).
function onLevelGround(
  body: RapierRigidBody,
  world: PhysicsWorld,
  ray: Ray,
  margin: number,
  tolerance: number,
) {
  const p = body.translation()
  const under = groundBelow(world, ray, body, p.x, p.y, p.z, PROBE_DIST)
  if (under === null) return false

  const fx = forward.x * margin
  const fz = forward.z * margin
  // Sideways is the forward axis turned 90° on the ground plane.
  const offsets = [
    [fx, fz],
    [-fx, -fz],
    [fz, -fx],
    [-fz, fx],
  ]
  return offsets.every(([dx, dz]) => {
    const y = groundBelow(world, ray, body, p.x + dx, p.y, p.z + dz, PROBE_DIST)
    return y !== null && Math.abs(y - under) <= tolerance
  })
}

// Puts the car at rest at the last safe point (or spawn), upright and facing its heading.
export function placeAtSafePoint(state: SafePointState, body: RapierRigidBody) {
  if (state.valid) {
    const { x, y, z } = state.position
    body.setTranslation({ x, y: y + TUNING.car.respawn.lift, z }, true)
  } else {
    const [x, y, z] = spawn.position
    body.setTranslation({ x, y, z }, true)
  }
  body.setRotation(quat.setFromAxisAngle(Y_AXIS, state.valid ? state.yaw : spawn.yaw), true)
  body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  state.safeTime = 0
}
