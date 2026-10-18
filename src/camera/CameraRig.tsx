import { OrbitControls } from '@react-three/drei'
import type { RapierRigidBody } from '@react-three/rapier'
import { useEffect, useState, type RefObject } from 'react'
import { Vector3, type Object3D } from 'three'
import { onPress } from '../input/input'
import type { CarTelemetry } from '../car/telemetry'
import ChaseCam from './ChaseCam'

type CameraRigProps = {
  target: RefObject<Object3D | null>
  body: RefObject<RapierRigidBody | null>
  telemetry: RefObject<CarTelemetry>
}

// Chase cam by default; the camera action (C) toggles a free orbit debug cam centred where the car was.
export default function CameraRig({ target, body, telemetry }: CameraRigProps) {
  // Non-null while the orbit cam is active.
  const [orbitTarget, setOrbitTarget] = useState<Vector3 | null>(null)

  useEffect(
    () =>
      onPress((action) => {
        if (action !== 'camera') return
        const carPos = target.current?.getWorldPosition(new Vector3()) ?? new Vector3()
        setOrbitTarget((current) => (current ? null : carPos))
      }),
    [target],
  )

  if (orbitTarget) return <OrbitControls target={orbitTarget} />
  return <ChaseCam target={target} body={body} telemetry={telemetry} />
}
