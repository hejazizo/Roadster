import { Physics, type RapierRigidBody } from '@react-three/rapier'
import { Suspense, useRef } from 'react'
import type { Mesh } from 'three'
import CameraRig from '../camera/CameraRig'
import Car from '../car/Car'
import { TUNING } from '../config/tuning'
import Level from './Level'
import Lights from './Lights'
import { TEST_LEVEL } from './testLevel'

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
          <Level level={TEST_LEVEL} />
          <Car ref={carRef} visualRef={carVisualRef} />
          {/* Inside Physics so the chase cam can raycast against the level. */}
          <CameraRig target={carVisualRef} body={carRef} />
        </Physics>
      </Suspense>
    </>
  )
}
