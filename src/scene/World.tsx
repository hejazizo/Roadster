import { Physics, type RapierRigidBody } from '@react-three/rapier'
import { Suspense, useRef } from 'react'
import type { Group } from 'three'
import CameraRig from '../camera/CameraRig'
import Car from '../car/Car'
import { createTelemetry } from '../car/telemetry'
import { TUNING } from '../config/tuning'
import { useLevel } from '../state/levelStore'
import { useRaceStore } from '../state/raceStore'
import Effects from './Effects'
import Level from './Level'
import Lights from './Lights'
import Race from './Race'

const SKY_COLOR = '#87ceeb'

export default function World() {
  const carRef = useRef<RapierRigidBody>(null)
  const carVisualRef = useRef<Group>(null)
  const telemetry = useRef(createTelemetry())
  const paused = useRaceStore((s) => s.paused)
  const level = useLevel()

  return (
    <>
      <color attach="background" args={[SKY_COLOR]} />
      <Lights target={carVisualRef} />
      <Suspense fallback={null}>
        {/* Step physics before other frame callbacks so the camera reads this frame's car pose.
            Pausing skips whole steps, which freezes the car, the race clock and the rings. */}
        <Physics gravity={TUNING.world.gravity} updatePriority={-1} paused={paused}>
          {/* Keyed by level, so a level change rebuilds its colliders and rings from scratch. */}
          <Level key={`level-${level.id}`} level={level} />
          <Car ref={carRef} visualRef={carVisualRef} telemetry={telemetry} spawn={level.spawn} />
          <Race key={`race-${level.id}`} level={level} car={carRef} />
          {/* Inside Physics so the chase cam can raycast against the level. */}
          <CameraRig target={carVisualRef} body={carRef} telemetry={telemetry} />
        </Physics>
      </Suspense>
      <Effects />
    </>
  )
}
