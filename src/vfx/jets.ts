// The cold-gas jets' nozzles on the car model (`jet_*` nodes, docs/car-model-spec.md) and how
// hard each group fires, 0–1, smoothed in Car.tsx.
export type JetLevels = {
  lift: number // the underbody jets
  // The roll jets, low on each sill and blowing outwards, so each side's push rolls the car
  // towards that side: the right pair lifts the left side.
  left: number
  right: number
}

export const JET_PREFIX = 'jet_'

// Which level drives a nozzle, from its name: jet_under_*, jet_left_*, jet_right_*.
export function jetChannel(name: string): keyof JetLevels {
  if (name.startsWith(`${JET_PREFIX}left`)) return 'left'
  if (name.startsWith(`${JET_PREFIX}right`)) return 'right'
  return 'lift'
}
