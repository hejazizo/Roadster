import { useGLTF } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useMemo } from 'react'
import { type Mesh } from 'three'
import { fleetModelUrl } from '../config/assets'
import { FLEET_SHAPES, type FleetModel, type ParkedCar } from './fleetData'

function ParkedModel({ model, position, yaw }: Pick<ParkedCar, 'model' | 'position' | 'yaw'>) {
  const { scene } = useGLTF(fleetModelUrl(model))
  const object = useMemo(() => {
    const copy = scene.clone()
    copy.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return copy
  }, [scene])
  return <primitive object={object} position={position} rotation={[0, yaw, 0]} />
}

// The parked fleet: each car's model (scripts/build-fleet-models.ts) and its box colliders. They
// sit on their own fixed body tagged `fleet`, so the car's telemetry counts touching one as a hit.
export default function Fleet({ cars }: { cars: ParkedCar[] }) {
  if (cars.length === 0) return null
  return (
    <RigidBody type="fixed" colliders={false} userData={{ fleet: true }}>
      {cars.map((car, i) => (
        <group key={i}>
          <ParkedModel {...car} />
          {car.boxes.map(({ center, size: [sx, sy, sz] }, j) => (
            <CuboidCollider key={j} args={[sx / 2, sy / 2, sz / 2]} position={center} />
          ))}
        </group>
      ))}
    </RigidBody>
  )
}

for (const model of Object.keys(FLEET_SHAPES) as FleetModel[]) useGLTF.preload(fleetModelUrl(model))
