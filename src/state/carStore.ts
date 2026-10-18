import { create } from 'zustand'
import type { Hold } from '../car/abilities'
import { TUNING } from '../config/tuning'

export type CarState = {
  speed: number // m/s, along the car's own plane (so it reads right on a wall)
  fuel: number
  grounded: boolean
  boosting: boolean
  gliding: boolean
  drifting: boolean
  fans: boolean
  suction: number // 0–1
  hold: Hold
}

// Read-only mirror of the car's state for the UI. The car owns the real state (in refs,
// stepped with physics) and copies it here once per rendered frame.
export const useCarStore = create<CarState>(() => ({
  speed: 0,
  fuel: TUNING.car.fuel.max,
  grounded: false,
  boosting: false,
  gliding: false,
  drifting: false,
  fans: false,
  suction: 0,
  hold: 'none',
}))
