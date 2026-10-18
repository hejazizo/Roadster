// All gameplay and physics values live here. Components import from this file
// instead of hard-coding numbers, so the game can be tuned in one place.
export const TUNING = {
  world: {
    gravity: [0, -9.81, 0] as [number, number, number],
  },
} as const
