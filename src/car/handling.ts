import type { RapierRigidBody } from '@react-three/rapier'
import { MathUtils, Quaternion, Vector3 } from 'three'
import { TUNING } from '../config/tuning'
import type { VehicleController } from './abilities'
import type { CarControls } from './useCarControls'

const { wheels, suspension, tires, drift, engine, aero, weightTransfer, brake, steering, suction } =
  TUNING.car

export type Assist = (typeof TUNING.assists)['beginner']

const isFront = (i: number) => i < 2
const WHEELBASE = wheels.positions[0][2] - wheels.positions[2][2] // structural, read at load
// Below this speed at a tyre, slip angles are noise (parking, pulling away).
const MIN_SLIP_SPEED = 2
// Spin (rad/s) the yaw damping always allows beyond what the steering asks for.
const YAW_MARGIN = 0.15
// 1/s smoothing of the acceleration used for the lean.
const ACCEL_SMOOTHING = 10

export type DrivingState = {
  steer: number // rad, front wheel angle (positive turns left)
  drifting: boolean
  rearGrip: number // 0–1 multiplier on rear grip, lowered while drifting
  calmTime: number // s the drift has stayed below its exit angle
  rearSlip: number // rad, signed slip angle at the rear tyres (towards the car's left positive)
  velocity: Vector3 // m/s on the last step
  accel: Vector3 // m/s², car-local (x towards the left, z forward), smoothed
  groundTime: number // s on the ground since the last touchdown
}

export const createDrivingState = (): DrivingState => ({
  steer: 0,
  drifting: false,
  rearGrip: 1,
  calmTime: 0,
  rearSlip: 0,
  velocity: new Vector3(),
  accel: new Vector3(),
  groundTime: 0,
})

export function resetDriving(state: DrivingState) {
  Object.assign(state, createDrivingState())
}

// The acceleration used for the lean is capped, so a crash or a landing doesn't fling the body.
const MAX_LEAN_ACCEL = 15

// Frame-rate independent lerp factor for a damping rate.
const dampFactor = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt)

// Grip left at a slip angle: full up to the peak, fading to slideGrip past it.
const gripCurve = (slip: number) =>
  1 -
  (1 - tires.slideGrip) *
    MathUtils.smoothstep(Math.abs(slip), tires.peakSlipAngle, tires.slideSlipAngle)

const quat = new Quaternion()
const quatInv = new Quaternion()
const forward = new Vector3()
const up = new Vector3()
const left = new Vector3()
const heading = new Vector3()
const axle = new Vector3()
const pointVel = new Vector3()
const local = new Vector3()
const vec = new Vector3()
const along = new Vector3()
const slips = wheels.positions.map(() => 0)

