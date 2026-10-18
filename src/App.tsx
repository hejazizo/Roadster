import { Canvas } from '@react-three/fiber'
import World from './scene/World'
import Hud from './ui/Hud'
import TuningPanel from './ui/TuningPanel'

export default function App() {
  return (
    <>
      <Canvas shadows="percentage" camera={{ position: [0, 12, 22], fov: 50 }}>
        <World />
      </Canvas>
      <Hud />
      <TuningPanel />
    </>
  )
}
