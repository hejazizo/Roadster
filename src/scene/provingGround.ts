// Proving Ground greybox: the night test site of the reveal (M16). A walled asphalt pad with
// two separate stunt zones, each at the end of a long straight run-up heading north: the
// half-loop in the west and the parked fleet in the east.
// World axes: −Z is "north" (the spawn heading), +X is east. Ground level is y = 0.
import { FLEET_SHAPES, type FleetModel, parkCar, type ParkedCar } from './fleetData'
import { box, EAST, ground, type Level, NORTH, roundedRect, SOUTH, WEST } from './levelData'

// Inside of the perimeter walls.
const PAD = { x0: -110, x1: 110, z0: -340, z1: 40 }
const WALL_HEIGHT = 6
const WALL_THICKNESS = 2

const wall = (x0: number, x1: number, z0: number, z1: number) => box(x0, x1, z0, z1, 0, WALL_HEIGHT)

// Parked fleet: nose to tail along the jump heading (north), in the order they're cleared.
const FLEET_X = 50
const FLEET_START = -175 // z of the first car's tail; ~215 m of run-up from the south wall
const FLEET_GAP = 1.5
const PARKED: FleetModel[] = ['sedan', 'crossover', 'pickup', 'pod', 'semi']

function parkedRow(): ParkedCar[] {
  let z = FLEET_START
  return PARKED.map((model) => {
    const length = FLEET_SHAPES[model].size[2]
    const car = parkCar(model, [FLEET_X, 0, z - length / 2], NORTH)
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

  // Through both stunts: up the half-loop and through a gate under its inverted top, then the
  // drop; along the south end and up the fleet run-up, through a ring above the parked row
  // (a lift-off + roll); back along the north end and down the west road to the arch.
  rings: [
    { center: [-50, 2.5, -100], yaw: NORTH, radius: 3.5 }, // up the half-loop run-up
    { center: [-50, 18.7, -178.2], yaw: SOUTH, radius: 1.6 }, // under the top, ridden inverted
    { center: [10, 2.5, 20], yaw: EAST, radius: 3.5 }, // along the south end
    { center: [50, 2.5, -100], yaw: NORTH, radius: 3.5 }, // up the fleet run-up
    { center: [50, 7, -193], yaw: NORTH, radius: 3.5 }, // above the pickup and the pod
    { center: [-55, 2.5, -290], yaw: WEST, radius: 3.5 }, // along the north end
    { center: [-70, 1, -100], yaw: SOUTH, radius: 5 }, // start/finish arch, half buried
  ],

  // The reveal run starts on the half-loop's run-up and finishes on the fleet's landing
  // straight, ~60 m past the semi's nose.
  stunts: {
    spawn: { position: [-50, 1.5, 25], yaw: NORTH },
    finish: { center: [FLEET_X, 1, -270], yaw: NORTH, radius: 5 },
  },
}
