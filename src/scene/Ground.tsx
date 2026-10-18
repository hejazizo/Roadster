import { CuboidCollider, RigidBody } from '@react-three/rapier'

const SIZE = 200
const GRID_DIVISIONS = 100
const GRID_COLOR = '#55733d'

export default function Ground() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[SIZE / 2, 0.1, SIZE / 2]} position={[0, -0.1, 0]} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshStandardMaterial color="#6b8e4e" />
      </mesh>
      {/* Grid lines make motion visible on the flat plane. */}
      <gridHelper args={[SIZE, GRID_DIVISIONS, GRID_COLOR, GRID_COLOR]} position-y={0.01} />
    </RigidBody>
  )
}
