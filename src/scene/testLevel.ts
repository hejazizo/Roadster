// Greybox test level: every mechanic from M1–M3 has a place to be exercised.
// World axes: −Z is "north" (the spawn heading), +X is east. Ground level is y = 0.
import { box, EAST, ground, type Level, NORTH, roundedRect, SOUTH, WEST } from './levelData'

export const TEST_LEVEL: Level = {
  id: 'test',
  surface: 'grass',
  spawn: { position: [0, 1.5, 0], yaw: NORTH },
  ground: [
    ground(-110, 110, -150, 70), // main island, spawn at the origin
    // North island across the void: the west arm is a 20 m jump away, the rest 80 m (glide).
    ground(-110, -10, -230, -170),
    ground(-110, 110, -300, -230),
  ],

  platforms: [
    // Tower (east): 2 m → 4 m → 7 m, then a raised 8 m gap to hop across.
    box(30, 50, -50, -30, 0, 2),
    box(30, 50, -86, -66, 0, 4),
    box(68, 88, -86, -66, 0, 7),
    box(68, 88, -114, -94, 0, 7),
  ],

  walls: [
    // Wall alley (west): a 3 m-tall corridor with a chicane.
    box(-76, -75, -110, -20, 0, 3),
    box(-65, -64, -110, -20, 0, 3),
    box(-75, -70, -51, -49, 0, 3),
    box(-70, -65, -76, -74, 0, 3),
    // Hop lane: low barriers, too thin to rest on.
    ...[-40, -60, -80, -100].map((z) => box(-50, -30, z - 0.25, z + 0.25, 0, 0.8)),
  ],

  ramps: [
    // Ramp field just ahead of spawn: small, medium and large kickers.
    { start: [-12, 0, -25], yaw: NORTH, run: 6, rise: 1, width: 6 },
    { start: [0, 0, -25], yaw: NORTH, run: 10, rise: 2, width: 6 },
    { start: [12, 0, -25], yaw: NORTH, run: 16, rise: 3.5, width: 8 },
    // Tower ramps.
    { start: [40, 0, -10], yaw: NORTH, run: 20, rise: 2, width: 8 },
    { start: [40, 2, -50], yaw: NORTH, run: 16, rise: 2, width: 8 },
    { start: [50, 4, -76], yaw: EAST, run: 18, rise: 3, width: 8 },
    // Jump gap kickers, offset so a landing car doesn't hit the other one's back.
    { start: [-80, 0, -141], yaw: NORTH, run: 8, rise: 1.2, width: 6 },
    { start: [-40, 0, -180], yaw: SOUTH, run: 8, rise: 1.2, width: 6 },
  ],

  loops: [],
  fleet: [],

  road: { points: roundedRect(0, -40, 95, 95, 25), width: 8 },

  rings: [
    { center: [12, 5, -57], yaw: NORTH, radius: 3.5 }, // off the big kicker
    { center: [40, 4, -40], yaw: NORTH, radius: 3 }, // up the tower
    { center: [78, 9, -90], yaw: NORTH, radius: 3 }, // hop the raised gap
    // Out over the void, above where a hop without gliding can reach (needs fuel left).
    { center: [78, 6.5, -190], yaw: NORTH, radius: 3.5 },
    { center: [20, 2.5, -250], yaw: WEST, radius: 3.5 }, // along the north island
    { center: [-40, 3, -160], yaw: SOUTH, radius: 3.5 }, // jump the 20 m gap back
    { center: [-70, 2, -62], yaw: SOUTH, radius: 3.5 }, // through the chicane
    { center: [0, 1, -8], yaw: NORTH, radius: 5 }, // start/finish arch, half buried
  ],
}
