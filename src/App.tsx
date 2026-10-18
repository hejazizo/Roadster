import { Canvas } from '@react-three/fiber'
import { useInputDevices } from './input/input'
import World from './scene/World'
import Hud from './ui/Hud'
import Menus from './ui/Menus'
import TuningPanel from './ui/TuningPanel'

export default function App() {
  useInputDevices()
  return (
    <>
      <Canvas shadows="percentage" camera={{ position: [0, 12, 22], fov: 50 }}>
        <World />
      </Canvas>
      <Hud />
      <Menus />
      <TuningPanel />
    </>
  )
}
