import { useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense, useEffect } from 'react'
import { TUNING } from '../config/tuning'
import FallingCube from './FallingCube'
import Ground from './Ground'
import Lights from './Lights'

const SKY_COLOR = '#87ceeb'

export default function World() {
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    camera.lookAt(0, 1, 0)
  }, [camera])

  return (
    <>
      <color attach="background" args={[SKY_COLOR]} />
      <Lights />
      <Suspense fallback={null}>
        <Physics gravity={TUNING.world.gravity}>
          <Ground />
          <FallingCube />
        </Physics>
      </Suspense>
    </>
  )
}
