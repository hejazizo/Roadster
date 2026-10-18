import type { LevelArt } from '../artData'
import type { Level } from '../levelData'
import Floodlights from './Floodlights'
import Ground from './Ground'
import { SkyDome } from './NightSky'
import Perimeter from './Perimeter'
import Scenery from './Scenery'

// A level's night art (M16.6), drawn over its greybox colliders: the sky and haze, the ground,
// the dressed perimeter walls, the floodlight towers and the scenery out to the horizon. The
// moon light and the environment map are in Lights.tsx; the half-loop's look is in Level.tsx.
const NIGHT_FOG = '#0a0e15'
const FOG_DENSITY = 0.0017 // exponential-squared haze: ~60% clear at 400 m

export default function NightArt({ level, art }: { level: Level; art: LevelArt }) {
  return (
    <>
      <color attach="background" args={[NIGHT_FOG]} />
      <fogExp2 attach="fog" args={[NIGHT_FOG, FOG_DENSITY]} />
      <SkyDome art={art} />
      <Ground level={level} art={art} />
      <Perimeter walls={level.walls} />
      <Floodlights lights={art.floodlights} />
      <Scenery art={art} level={level} />
    </>
  )
}
