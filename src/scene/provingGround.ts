// Proving Ground greybox: the night test site of the reveal (M16). A walled asphalt pad with
// two separate stunt zones, each at the end of a long straight run-up heading north: the
// half-loop in the west and the parked fleet in the east.
// World axes: −Z is "north" (the spawn heading), +X is east. Ground level is y = 0.
import {
  box,
  EAST,
  ground,
  type Box,
  type Level,
  NORTH,
  roundedRect,
  SOUTH,
  type Vec3,
  WEST,
} from './levelData'

// Inside of the perimeter walls.
const PAD = { x0: -110, x1: 110, z0: -340, z1: 40 }
const WALL_HEIGHT = 6
const WALL_THICKNESS = 2

const wall = (x0: number, x1: number, z0: number, z1: number) => box(x0, x1, z0, z1, 0, WALL_HEIGHT)

// Parked fleet: nose to tail along the jump heading (north), in the order they're cleared.
const FLEET_X = 50
const FLEET_START = -175 // z of the first car's tail; ~215 m of run-up from the south wall
const FLEET_GAP = 1.5
// Length × width × height (m): sedan, crossover, pickup, robotaxi pod, semi tractor.
const PARKED: Vec3[] = [
  [4.7, 1.9, 1.45],
  [4.8, 1.9, 1.6],
  [5.7, 2.2, 1.8],
  [3.6, 1.9, 1.5],
  [7.0, 2.6, 4.0],
]

function parkedRow(): Box[] {
  let z = FLEET_START
  return PARKED.map(([length, width, height]) => {
    const car = box(FLEET_X - width / 2, FLEET_X + width / 2, z, z - length, 0, height)
    z -= length + FLEET_GAP
    return car
  })
}

export const PROVING_GROUND: Level = {
  id: 'proving',
  surface: 'asphalt',
  spawn: { position: [0, 1.5, 0], yaw: NORTH },
  // One slab, a little wider than the walls, so nothing ever overhangs the void.
  ground: [ground(PAD.x0 - 20, PAD.x1 + 20, PAD.z0 - 20, PAD.z1 + 20)],
  platforms: [],

  walls: [
    wall(PAD.x0 - WALL_THICKNESS, PAD.x1 + WALL_THICKNESS, PAD.z1, PAD.z1 + WALL_THICKNESS),
    wall(PAD.x0 - WALL_THICKNESS, PAD.x1 + WALL_THICKNESS, PAD.z0 - WALL_THICKNESS, PAD.z0),
    wall(PAD.x0 - WALL_THICKNESS, PAD.x0, PAD.z0, PAD.z1),
    wall(PAD.x1, PAD.x1 + WALL_THICKNESS, PAD.z0, PAD.z1),
  ],

  ramps: [],

  // The half-loop (west): ~210 m of straight run-up from the south wall. The lip overhangs
  // the entry by ~7 m, and the lane stays clear well to either side as the landing apron.
  loops: [
    {
      start: [-50, 0, -170],
      yaw: NORTH,
      height: 20,
      entry: 12,
      endAngle: (175 * Math.PI) / 180,
      width: 5,
      lip: 0.5,
      thickness: 1,
    },
  ],

  // The fleet (east): ~31.8 m long, the semi last and tallest; ~130 m of open asphalt after it.
  fleet: parkedRow(),

  road: { points: roundedRect(0, -135, 70, 120, 30), width: 8 },

  // Around the zones, not through them: rings inside the loop and over the fleet come once
  // the car can reach them (M16.2–M16.4).
  rings: [
    { center: [-50, 2.5, -100], yaw: NORTH, radius: 3.5 }, // up the half-loop run-up
    { center: [-70, 2.5, -178], yaw: NORTH, radius: 3.5 }, // past the foot of the loop
    // Across the north end, far enough east that the line to the next ring clears the semi.
    { center: [20, 2.5, -265], yaw: EAST, radius: 3.5 },
    { center: [72, 2.5, -190], yaw: SOUTH, radius: 3.5 }, // alongside the fleet
    { center: [50, 2.5, -100], yaw: SOUTH, radius: 3.5 }, // back down the fleet run-up
    { center: [20, 1, -15], yaw: WEST, radius: 5 }, // start/finish arch, half buried
  ],
}
