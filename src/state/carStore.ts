import { create } from 'zustand'
import { TUNING } from '../config/tuning'

export type CarState = {
  speed: number // m/s, horizontal
  fuel: number
  grounded: boolean
  boosting: boolean
  gliding: boolean
}

// Read-only mirror of the car's state for the UI. The car owns the real state (in refs,
// stepped with physics) and copies it here once per rendered frame.
export const useCarStore = create<CarState>(() => ({
  speed: 0,
  fuel: TUNING.car.fuel.max,
  grounded: false,
  boosting: false,
  gliding: false,
}))
