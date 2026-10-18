import type { RapierRigidBody } from '@react-three/rapier'
import { MathUtils, Quaternion, Vector3 } from 'three'
import { TUNING } from '../config/tuning'
import type { VehicleController } from './abilities'
import type { CarControls } from './useCarControls'

const isRear = (i: number) => i >= 2

export type WheelTelemetry = {
  contact: boolean
  skid: number // 0–1, how hard the tyre is sliding
  point: Vector3 // world contact point, valid while in contact
  normal: Vector3 // world ground normal, valid while in contact
}

// What the effects, camera and sound read about the car: landings, skids, braking.
// Stepped with physics after the abilities, so it holds still while the game is paused.
export type CarTelemetry = {
  speed: number // m/s along the car's forward axis (negative in reverse)
  throttle: number // -1…1, the throttle the car was given this step
  grounded: boolean
  airTime: number // s since the wheels left the ground
  fallSpeed: number // m/s towards the surface landed on, at the last landing (else downwards)
  landings: number // bumped on every landing, so readers can spot a new one
  landingImpact: number // 0–1 strength of the last landing
  braking: boolean
  respawns: number // bumped on every R or fall, not on a race restart
  wheels: WheelTelemetry[]
}

export const createTelemetry = (): CarTelemetry => ({
  speed: 0,
  throttle: 0,
  grounded: false,
  // The car starts in the air at spawn; see resetTelemetry.
  airTime: -Infinity,
  fallSpeed: 0,
  landings: 0,
  landingImpact: 0,
  braking: false,
  respawns: 0,
  wheels: TUNING.car.wheels.positions.map(() => ({
    contact: false,
    skid: 0,
    point: new Vector3(),
    normal: new Vector3(0, 1, 0),
  })),
})

// After a reset the car drops onto the ground from a little above; a negative-infinite
// air time keeps that touchdown from counting as a landing. `respawned` is false for a race
// restart, which isn't counted in `respawns`.
export function resetTelemetry(t: CarTelemetry, respawned: boolean) {
  if (respawned) t.respawns++
  t.airTime = -Infinity
  t.fallSpeed = 0
  for (const w of t.wheels) {
    w.contact = false
    w.skid = 0
  }
}

const quat = new Quaternion()
const forward = new Vector3()
const axle = new Vector3()
const pointVel = new Vector3()
const normal = new Vector3()
const lastVel = new Vector3() // on the last airborne step

// Call after `updateVehicle`, which refreshes the wheel contacts.
export function stepTelemetry(
  t: CarTelemetry,
  body: RapierRigidBody,
  vc: VehicleController,
  c: CarControls,
  dt: number,
) {
  const { landing, skid } = TUNING.vfx
  const r = body.rotation()
  quat.set(r.x, r.y, r.z, r.w)

  let grounded = false
  normal.set(0, 0, 0)
  t.wheels.forEach((w, i) => {
    const point = vc.wheelContactPoint(i)
    const n = vc.wheelContactNormal(i)
    w.contact = vc.wheelIsInContact(i) && !!point && !!n
    if (!w.contact || !point || !n) {
      w.skid = 0
      return
    }
    grounded = true
    w.point.set(point.x, point.y, point.z)
    w.normal.set(n.x, n.y, n.z)
    normal.add(w.normal)

    // Car-local +X is left and positive steering turns left.
    const steer = vc.wheelSteering(i) ?? 0
    forward.set(Math.sin(steer), 0, Math.cos(steer)).applyQuaternion(quat)
    axle.set(Math.cos(steer), 0, -Math.sin(steer)).applyQuaternion(quat)
    const v = body.velocityAtPoint(point)
    pointVel.set(v.x, v.y, v.z)

    const slip = Math.abs(pointVel.dot(axle))
    w.skid = MathUtils.clamp(
      (slip - skid.minSlipSpeed) / (skid.fullSlipSpeed - skid.minSlipSpeed),
      0,
      1,
    )
    // A locked rear wheel slides along the ground too.
    const locked =
      isRear(i) && c.handbrake && Math.abs(pointVel.dot(forward)) > skid.handbrakeMinSpeed
    if (locked) w.skid = Math.max(w.skid, 0.7)
  })

  if (!grounded) {
    t.airTime += dt
    const v = body.linvel()
    lastVel.set(v.x, v.y, v.z)
    t.fallSpeed = Math.max(0, -v.y)
  } else {
    // A landing's impact is the speed into the surface it lands on (a wall, a ramp or the
    // floor), from the last step in the air.
    if (!t.grounded && t.airTime > 0) {
      t.fallSpeed = Math.max(0, -lastVel.dot(normal.normalize()))
    }
    if (!t.grounded && t.airTime > landing.minAirTime && t.fallSpeed > landing.minImpactSpeed) {
      t.landings++
      t.landingImpact = Math.min(t.fallSpeed / landing.fullImpactSpeed, 1)
    }
    t.airTime = 0
  }
  t.grounded = grounded

  // Brake lights: braking against the motion, or the handbrake while rolling.
  const speed = vc.currentVehicleSpeed()
  t.speed = speed
  t.throttle = c.throttle
  const { stopSpeed } = TUNING.car
  t.braking =
    (c.throttle > 0 && speed < -stopSpeed) ||
    (c.throttle < 0 && speed > stopSpeed) ||
    (c.handbrake && Math.abs(speed) > stopSpeed)
}
