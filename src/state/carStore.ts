import { create } from 'zustand'
import type { Hold } from '../car/abilities'
import type { LandingKind } from '../car/telemetry'
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
  lifting: boolean
  airborne: boolean // neither wheels nor chassis on the ground
  height: number // m, wheels above the ground below
  verticalSpeed: number // m/s, positive up
  rollTurns: number // since leaving the ground, + left side up
  landings: number // bumped on every landing
  landingKind: LandingKind // of the last one
  hits: number // parked cars clipped since the page loaded
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
  lifting: false,
  airborne: false,
  height: 0,
  verticalSpeed: 0,
  rollTurns: 0,
  landings: 0,
  landingKind: 'wheels',
  hits: 0,
}))
