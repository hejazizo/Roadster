import { RigidBody } from '@react-three/rapier'

// Temporary physics smoke test; replaced by the car in M1.
export default function FallingCube() {
  return (
    <RigidBody colliders="cuboid" position={[0, 8, 0]} rotation={[0.4, 0.2, 0.3]}>
      <mesh castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#e63946" />
      </mesh>
    </RigidBody>
  )
}
