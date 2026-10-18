import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import type { RefObject } from 'react'

type LookAtCarProps = {
  target: RefObject<RapierRigidBody | null>
}

// Fixed camera that turns to keep the car in view. Replaced by the chase cam in M2.
export default function LookAtCar({ target }: LookAtCarProps) {
  useFrame(({ camera }) => {
    const body = target.current
    if (!body) return
    const { x, y, z } = body.translation()
    camera.lookAt(x, y, z)
  })
  return null
}
