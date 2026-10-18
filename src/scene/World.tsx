import { Physics, type RapierRigidBody } from '@react-three/rapier'
import { Suspense, useRef } from 'react'
import type { Mesh } from 'three'
import CameraRig from '../camera/CameraRig'
import Car from '../car/Car'
import { TUNING } from '../config/tuning'
import Ground from './Ground'
import Lights from './Lights'

const SKY_COLOR = '#87ceeb'

export default function World() {
  const carRef = useRef<RapierRigidBody>(null)
  const carVisualRef = useRef<Mesh>(null)

  return (
    <>
      <color attach="background" args={[SKY_COLOR]} />
      <Lights target={carVisualRef} />
      <Suspense fallback={null}>
        {/* Step physics before other frame callbacks so the camera reads this frame's car pose. */}
        <Physics gravity={TUNING.world.gravity} updatePriority={-1}>
          <Ground />
          <Car ref={carRef} visualRef={carVisualRef} />
        </Physics>
      </Suspense>
      <CameraRig target={carVisualRef} body={carRef} />
    </>
  )
}
