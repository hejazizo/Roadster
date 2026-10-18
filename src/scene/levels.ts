import type { Level } from './levelData'
import { PROVING_GROUND } from './provingGround'
import { TEST_LEVEL } from './testLevel'

// Levels on the main menu, in order; the first is the default.
export const LEVELS: { level: Level; name: string }[] = [
  { level: PROVING_GROUND, name: 'Proving Ground' },
  { level: TEST_LEVEL, name: 'Test Track' },
]
