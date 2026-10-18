import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import { Vector3, type DirectionalLight, type Object3D } from 'three'

// Sun position relative to the car; the light (and its shadow box) follows the car.
const SUN_OFFSET = new Vector3(10, 15, 8)

type LightsProps = {
  target: RefObject<Object3D | null>
}

export default function Lights({ target }: LightsProps) {
  const sun = useRef<DirectionalLight>(null)

  useFrame(() => {
    const light = sun.current
    const car = target.current
    if (!light || !car) return
    car.getWorldPosition(light.target.position)
    light.position.copy(light.target.position).add(SUN_OFFSET)
    // The target isn't in the scene graph, so its matrix isn't updated automatically.
    light.target.updateMatrixWorld()
  })

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        ref={sun}
        position={SUN_OFFSET}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
    </>
  )
}
