import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { MathUtils, PerspectiveCamera } from 'three'
import { TUNING } from '../config/tuning'
import { useRaceStore } from '../state/raceStore'

// On the main menu the picture slides up the screen (a view offset, the camera itself
// doesn't move), so the car shows above the menu's bottom bar; it eases back when a run
// starts.

const MAX_SHIFT = 0.4 // of the screen height

export default function MenuFraming() {
  const get = useThree((s) => s.get)
  const shift = useRef<number | null>(null)

  useEffect(
    () => () => {
      const { camera } = get()
      if (camera instanceof PerspectiveCamera) camera.clearViewOffset()
    },
    [get],
  )

  useFrame(({ camera, size }, dt) => {
    if (!(camera instanceof PerspectiveCamera)) return
    const { menuShift, menuShiftDamping } = TUNING.camera
    const target =
      useRaceStore.getState().phase === 'menu' ? Math.min(menuShift / size.height, MAX_SHIFT) : 0
    shift.current =
      shift.current === null ? target : MathUtils.damp(shift.current, target, menuShiftDamping, dt)
    if (shift.current > 1e-4) {
      const { width, height } = size
      camera.setViewOffset(width, height, 0, shift.current * height, width, height)
    } else if (camera.view?.enabled) {
      camera.clearViewOffset()
    }
  })

  return null
}
