import type { Level } from './levelData'
import { PROVING_GROUND } from './provingGround'

// Levels in the game; the first is the default. The Test Track (testLevel.ts) is no longer
// played: it stays as the handling sim's test ground (scripts/sim-car.ts). With one level the
// main menu has no level picker; the description is the subtitle under the wordmark.
export const LEVELS: { level: Level; name: string; description: string }[] = [
  {
    level: PROVING_GROUND,
    name: 'Proving Ground',
    description: 'Night facility: half-loop, drop zone and the fleet',
  },
]
