// The Proving Ground at night (M16.6): floodlight towers on the perimeter walls, markings and
// concrete aprons on the asphalt, and scenery outside the walls. Visual only; the colliders
// are the greybox ones in provingGround.ts, and these positions follow them.
import {
  checker,
  chevron,
  circle,
  hatch,
  joints,
  type LevelArt,
  outline,
  type PaintArea,
  type PaintLine,
  seeded,
} from './artData'

// Lanes and zones, from provingGround.ts: the half-loop's run-up at x = −50 (entry at z −170,
// lip overhanging to z −176.8, back at z −185.6), the fleet's at x = 50 (sedan's tail at
// z −175, semi's nose at z −206.8), the stunt start at z 25 and the reveal's finish at z −270.
// The circuit road's south and north straights cross both lanes at z −15 and −255 (8 m wide).
const LOOP_X = -50
const FLEET_X = 50
const ROAD_SOUTH: [number, number] = [-11, -19]
const ROAD_NORTH: [number, number] = [-251, -259]
const MAST_HEIGHT = 28
const WALL = { west: -111, east: 111, south: 41, north: -341 } // wall centre lines

// A lane's two edge lines from z0 to z1 (z0 > z1, heading north), broken where the road crosses.
function laneEdges(x: number, halfWidth: number, z0: number, z1: number): PaintLine[] {
  const spans: [number, number][] = []
  let from = z0
  for (const [south, north] of [ROAD_SOUTH, ROAD_NORTH]) {
    if (south < from && north > z1) {
      spans.push([from, south])
      from = north
    }
  }
  spans.push([from, z1])
  return spans.flatMap(([a, b]) =>
    [x - halfWidth, x + halfWidth].map((lx): PaintLine => ({
      from: [lx, a],
      to: [lx, b],
      width: 0.2,
      paint: 'white',
    })),
  )
}

// Asphalt repairs scattered over the open pad, clear of the lanes and aprons.
function patches(): PaintArea[] {
  const random = seeded(16_6)
  const areas: PaintArea[] = []
  while (areas.length < 36) {
    const x = -100 + random() * 200
    const z = -330 + random() * 360
    if (Math.abs(x - LOOP_X) < 16 || Math.abs(x - FLEET_X) < 12) continue
    const w = 1.5 + random() * 6
    const l = 1.5 + random() * 9
    areas.push({ center: [x, z], size: [w, l], paint: 'patch', yaw: (random() - 0.5) * 0.3 })
  }
  return areas
}

// Concrete under the half-loop and its landing apron, and under the parked fleet.
const LOOP_APRON = { x0: -64, x1: -36, z0: -205, z1: -135 }
const FLEET_APRON = { x0: 42, x1: 58, z0: -213, z1: -169 }
const apron = ({ x0, x1, z0, z1 }: typeof LOOP_APRON): PaintArea => ({
  center: [(x0 + x1) / 2, (z0 + z1) / 2],
  size: [x1 - x0, z1 - z0],
  paint: 'concrete',
})

// White bays around the parked cars (lengths from fleetData.ts, nose to tail from z −175).
function bays(): PaintLine[] {
  const lengths = [4.7, 4.8, 5.7, 3.6, 7.0]
  let z = -175
  return lengths.flatMap((length) => {
    const lines = outline(FLEET_X - 1.9, FLEET_X + 1.9, z - length - 0.5, z + 0.5, 0.12, 'white')
    z -= length + 1.5
    return lines
  })
}