// Engine, brakes, steering and tyre grip for one physics step, plus the drift state, assists
// and weight transfer. Call before `updateVehicle`; slip is measured at the contacts it found
// on the previous step. `holding`: the fans held the car on the last step, so once slow it
// parks on the brakes wherever it stops.
export function stepDriving(
  state: DrivingState,
  body: RapierRigidBody,
  vc: VehicleController,
  c: CarControls,
  dt: number,
  assist: Assist,
  holding: boolean,
) {
  const mass = body.mass()
  const r = body.rotation()
  quat.set(r.x, r.y, r.z, r.w)
  forward.set(0, 0, 1).applyQuaternion(quat)
  up.set(0, 1, 0).applyQuaternion(quat)
  left.set(1, 0, 0).applyQuaternion(quat)
  const speed = vc.currentVehicleSpeed()

  // Slip angle at each tyre in contact: the angle between where it points and where it moves.
  let grounded = false
  let allWheels = true
  let rearSlip = 0
  let rearCount = 0
  for (let i = 0; i < slips.length; i++) {
    slips[i] = 0
    const point = vc.wheelContactPoint(i)
    if (!vc.wheelIsInContact(i) || !point) {
      allWheels = false
      continue
    }
    grounded = true
    const s = vc.wheelSteering(i) ?? 0
    heading.set(Math.sin(s), 0, Math.cos(s)).applyQuaternion(quat)
    axle.set(Math.cos(s), 0, -Math.sin(s)).applyQuaternion(quat)
    const v = body.velocityAtPoint(point)
    pointVel.set(v.x, v.y, v.z)
    const rolling = pointVel.dot(heading)
    const across = pointVel.dot(axle)
    if (Math.hypot(rolling, across) > MIN_SLIP_SPEED) {
      slips[i] = Math.atan2(across, Math.abs(rolling))
    }
    if (!isFront(i)) {
      rearSlip += slips[i]
      rearCount++
    }
  }
  state.rearSlip = rearCount ? rearSlip / rearCount : 0
  state.groundTime = grounded ? state.groundTime + dt : 0
  const { bumpDelay } = suspension
  const bump = MathUtils.smoothstep(state.groundTime, bumpDelay, 2 * bumpDelay)
  const rearAngle = Math.abs(state.rearSlip)

  // Drift: starts on the handbrake or when the rear steps out under throttle, ends once the
  // car has run straight for a moment, or leaves the ground (so it never lands on loose rear
  // tyres).
  const fast = Math.abs(speed) > drift.minSpeed
  if (
    !state.drifting &&
    grounded &&
    fast &&
    (c.handbrake || (rearAngle > drift.entryAngle && c.throttle > 0))
  ) {
    state.drifting = true
    state.calmTime = 0
  } else if (state.drifting) {
    state.calmTime = !c.handbrake && rearAngle < drift.exitAngle ? state.calmTime + dt : 0
    if (state.calmTime >= drift.exitTime || Math.abs(speed) < drift.minSpeed / 2 || !grounded) {
      state.drifting = false
    }
  }
  const gripTarget = state.drifting
    ? drift.rearGrip - drift.throttleGrip * Math.max(0, c.throttle)
    : 1
  const recoverRate = (1 - drift.rearGrip) / drift.recoverTime
  state.rearGrip += MathUtils.clamp(
    gripTarget - state.rearGrip,
    -drift.gripDropRate * dt,
    recoverRate * dt,
  )

  // Steering: less lock at speed, except while drifting, where counter-steer needs it all.
  // While drifting the assist turns the front wheels towards the way the car is going.
  const limit = state.drifting
    ? steering.maxAngle
    : steering.maxAngle *
      MathUtils.lerp(
        1,
        steering.highSpeedFactor,
        MathUtils.clamp(Math.abs(speed) / steering.fullSpeed, 0, 1),
      )
  let steerTarget = -c.steer * limit
  if (state.drifting && speed > 0) {
    const v = body.linvel()
    // The travel direction in the car's frame, as a steering angle.
    local.set(v.x, v.y, v.z).applyQuaternion(quatInv.copy(quat).invert())
    const travel = Math.atan2(local.x, local.z)
    steerTarget = MathUtils.clamp(
      steerTarget + assist.counterSteer * travel,
      -steering.maxAngle,
      steering.maxAngle,
    )
  }
  const centring =
    Math.abs(steerTarget) < Math.abs(state.steer) ||
    Math.sign(steerTarget) !== Math.sign(state.steer)
  const maxDelta = (centring ? steering.returnSpeed : steering.speed) * dt
  state.steer += MathUtils.clamp(steerTarget - state.steer, -maxDelta, maxDelta)

  // Analog throttle: forces scale with how far the trigger (or key, fully) is pressed. The
  // engine fades out towards top speed; traction control eases off when the rear slides.
  const { stopSpeed } = TUNING.car
  const t = c.throttle
  let engineForce = 0
  let brakeForce = 0
  const parked = holding && t === 0 && Math.abs(speed) < suction.holdSpeed
  if (t > 0) {
    if (speed < -stopSpeed) brakeForce = brake.force * t
    else engineForce = engine.force * t * fade(speed, engine.maxSpeed)
  } else if (t < 0) {
    if (speed > stopSpeed) brakeForce = brake.force * -t
    else engineForce = engine.reverseForce * t * fade(-speed, engine.maxReverseSpeed)
  } else {
    brakeForce = parked ? Math.max(brake.idleBrake, suction.holdBrake) : brake.idleBrake
  }
  if (!state.drifting && !c.handbrake) {
    const sliding = MathUtils.smoothstep(rearAngle, tires.peakSlipAngle, tires.slideSlipAngle)
    engineForce *= 1 - assist.tractionControl * sliding
  }

  for (let i = 0; i < slips.length; i++) {
    const front = isFront(i)
    const grip = gripCurve(slips[i]) * (front ? 1 : tires.rearGrip * state.rearGrip)
    applyWheelTuning(vc, i, tires.frictionSlip * grip, bump)
    vc.setWheelSteering(i, front ? state.steer : 0)
    vc.setWheelEngineForce(i, front ? 0 : engineForce)
    vc.setWheelBrake(i, !front && c.handbrake ? brake.handbrakeForce : brakeForce)
  }

  // Acceleration in the car's frame, from the change in velocity since the last step.
  const lv = body.linvel()
  vec.set(lv.x, lv.y, lv.z)
  quatInv.copy(quat).invert()
  local.copy(vec).sub(state.velocity).divideScalar(dt).applyQuaternion(quatInv)
  local.clampLength(0, MAX_LEAN_ACCEL)
  state.accel.lerp(local, dampFactor(ACCEL_SMOOTHING, dt))
  state.velocity.copy(vec)
  if (!grounded) return

  let w = body.angvel()
  const yawRate = w.x * up.x + w.y * up.y + w.z * up.z
  const damp = (k: number) => {
    body.setAngvel({ x: w.x - up.x * k, y: w.y - up.y * k, z: w.z - up.z * k }, true)
    w = body.angvel()
  }

  // Drift hold: past the assist's drift angle, spin that would widen the slide (spin in the
  // same direction as the slide) is damped, harder the further past it is.
  const slide = slideAngle(body, quat)
  const past = Math.abs(slide) - assist.driftAngle
  if (state.drifting && past > 0 && yawRate * slide > 0) {
    damp(yawRate * dampFactor(assist.driftHold * past, dt))
  }

  // Yaw stability: damp spin beyond what the steering asks for (a fishtail, a snap back
  // after a turn), but leave drifts alone.
  if (!state.drifting && assist.yawDamping > 0) {
    const asked = (speed * Math.tan(state.steer)) / WHEELBASE
    const excess =
      yawRate -
      MathUtils.clamp(yawRate, Math.min(0, asked) - YAW_MARGIN, Math.max(0, asked) + YAW_MARGIN)
    if (excess !== 0) damp(excess * dampFactor(assist.yawDamping, dt))
  }

  // Weight transfer: lean out of turns (left side up when turning left) and dip the nose
  // under braking, as a higher centre of mass would. Only with all four wheels down, so it
  // can't help roll a car that's already up on two.
  if (allWheels) {
    const rollTorque = mass * state.accel.x * weightTransfer.roll * dt
    const pitchTorque = -mass * state.accel.z * weightTransfer.pitch * dt
    body.applyTorqueImpulse(
      vec.copy(forward).multiplyScalar(rollTorque).addScaledVector(left, pitchTorque),
      true,
    )
  }

  // Drift thrust: the rear wheels push along the heading while drifting on throttle, making
  // up for the speed the sideways slide scrubs off.
  if (state.drifting && c.throttle > 0 && speed > 0) {
    const push = drift.thrust * c.throttle * fade(speed, engine.maxSpeed) * mass * dt
    body.applyImpulse(vec.copy(forward).multiplyScalar(push), true)
  }

  // Aero: drag against the motion along the surface and downforce along the car's down
  // axis, so they work the same on a wall or ceiling.
  const v = body.linvel()
  vec.set(v.x, v.y, v.z)
  along.copy(vec).addScaledVector(up, -vec.dot(up))
  const surfaceSpeed = along.length()
  if (surfaceSpeed > 0) {
    const d = aero.drag * surfaceSpeed * mass * dt
    const down = aero.downforce * surfaceSpeed * surfaceSpeed * mass * dt
    body.applyImpulse(along.multiplyScalar(-d).addScaledVector(up, -down), true)
  }
}

