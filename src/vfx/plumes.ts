import { Color } from 'three'
import { TUNING } from '../config/tuning'

// How a plume looks. Colours above 1 are HDR, so the bloom picks them up.
export type PlumeStyle = {
  radius: number // m, the nozzle's
  length: () => number // m at full thrust (read from tuning when drawn)
  outerBase: Color
  outerTip: Color
  coreBase: Color
  coreTip: Color
  glow: Color
  glowSize: number // m across at full thrust
}

// The rear boost flame: an orange outer cone round a white-hot core, sized to the hero car's
// exhaust vents. The glow at the nozzle exit is what reads as the thruster from behind,
// where the chase cam sees the cones end-on and thin.
export const FLAME: PlumeStyle = {
  radius: 0.07,
  length: () => TUNING.vfx.flame.length,
  outerBase: new Color(3, 1.1, 0.25),
  outerTip: new Color(1.2, 0.15, 0.02),
  coreBase: new Color(4, 4, 5),
  coreTip: new Color(1.5, 1.3, 2.5),
  glow: new Color(3, 1.3, 0.45),
  glowSize: 0.6,
}

// Cold gas: a pale, faintly blue jet, mostly below the bloom threshold.
export const COLD_GAS: PlumeStyle = {
  radius: 0.05,
  length: () => TUNING.vfx.jets.length,
  outerBase: new Color(0.55, 0.62, 0.7),
  outerTip: new Color(0.25, 0.3, 0.38),
  coreBase: new Color(1.1, 1.2, 1.3),
  coreTip: new Color(0.5, 0.55, 0.65),
  glow: new Color(0.5, 0.55, 0.65),
  glowSize: 0.35,
}
