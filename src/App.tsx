import { Canvas } from '@react-three/fiber'
import World from './scene/World'

export default function App() {
  return (
    <Canvas shadows="percentage" camera={{ position: [8, 6, 12], fov: 50 }}>
      <World />
    </Canvas>
  )
}
