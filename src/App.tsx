import { Canvas } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useState } from 'react'
import { onPress, useInputDevices } from './input/input'
import World from './scene/World'
import Hud from './ui/Hud'
import Menus from './ui/Menus'

// leva is only downloaded the first time the tuning action (Backquote `) opens the panel.
const TuningPanel = lazy(() => import('./ui/TuningPanel'))

// null until the panel has been opened once, then whether it's shown.
function useTuningToggle() {
  const [open, setOpen] = useState<boolean | null>(null)
  useEffect(
    () =>
      onPress((action) => {
        if (action === 'tuning') setOpen((current) => !current)
      }),
    [],
  )
  return open
}

export default function App() {
  useInputDevices()
  const tuningOpen = useTuningToggle()
  return (
    <>
      <Canvas shadows="percentage" camera={{ position: [0, 12, 22], fov: 50 }}>
        <World />
      </Canvas>
      <Hud />
      <Menus />
      {tuningOpen !== null && (
        <Suspense fallback={null}>
          <TuningPanel open={tuningOpen} />
        </Suspense>
      )}
    </>
  )
}
