import { Physics, type RapierRigidBody } from '@react-three/rapier'
import { Suspense, useRef } from 'react'
import LookAtCar from '../camera/LookAtCar'
import Car from '../car/Car'
import { TUNING } from '../config/tuning'
import Ground from './Ground'
import Lights from './Lights'

const SKY_COLOR = '#87ceeb'

export default function World() {
  const carRef = useRef<RapierRigidBody>(null)

  return (
    <>
      <color attach="background" args={[SKY_COLOR]} />
      <Lights />
      <Suspense fallback={null}>
        <Physics gravity={TUNING.world.gravity}>
          <Ground />
          <Car ref={carRef} />
        </Physics>
      </Suspense>
      <LookAtCar target={carRef} />
    </>
  )
}
