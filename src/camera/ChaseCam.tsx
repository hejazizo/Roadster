import { useFrame, useThree } from '@react-three/fiber'
import { useRapier, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useRef, type RefObject } from 'react'
import { MathUtils, PerspectiveCamera, Quaternion, Vector3, type Object3D } from 'three'
import type { Ray } from '../car/respawn'
import type { CarTelemetry } from '../car/telemetry'
import { TUNING } from '../config/tuning'
import { useCarStore } from '../state/carStore'
import { useRaceStore } from '../state/raceStore'

// Below this length, the car's forward across the camera's up is too short to give a heading.
const MIN_FLAT_FORWARD = 0.2
// Turning the camera's up further than this (rad) takes it round the view direction (a roll),
// not over the top, so leaving a ceiling never swings the camera through the car.
const ROLL_ANGLE = 2.6
// How far down (m) to look for the surface below the camera.
const GROUND_PROBE = 100
// m short of a clear view at which the eased wall release lets go.
const REACH_SLACK = 0.05

const WORLD_UP = new Vector3(0, 1, 0)
const carPos = new Vector3()
const carQuat = new Quaternion()
const forward = new Vector3()
const carUp = new Vector3()
const targetUp = new Vector3()
const axis = new Vector3()
const desiredPos = new Vector3()
const desiredLook = new Vector3()
const toCamera = new Vector3()
const shakeLook = new Vector3()

// Frame-rate independent lerp factor for a damping rate.
const dampFactor = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt)

// Smooth noise in about −1…1; each seed gives an unrelated wave.
const noise = (t: number, seed: number) =>
  Math.sin(t * 23 + seed * 7.1) * 0.6 + Math.sin(t * 41 + seed * 3.3) * 0.4

type ChaseCamProps = {
  // The car's interpolated visual, so the camera moves as smoothly as the rendered car.
  target: RefObject<Object3D | null>
  body: RefObject<RapierRigidBody | null>
  telemetry: RefObject<CarTelemetry>
}

