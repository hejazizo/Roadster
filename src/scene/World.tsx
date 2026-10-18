import { Physics, type RapierRigidBody } from '@react-three/rapier'
import { Suspense, useRef } from 'react'
import type { Mesh } from 'three'
import CameraRig from '../camera/CameraRig'
import Car from '../car/Car'
import { TUNING } from '../config/tuning'
import { useRaceStore } from '../state/raceStore'
import Level from './Level'
import Lights from './Lights'
import Race from './Race'
import { TEST_LEVEL } from './testLevel'

const SKY_COLOR = '#87ceeb'

export default function World() {
  const carRef = useRef<RapierRigidBody>(null)
  const carVisualRef = useRef<Mesh>(null)
  const paused = useRaceStore((s) => s.paused)

  return (
    <>
      <color attach="background" args={[SKY_COLOR]} />
      <Lights target={carVisualRef} />
      <Suspense fallback={null}>
        {/* Step physics before other frame callbacks so the camera reads this frame's car pose.
            Pausing skips whole steps, which freezes the car, the race clock and the rings. */}
        <Physics gravity={TUNING.world.gravity} updatePriority={-1} paused={paused}>
          <Level level={TEST_LEVEL} />
          <Car ref={carRef} visualRef={carVisualRef} />
          <Race level={TEST_LEVEL} car={carRef} />
          {/* Inside Physics so the chase cam can raycast against the level. */}
          <CameraRig target={carVisualRef} body={carRef} />
        </Physics>
      </Suspense>
    </>
  )
}
