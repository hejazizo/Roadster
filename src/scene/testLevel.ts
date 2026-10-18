// Greybox test level: every mechanic from M1–M3 has a place to be exercised.
// World axes: −Z is "north" (the spawn heading), +X is east. Ground level is y = 0.
// Level layout is data, not tuning, so it lives here rather than in tuning.ts.
type Vec3 = [number, number, number]

export type Box = { center: Vec3; size: Vec3 }

// A wedge that rises `rise` over `run` along `yaw` (0 = +Z, π = −Z), starting at `start`
// (the centre of its low edge). Its solid part reaches down to the ground.
export type Ramp = { start: Vec3; yaw: number; run: number; rise: number; width: number }

// Wedge corners in ramp-local space: +Z along the run, low edge at the origin, bottom on
// the ground (y = -start.y).
export function rampVertices({ start, run, rise, width }: Ramp): Vec3[] {
  const floor = -start[1]
  return [width / 2, -width / 2].flatMap((x): Vec3[] => [
    [x, 0, 0],
    [x, rise, run],
    [x, floor, run],
    ...(floor < 0 ? [[x, floor, 0] as Vec3] : []),
  ])
}

// A checkpoint ring standing upright at `center`, its hole facing along `yaw`.
export type Ring = { center: Vec3; yaw: number; radius: number }

export type Level = {
  id: string // stable key for saved best times
  ground: Box[] // walkable island slabs, top at y = 0; the void around them is out of bounds
  platforms: Box[]
  walls: Box[]
  ramps: Ramp[]
  road: { points: [number, number][]; width: number } // closed circuit, visual only
  rings: Ring[] // time-trial checkpoints in order; the last one is the start/finish arch
}

const NORTH = Math.PI
const SOUTH = 0
const EAST = Math.PI / 2
const WEST = -Math.PI / 2

// Axis-aligned box from its extents.
const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): Box => ({
  center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  size: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
})

const GROUND_DEPTH = 4
const ground = (x0: number, x1: number, z0: number, z1: number) =>
  box(x0, x1, z0, z1, -GROUND_DEPTH, 0)

// Closed rounded rectangle on the XZ plane, as a list of points.
function roundedRect(
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
  radius: number,
  cornerSegments = 8,
): [number, number][] {
  const corners: [number, number, number][] = [
    [cx + halfX - radius, cz + halfZ - radius, 0],
    [cx - halfX + radius, cz + halfZ - radius, Math.PI / 2],
    [cx - halfX + radius, cz - halfZ + radius, Math.PI],
    [cx + halfX - radius, cz - halfZ + radius, (3 * Math.PI) / 2],
  ]
  return corners.flatMap(([x, z, start]) =>
    Array.from({ length: cornerSegments + 1 }, (_, i): [number, number] => {
      const a = start + (i / cornerSegments) * (Math.PI / 2)
      return [x + Math.cos(a) * radius, z + Math.sin(a) * radius]
    }),
  )
}

export const TEST_LEVEL: Level = {
  id: 'test',
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
