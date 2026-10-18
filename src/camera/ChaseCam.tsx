import { useFrame, useThree } from '@react-three/fiber'
import { useRapier, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useRef, type RefObject } from 'react'
import { MathUtils, PerspectiveCamera, Quaternion, Vector3, type Object3D } from 'three'
import type { Ray } from '../car/respawn'
import type { CarTelemetry } from '../car/telemetry'
import { TUNING } from '../config/tuning'
import { useCarStore } from '../state/carStore'
import { useRaceStore } from '../state/raceStore'

// Below this horizontal length the car points too far up/down to give a heading.
const MIN_FLAT_FORWARD = 0.2
// How far down (m) to look for the surface below the camera.
const GROUND_PROBE = 100
// m short of a clear view at which the eased wall release lets go.
const REACH_SLACK = 0.05

const carPos = new Vector3()
const carQuat = new Quaternion()
const forward = new Vector3()
const desiredPos = new Vector3()
const desiredLook = new Vector3()
const toCamera = new Vector3()
const shakeLook = new Vector3()

// Shortest signed angle from a to b, in [-π, π].
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

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
// velocity), so reversing keeps the camera behind the nose. Widens its view while
// boosting and shakes on landings.
export default function ChaseCam({ target, body, telemetry }: ChaseCamProps) {
  const { world, rapier } = useRapier()
  const get = useThree((s) => s.get)
  const ray = useRef<Ray | null>(null)
  const heading = useRef(0)
  const lookAt = useRef(new Vector3())
  const lastCarPos = useRef(new Vector3())
  const started = useRef(false)
  // Camera position before the shake offset, which is the state the follow lerps from.
  const steadyPos = useRef(new Vector3())
  // How far from the car's look point the camera may be: cut short at once by a wall, eased
  // back out after it, so a wall passing between doesn't make the camera pop in and out.
  const reach = useRef(Infinity)
  const shake = useRef({ trauma: 0, time: 0, landings: telemetry.current.landings })

  // Leave the debug orbit cam with the normal field of view.
  useEffect(
    () => () => {
      const { camera } = get()
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
    } = TUNING.camera.chase
    const car = target.current
    if (!car) return
    if (started.current) camera.position.copy(steadyPos.current)
    car.getWorldPosition(carPos)
    car.getWorldQuaternion(carQuat)

    const teleported = started.current && lastCarPos.current.distanceTo(carPos) > snapDistance
    lastCarPos.current.copy(carPos)

    forward.set(0, 0, 1).applyQuaternion(carQuat).setY(0)
    if (forward.length() > MIN_FLAT_FORWARD) {
      const yaw = Math.atan2(forward.x, forward.z)
      heading.current =
        started.current && !teleported
          ? MathUtils.damp(
              heading.current,
              heading.current + angleDelta(heading.current, yaw),
              headingDamping,
              dt,
            )
          : yaw
    }
    const hx = Math.sin(heading.current)
    const hz = Math.cos(heading.current)

    const v = body.current?.linvel()
    const speed = v ? Math.hypot(v.x, v.y, v.z) : 0
    const dist = distance + Math.min(speed * speedDistance, maxExtraDistance)

    desiredPos.set(carPos.x - hx * dist, carPos.y + height, carPos.z - hz * dist)
    desiredLook.set(carPos.x + hx * lookAhead, carPos.y + lookHeight, carPos.z + hz * lookAhead)

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

    // Stay above the surface below the camera, cast from above the car's height so
    // overhangs above the camera don't count.
    const top = carPos.y + height + 1
    r.origin = { x: camera.position.x, y: top, z: camera.position.z }
    r.dir = { x: 0, y: -1, z: 0 }
    const ground = world.castRay(r, GROUND_PROBE, true, solidOnly, undefined, undefined, carBody)
    if (ground) {
      camera.position.y = Math.max(camera.position.y, top - ground.timeOfImpact + minHeight)
    }

    // Pull in in front of anything between the car and the camera. Not damped, so the
    // camera never shows the inside of a wall; moving back out is.
    r.origin = { x: carPos.x, y: carPos.y + lookHeight, z: carPos.z }
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

    // Shake: landings add trauma, boosting holds a little, and it decays over time. The
    // offset is applied on top of the steady position, which the next frame starts from.
    steadyPos.current.copy(camera.position)
    const s = shake.current
    const t = telemetry.current
    const { boosting } = useCarStore.getState()
    if (t.landings !== s.landings) s.trauma += t.landingImpact * landingShake
    s.landings = t.landings
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
