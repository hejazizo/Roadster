import { CuboidCollider, RigidBody } from '@react-three/rapier'

const SIZE = 200

export default function Ground() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[SIZE / 2, 0.1, SIZE / 2]} position={[0, -0.1, 0]} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshStandardMaterial color="#6b8e4e" />
      </mesh>
    </RigidBody>
  )
}
