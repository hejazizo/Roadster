import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { useRef, type RefObject } from 'react'
import { MathUtils, Quaternion, Vector3, type Object3D } from 'three'
import { TUNING } from '../config/tuning'

// Below this horizontal length the car points too far up/down to give a heading.
const MIN_FLAT_FORWARD = 0.2

const carPos = new Vector3()
const carQuat = new Quaternion()
const forward = new Vector3()
const desiredPos = new Vector3()
const desiredLook = new Vector3()

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

    camera.position.y = Math.max(camera.position.y, minHeight)
    camera.lookAt(lookAt.current)
    started.current = true
  })

  return null
}