export const PROVING_GROUND_ART: LevelArt = {
  // Low in the north-north-west, so the chase cam sees it on the run-ups.
  moon: [-0.36, 0.29, -0.89],
  // McGregor's nearest town lies to the north-east.
  townGlow: [0.71, -0.71],

  // Real spot lights on the stunts, from the side walls; the rest give baked pools.
  floodlights: [
    { mast: [WALL.west, -128], height: MAST_HEIGHT, aim: [LOOP_X, 6, -168], spot: true },
    { mast: [WALL.west, -222], height: MAST_HEIGHT, aim: [LOOP_X, 10, -180], spot: true },
    // A low lamp beside the drop zone lights the loop's underside, where the car hangs inverted.
    { mast: [-64, -148], height: 1.6, aim: [LOOP_X, 19, -178], spot: true },
    { mast: [WALL.east, -150], height: MAST_HEIGHT, aim: [FLEET_X, 1, -182], spot: true },
    { mast: [WALL.east, -236], height: MAST_HEIGHT, aim: [FLEET_X, 0, -222], spot: true },
    { mast: [WALL.west, -40], height: MAST_HEIGHT, aim: [-62, 0, -45] },
    { mast: [WALL.west, -300], height: MAST_HEIGHT, aim: [-64, 0, -292] },
    { mast: [WALL.east, -50], height: MAST_HEIGHT, aim: [62, 0, -60] },
    { mast: [WALL.east, -300], height: MAST_HEIGHT, aim: [60, 0, -276] },
    { mast: [-82, WALL.south], height: MAST_HEIGHT, aim: [LOOP_X, 0, 5] },
    { mast: [18, WALL.south], height: MAST_HEIGHT, aim: [2, 0, -8] },
    { mast: [82, WALL.south], height: MAST_HEIGHT, aim: [FLEET_X, 0, 0] },
    { mast: [-40, WALL.north], height: MAST_HEIGHT, aim: [-30, 0, -310] },
    { mast: [40, WALL.north], height: MAST_HEIGHT, aim: [FLEET_X, 0, -318] },
  ],

  areas: [apron(LOOP_APRON), apron(FLEET_APRON), ...patches(), ...checker(44, 56, -270, 1)],

  lines: [
    // The pad's edge, 3 m inside the walls.
    ...outline(-107, 107, -337, 37, 0.25, 'yellow'),
    // Half-loop: the run-up lane from the stunt start to the ramp, chevrons and 50 m bars.
    ...laneEdges(LOOP_X, 4, 37, -168),
    { from: [LOOP_X - 4, 22.5], to: [LOOP_X + 4, 22.5], width: 0.5, paint: 'white' },
    ...[-35, -85].map((z): PaintLine => ({
      from: [LOOP_X - 3.6, z],
      to: [LOOP_X + 3.6, z],
      width: 0.4,
      paint: 'white',
      dash: [1, 0.8],
    })),
    ...[-45, -60, -75, -100, -115, -130].flatMap((z) => chevron(LOOP_X, z, 2.6, 2.2, 0.35, 'red')),
    // The drop zone on the apron, where the car lands off the lip.
    ...outline(LOOP_X - 7, LOOP_X + 7, -167, -140, 0.3, 'yellow'),
    ...hatch(LOOP_X - 7, LOOP_X - 4.5, -167, -140, 2, 0.25, 'yellow'),
    ...hatch(LOOP_X + 4.5, LOOP_X + 7, -167, -140, 2, 0.25, 'yellow'),
    ...joints(LOOP_APRON.x0, LOOP_APRON.x1, LOOP_APRON.z0, LOOP_APRON.z1, 5),
    // Fleet: its run-up lane, the lift-off line, the bays, the landing zone and the finish.
    ...laneEdges(FLEET_X, 4.5, 37, -169),
    ...laneEdges(FLEET_X, 4.5, -213, -337),
    { from: [FLEET_X - 4.5, -172], to: [FLEET_X + 4.5, -172], width: 0.5, paint: 'yellow' },
    ...bays(),
    ...joints(FLEET_APRON.x0, FLEET_APRON.x1, FLEET_APRON.z0, FLEET_APRON.z1, 4),
    ...outline(FLEET_X - 6, FLEET_X + 6, -248, -214, 0.3, 'yellow'),
    ...hatch(FLEET_X - 6, FLEET_X - 3.5, -248, -214, 2, 0.25, 'yellow'),
    ...hatch(FLEET_X + 3.5, FLEET_X + 6, -248, -214, 2, 0.25, 'yellow'),
    // The time trial's start circle round the spawn.
    ...circle(0, 0, 7, 0.25, 'white'),
    { from: [-2.5, 0], to: [2.5, 0], width: 0.25, paint: 'white' },
  ],

  props: [
    { kind: 'stand', position: [-123, -172], yaw: 0 },
    { kind: 'hangar', position: [-78, -420], yaw: 0 },
    { kind: 'hangar', position: [0, -428], yaw: 0 },
    { kind: 'hangar', position: [78, -418], yaw: 0 },
    { kind: 'office', position: [158, -70], yaw: -Math.PI / 2 },
    { kind: 'gantry', position: [190, -262], yaw: 0 },
    { kind: 'waterTower', position: [-205, 95], yaw: 0 },
    { kind: 'silos', position: [-270, -430], yaw: 0.3 },
    { kind: 'radioMast', position: [460, -720], yaw: 0 },
    { kind: 'radioMast', position: [-660, -360], yaw: 0 },
    { kind: 'radioMast', position: [360, 420], yaw: 0 },
  ],

  roadMarkings: true,
}