// The car's slide: the signed angle from its travel direction to its heading, in the car's
// own plane (positive when the nose has swung left of the travel direction).
function slideAngle(body: RapierRigidBody, rotation: Quaternion) {
  const v = body.linvel()
  local.set(v.x, v.y, v.z).applyQuaternion(quatInv.copy(rotation).invert())
  if (Math.hypot(local.x, local.z) < MIN_SLIP_SPEED) return 0
  return -Math.atan2(local.x, local.z)
}

// Engine force left at a speed: full at rest, fading to none at top speed.
function fade(speed: number, top: number) {
  if (speed <= 0) return 1
  return Math.max(0, 1 - (speed / top) ** engine.taper)
}

// Applied every step so suspension and tire changes from the tuning panel take effect live.
// The bump stop: the spring stiffens over the last part of its travel (measured on the
// previous step), with its damping, so a hard load like the half-loop taken fast doesn't
// bottom out. It fades in over the moments after a touchdown (`bump` 0–1), so a landing
// isn't bounced back off it.
function applyWheelTuning(vc: VehicleController, i: number, frictionSlip: number, bump: number) {
  const { restLength, maxTravel, stiffness, bumpStart, bumpStiffness } = suspension
  const length = vc.wheelSuspensionLength(i) ?? restLength
  const compression = (restLength - length) / maxTravel
  const stiffen = 1 + (bumpStiffness - 1) * bump * MathUtils.smoothstep(compression, bumpStart, 1)
  vc.setWheelSuspensionRestLength(i, restLength)
  vc.setWheelMaxSuspensionTravel(i, maxTravel)
  vc.setWheelSuspensionStiffness(i, stiffness * stiffen)
  vc.setWheelSuspensionCompression(i, suspension.compression * stiffen)
  vc.setWheelSuspensionRelaxation(i, suspension.relaxation * stiffen)
  vc.setWheelMaxSuspensionForce(i, suspension.maxForce)
  vc.setWheelFrictionSlip(i, frictionSlip)
  vc.setWheelSideFrictionStiffness(i, tires.sideFrictionStiffness)
}
