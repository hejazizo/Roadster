import type { RapierRigidBody } from '@react-three/rapier'
import { MathUtils, Quaternion, Vector3 } from 'three'
import { TUNING } from '../config/tuning'
import type { AbilityState, VehicleController } from './abilities'
import type { PhysicsWorld } from './respawn'
import type { CarControls } from './useCarControls'

type Collider = Parameters<PhysicsWorld['contactPairsWith']>[0]
// The car's chassis collider, to find it resting on its roof or side with no wheel down.
export type ChassisContacts = { world: PhysicsWorld; collider: Collider }

// How the last landing went: on the wheels, on the wheels softly under lift, or on the roof
// or side (or on the wheels too hard).
export type LandingKind = 'wheels' | 'clean' | 'bad'

const isRear = (i: number) => i >= 2

export type WheelTelemetry = {
  contact: boolean
  skid: number // 0–1, how hard the tyre is sliding
  point: Vector3 // world contact point, valid while in contact
  normal: Vector3 // world ground normal, valid while in contact
}

// What the effects, camera, sound and HUD read about the car: landings, skids, braking, and
// height, vertical speed and roll turns in the air.
// Stepped with physics after the abilities, so it holds still while the game is paused.
export type CarTelemetry = {
  speed: number // m/s along the car's forward axis (negative in reverse)
  throttle: number // -1…1, the throttle the car was given this step
  grounded: boolean // a wheel touches the ground
  touching: boolean // a wheel or the chassis does (a car on its roof touches but isn't grounded)
  airTime: number // s since the car last touched the ground
  fallSpeed: number // m/s towards the surface landed on, at the last landing (else downwards)
  landings: number // bumped on every landing, so readers can spot a new one
  landingImpact: number // 0–1 strength of the last landing
  landingKind: LandingKind // of the last landing
  landingSpeed: number // m/s into the surface at the last landing
  rollTurns: number // turns about the car's long axis since it left the ground (+ left side up)
  height: number // m from the hanging wheels down to the ground below (∞ over a void)
  verticalSpeed: number // m/s, positive up
  braking: boolean
  respawns: number // bumped on every R or fall, not on a race restart
  wheels: WheelTelemetry[]
}

export const createTelemetry = (): CarTelemetry => ({
  speed: 0,
  throttle: 0,
  grounded: false,
  touching: false,
  // The car starts in the air at spawn; see resetTelemetry.
  airTime: -Infinity,
  fallSpeed: 0,
  landings: 0,
  landingImpact: 0,
  landingKind: 'wheels',
  landingSpeed: 0,
  rollTurns: 0,
  height: 0,
  verticalSpeed: 0,
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
  t.rollTurns = 0
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
const carUp = new Vector3()
const chassisNormal = new Vector3()
// A contact closer than this (m) counts as touching; Rapier also reports predicted ones.
const CONTACT_DIST = 0.02
// Only a floor-like surface under the chassis counts as landing on it (not a wall hit in
// the air).
const FLOOR_NORMAL_Y = 0.5

// Whether the chassis rests on a floor-like surface; its normal (towards the car) goes into
// chassisNormal.
function chassisOnFloor({ world, collider }: ChassisContacts) {
  let found = false
  chassisNormal.set(0, 0, 0)
  world.contactPairsWith(collider, (other) => {
    world.contactPair(collider, other, (manifold, flipped) => {
      let close = false
      for (let i = 0; i < manifold.numContacts(); i++) {
        close ||= manifold.contactDist(i) < CONTACT_DIST
      }
      if (!close) return
      // The manifold normal points from its first collider to its second; flipped means the
      // car is the second.
      const n = manifold.normal()
      const sign = flipped ? 1 : -1
      if (n.y * sign < FLOOR_NORMAL_Y) return
      chassisNormal.x += n.x * sign
      chassisNormal.y += n.y * sign
      chassisNormal.z += n.z * sign
      found = true
    })
  })
  if (found) chassisNormal.normalize()
  return found
}

// Call after `updateVehicle`, which refreshes the wheel contacts, and after the abilities.
export function stepTelemetry(
  t: CarTelemetry,
  body: RapierRigidBody,
  vc: VehicleController,
  c: CarControls,
  dt: number,
  abilities: AbilityState,
  contacts: ChassisContacts,
) {
  const { landing, skid } = TUNING.vfx
  const { landing: rules, jets, wheels, suspension } = TUNING.car
  const r = body.rotation()
  quat.set(r.x, r.y, r.z, r.w)
  carUp.set(0, 1, 0).applyQuaternion(quat)

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

  const chassis = !grounded && chassisOnFloor(contacts)
  const touching = grounded || chassis
  const v = body.linvel()
  t.verticalSpeed = v.y
  t.height =
    abilities.groundDistance - (suspension.restLength + wheels.radius - wheels.positions[0][1])
  if (!touching) {
    if (t.touching) t.rollTurns = 0
    t.airTime += dt
    lastVel.set(v.x, v.y, v.z)
    t.fallSpeed = Math.max(0, -v.y)
    const w = body.angvel()
    forward.set(0, 0, 1).applyQuaternion(quat)
    t.rollTurns += ((w.x * forward.x + w.y * forward.y + w.z * forward.z) * dt) / (Math.PI * 2)
  } else {
    // A landing's impact is the speed into the surface it lands on (a wall, a ramp or the
    // floor), from the last step in the air.
    const surface = grounded ? normal.normalize() : chassisNormal
    if (!t.touching && t.airTime > 0) t.fallSpeed = Math.max(0, -lastVel.dot(surface))
    if (!t.touching && t.airTime > landing.minAirTime) {
      const bad = carUp.dot(surface) < rules.uprightDot || t.fallSpeed > rules.badImpact
      const kind = bad ? 'bad' : abilities.sinceLift < jets.cleanLiftWindow ? 'clean' : 'wheels'
      // Soft landings only count if they're clean or bad; a gentle plain one is nothing.
      if (t.fallSpeed > landing.minImpactSpeed || kind !== 'wheels') {
        t.landings++
        t.landingImpact = Math.min(t.fallSpeed / landing.fullImpactSpeed, 1)
        t.landingKind = kind
        t.landingSpeed = t.fallSpeed
      }
    }
    t.airTime = 0
  }
  t.grounded = grounded
  t.touching = touching

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