// Third-person camera behind and above the car. Follows the car's heading (not its
// velocity), so reversing keeps the camera behind the nose. "Above" is world up, except
// while the car drives on a steep surface (a wall, the half-loop), where the camera's up
// turns smoothly to the car's. Widens its view while boosting and shakes on landings.
export default function ChaseCam({ target, body, telemetry }: ChaseCamProps) {
  const { world, rapier } = useRapier()
  const get = useThree((s) => s.get)
  const ray = useRef<Ray | null>(null)
  // Unit vectors: the camera's up, and the heading it looks along (across that up).
  const camUp = useRef(new Vector3(0, 1, 0))
  const heading = useRef(new Vector3(0, 0, 1))
  const lookAt = useRef(new Vector3())
  const lastCarPos = useRef(new Vector3())
  const started = useRef(false)
  // Camera position before the shake offset, which is the state the follow lerps from.
  const steadyPos = useRef(new Vector3())
  // How far from the car's look point the camera may be: cut short at once by a wall, eased
  // back out after it, so a wall passing between doesn't make the camera pop in and out.
  const reach = useRef(Infinity)
  const shake = useRef({
    trauma: 0,
    time: 0,
    landings: telemetry.current.landings,
    hits: telemetry.current.hits,
  })

  // Leave the debug orbit cam with world up and the normal field of view.
  useEffect(
    () => () => {
      const { camera } = get()
      camera.up.set(0, 1, 0)
      if (!(camera instanceof PerspectiveCamera)) return
      camera.fov = TUNING.camera.chase.fov
      camera.updateProjectionMatrix()
    },
    [get],
  )

  useFrame(({ camera }, dt) => {
    // Read per frame so live tuning applies.
    const {
      distance,
      height,
      lookHeight,
      lookAhead,
      speedDistance,
      maxExtraDistance,
      positionDamping,
      headingDamping,
      lookDamping,
      minHeight,
      obstructionMargin,
      obstructionRelease,
      snapDistance,
      fov,
      boostFov,
      fovDamping,
      landingShake,
      boostShake,
      shakeDecay,
      shakeOffset,
      badLandingShake,
      hitShake,
      surfaceAngleStart,
      surfaceAngleFull,
      upDamping,
      upMaxRate,
    } = TUNING.camera.chase
    const car = target.current
    if (!car) return
    if (started.current) camera.position.copy(steadyPos.current)
    car.getWorldPosition(carPos)
    car.getWorldQuaternion(carQuat)

    const teleported = started.current && lastCarPos.current.distanceTo(carPos) > snapDistance
    lastCarPos.current.copy(carPos)

    const snap = !started.current || teleported
    const up = camUp.current
    const h = heading.current

    // The up to follow: the car's while it's on a steep surface, world up otherwise (on the
    // floor, gentle ramps and in the air), blended in between.
    carUp.set(0, 1, 0).applyQuaternion(carQuat)
    const tilt = carUp.angleTo(WORLD_UP)
    const follow = telemetry.current.grounded
      ? MathUtils.smoothstep(tilt, surfaceAngleStart, surfaceAngleFull)
      : 0
    targetUp.copy(WORLD_UP)
    if (follow > 0 && tilt > 1e-4) {
      axis.crossVectors(WORLD_UP, carUp)
      // Upside down there's no single way round; go the way the car pitched over.
      if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0).applyQuaternion(carQuat)
      targetUp.applyAxisAngle(axis.normalize(), tilt * follow)
    }
    // Turn towards it, damped and never faster than upMaxRate.
    const upAngle = up.angleTo(targetUp)
    if (upAngle > 1e-5) {
      const turn = snap ? upAngle : Math.min(upAngle * dampFactor(upDamping, dt), upMaxRate * dt)
      axis.crossVectors(up, targetUp)
      if (upAngle > ROLL_ANGLE || axis.lengthSq() < 1e-8) axis.copy(h)
      up.applyAxisAngle(axis.normalize(), turn).normalize()
    }

    // Heading: the car's forward laid across the camera's up, followed with damping.
    forward.set(0, 0, 1).applyQuaternion(carQuat)
    forward.addScaledVector(up, -forward.dot(up))
    h.addScaledVector(up, -h.dot(up))
    if (h.lengthSq() < 1e-8) h.copy(forward)
    h.normalize()
    if (forward.length() > MIN_FLAT_FORWARD) {
      forward.normalize()
      if (snap) h.copy(forward)
      else {
        const angle = Math.atan2(axis.crossVectors(h, forward).dot(up), h.dot(forward))
        h.applyAxisAngle(up, angle * dampFactor(headingDamping, dt)).normalize()
      }
    }

    const v = body.current?.linvel()
    const speed = v ? Math.hypot(v.x, v.y, v.z) : 0
    const dist = distance + Math.min(speed * speedDistance, maxExtraDistance)

    desiredPos.copy(carPos).addScaledVector(h, -dist).addScaledVector(up, height)
    desiredLook.copy(carPos).addScaledVector(h, lookAhead).addScaledVector(up, lookHeight)

    // On mount the camera glides in from wherever it was; a teleport snaps it.
    if (teleported) camera.position.copy(desiredPos)
    else camera.position.lerp(desiredPos, dampFactor(positionDamping, dt))
    if (!started.current || teleported) lookAt.current.copy(desiredLook)
    else lookAt.current.lerp(desiredLook, dampFactor(lookDamping, dt))

    // Raycasts ignore the car itself and sensors (rings).
    ray.current ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
    const r = ray.current
    const carBody = body.current ?? undefined
    const solidOnly = rapier.QueryFilterFlags.EXCLUDE_SENSORS

    // Stay above the surface below the camera (along its up), cast from above the car's
    // height so overhangs above the camera don't count.
    const camHeight = toCamera.copy(camera.position).sub(carPos).dot(up)
    const top = height + 1
    const origin = toCamera.copy(camera.position).addScaledVector(up, top - camHeight)
    r.origin = { x: origin.x, y: origin.y, z: origin.z }
    r.dir = { x: -up.x, y: -up.y, z: -up.z }
    const ground = world.castRay(r, GROUND_PROBE, true, solidOnly, undefined, undefined, carBody)
    if (ground) {
      const lift = top - ground.timeOfImpact + minHeight - camHeight
      if (lift > 0) camera.position.addScaledVector(up, lift)
    }

    // Pull in in front of anything between the car and the camera. Not damped, so the
    // camera never shows the inside of a wall; moving back out is.
    toCamera.copy(carPos).addScaledVector(up, lookHeight)
    r.origin = { x: toCamera.x, y: toCamera.y, z: toCamera.z }
    toCamera.copy(camera.position).sub(r.origin)
    const camDist = toCamera.length()
    if (camDist > 0) {
      r.dir = toCamera.divideScalar(camDist)
      const hit = world.castRay(r, camDist, true, solidOnly, undefined, undefined, carBody)
      const clear = hit ? Math.max(hit.timeOfImpact - obstructionMargin, 0) : camDist
      reach.current =
        clear < reach.current || teleported || !started.current
          ? clear
          : MathUtils.damp(reach.current, clear, obstructionRelease, dt)
      // Caught up with a clear view: stop limiting the follow.
      if (!hit && reach.current > camDist - REACH_SLACK) reach.current = Infinity
      if (reach.current < camDist) {
        camera.position.copy(r.origin).addScaledVector(toCamera, reach.current)
      }
    }

    // Shake: landings and hits add trauma, boosting holds a little, and it decays over time. The
    // offset is applied on top of the steady position, which the next frame starts from.
    steadyPos.current.copy(camera.position)
    const s = shake.current
    const t = telemetry.current
    const { boosting } = useCarStore.getState()
    if (t.landings !== s.landings) {
      s.trauma += t.landingImpact * landingShake + (t.landingKind === 'bad' ? badLandingShake : 0)
    }
    if (t.hits !== s.hits) s.trauma += (0.3 + 0.7 * t.hitImpact) * hitShake
    s.landings = t.landings
    s.hits = t.hits
    const paused = useRaceStore.getState().paused
    if (!paused) {
      s.time += dt
      s.trauma = Math.max(s.trauma - shakeDecay * dt, boosting ? boostShake : 0)
    }
    if (teleported) s.trauma = 0
    s.trauma = Math.min(s.trauma, 1)
    const amount = s.trauma * s.trauma * shakeOffset
    camera.position.x += noise(s.time, 0) * amount
    camera.position.y += noise(s.time, 1) * amount
    camera.position.z += noise(s.time, 2) * amount
    shakeLook.set(noise(s.time, 3), noise(s.time, 4), noise(s.time, 5))
    camera.up.copy(up)
    camera.lookAt(shakeLook.multiplyScalar(amount * 0.5).add(lookAt.current))

    if (camera instanceof PerspectiveCamera && !paused) {
      const targetFov = fov + (boosting ? boostFov : 0)
      const next = started.current
        ? MathUtils.damp(camera.fov, targetFov, fovDamping, dt)
        : targetFov
      if (Math.abs(next - camera.fov) > 1e-3) {
        camera.fov = next
        camera.updateProjectionMatrix()
      }
    }
    started.current = true
  })

  return null
}
