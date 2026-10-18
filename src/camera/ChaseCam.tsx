import { useFrame } from '@react-three/fiber'
import { useRapier, type RapierRigidBody } from '@react-three/rapier'
import { useRef, type RefObject } from 'react'
import { MathUtils, Quaternion, Vector3, type Object3D } from 'three'
import type { Ray } from '../car/respawn'
import { TUNING } from '../config/tuning'

// Below this horizontal length the car points too far up/down to give a heading.
const MIN_FLAT_FORWARD = 0.2
// How far down (m) to look for the surface below the camera.
const GROUND_PROBE = 100

const carPos = new Vector3()
const carQuat = new Quaternion()
const forward = new Vector3()
const desiredPos = new Vector3()
const desiredLook = new Vector3()
const toCamera = new Vector3()

// Shortest signed angle from a to b, in [-π, π].
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

// Frame-rate independent lerp factor for a damping rate.
const dampFactor = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt)

type ChaseCamProps = {
  // The car's interpolated visual, so the camera moves as smoothly as the rendered car.
  target: RefObject<Object3D | null>
  body: RefObject<RapierRigidBody | null>
}

// Third-person camera behind and above the car. Follows the car's heading (not its
// velocity), so reversing keeps the camera behind the nose.
export default function ChaseCam({ target, body }: ChaseCamProps) {
  const { world, rapier } = useRapier()
  const ray = useRef<Ray | null>(null)
  const heading = useRef(0)
  const lookAt = useRef(new Vector3())
  const lastCarPos = useRef(new Vector3())
  const started = useRef(false)

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
      snapDistance,
    } = TUNING.camera.chase
    const car = target.current
    if (!car) return
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
    // camera never shows the inside of a wall.
    r.origin = { x: carPos.x, y: carPos.y + lookHeight, z: carPos.z }
    toCamera.copy(camera.position).sub(r.origin)
    const camDist = toCamera.length()
    if (camDist > 0) {
      r.dir = toCamera.divideScalar(camDist)
      const hit = world.castRay(r, camDist, true, solidOnly, undefined, undefined, carBody)
      if (hit) {
        const d = Math.max(hit.timeOfImpact - obstructionMargin, 0)
        camera.position.copy(r.origin).addScaledVector(toCamera, d)
      }
    }

    camera.lookAt(lookAt.current)
    started.current = true
  })

  return null
}
