// Level layout types and the helpers both levels are built from. Levels are data, not
// tuning, so they live here rather than in tuning.ts; Level.tsx renders them and the
// headless sim (scripts/sim-car.ts) builds the same colliders from them.
// World axes: −Z is "north", +X is east. Ground level is y = 0.
import { ShapeUtils, Vector2, Vector3 } from 'three'
import type { ParkedCar } from './fleetData'

export type Vec3 = [number, number, number]

export type Box = { center: Vec3; size: Vec3 }

// A wedge that rises `rise` over `run` along `yaw` (0 = +Z, π = −Z), starting at `start`
// (the centre of its low edge). Its solid part reaches down to the ground.
export type Ramp = { start: Vec3; yaw: number; run: number; rise: number; width: number }

// A ramp that curves up from the ground through vertical to `endAngle` (rad), so its top is
// inverted and overhangs the run-up. `start` is the centre of its entry edge and `yaw` the
// run-up heading, as for a Ramp. The curvature eases in over the first `entry` m (a clothoid)
// and then stays constant; it's set so the lip ends `height` m up. `width` is the riding
// surface between the side lips, `lip` how far they stand off it, `thickness` the shell's.
export type Loop = {
  start: Vec3
  yaw: number
  height: number
  entry: number
  endAngle: number
  width: number
  lip: number
  thickness: number
}

// A checkpoint ring standing upright at `center`, its hole facing along `yaw`.
export type Ring = { center: Vec3; yaw: number; radius: number }

export type Level = {
  id: string // stable key for saved best times and the level choice
  surface: 'grass' | 'asphalt' // greybox colours only, for now
  spawn: { position: Vec3; yaw: number } // where a run starts, and respawns before a safe point
  ground: Box[] // walkable slabs, top at y = 0; the void around them is out of bounds
  platforms: Box[]
  walls: Box[]
  ramps: Ramp[]
  loops: Loop[]
  fleet: ParkedCar[] // parked vehicles (src/scene/fleetData.ts)
  road: { points: [number, number][]; width: number } // closed circuit, visual only
  rings: Ring[] // time-trial checkpoints in order; the last one is the start/finish arch
  jets?: boolean // the car's cold-gas jets (lift and air roll) work here; on unless false
}

export const NORTH = Math.PI
export const SOUTH = 0
export const EAST = Math.PI / 2
export const WEST = -Math.PI / 2

// Axis-aligned box from its extents.
export const box = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
): Box => ({
  center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  size: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
})

const GROUND_DEPTH = 4
export const ground = (x0: number, x1: number, z0: number, z1: number) =>
  box(x0, x1, z0, z1, -GROUND_DEPTH, 0)

// Closed rounded rectangle on the XZ plane, as a list of points.
export function roundedRect(
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

// ---------------------------------------------------------------- half-loop

const PROFILE_STEP = 0.5 // m of arc between profile points
const INTEGRATION_STEP = 0.02 // m, for solving the curvature
const LIP_THICKNESS = 0.3 // m

type Point = [number, number] // (along the run, up)

// Heading of the surface (rad above horizontal) at arc length s, for peak curvature k.
function loopAngle(s: number, k: number, entry: number) {
  return s < entry ? (k * s * s) / (2 * entry) : k * (entry / 2 + (s - entry))
}

// Arc length at which the surface reaches `angle`.
function loopLength(angle: number, k: number, entry: number) {
  return angle <= (k * entry) / 2 ? Math.sqrt((2 * entry * angle) / k) : entry / 2 + angle / k
}

function lipHeight(k: number, { entry, endAngle }: Loop) {
  const length = loopLength(endAngle, k, entry)
  let y = 0
  for (let s = 0; s < length; s += INTEGRATION_STEP) {
    y += Math.sin(loopAngle(s + INTEGRATION_STEP / 2, k, entry)) * INTEGRATION_STEP
  }
  return y
}

// The riding surface's centre line in loop-local (along, up) coordinates, from the entry to
// the lip, with each point's surface angle. `minRadius` is the radius after the entry.
export function loopProfile(loop: Loop) {
  const { entry, endAngle, height } = loop
  // A tighter curve (higher k) tops out lower; bisect for the one that reaches `height`.
  let lo = 1e-3
  let hi = 10
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2
    if (lipHeight(k, loop) > height) lo = k
    else hi = k
  }
  const k = (lo + hi) / 2
  const length = loopLength(endAngle, k, entry)
  const count = Math.ceil(length / PROFILE_STEP)
  const points: Point[] = [[0, 0]]
  const angles = [0]
  let u = 0
  let v = 0
  let s = 0
  for (let i = 1; i <= count; i++) {
    const next = (i / count) * length
    for (; s < next - 1e-9; s += INTEGRATION_STEP) {
      const ds = Math.min(INTEGRATION_STEP, next - s)
      const a = loopAngle(s + ds / 2, k, entry)
      u += Math.cos(a) * ds
      v += Math.sin(a) * ds
    }
    s = next
    points.push([u, v])
    angles.push(loopAngle(next, k, entry))
  }
  return { points, angles, minRadius: 1 / k }
}

export type TriangleMesh = { vertices: Float32Array; indices: Uint32Array }

// Extrudes a closed (along, up) polygon across x0…x1 into triangles with outward faces;
// along maps to local +Z and up to +Y.
function prism(polygon: Point[], x0: number, x1: number, vertices: number[], indices: number[]) {
  const signedArea = polygon.reduce((a, [u, v], i) => {
    const [nu, nv] = polygon[(i + 1) % polygon.length]
    return a + u * nv - nu * v
  }, 0)
  const ccw = signedArea > 0 ? polygon : [...polygon].reverse()
  const at = ([u, v]: Point, x: number) => new Vector3(x, v, u)
  const edgeA = new Vector3()
  const edgeB = new Vector3()
  // Adds triangle abc, flipped if needed so its face points along `out`.
  const triangle = (a: Vector3, b: Vector3, c: Vector3, out: Vector3) => {
    edgeA.subVectors(b, a)
    edgeB.subVectors(c, a)
    const flip = edgeA.cross(edgeB).dot(out) < 0
    const first = vertices.length / 3
    for (const p of flip ? [a, c, b] : [a, b, c]) vertices.push(p.x, p.y, p.z)
    indices.push(first, first + 1, first + 2)
  }

  const caps = ShapeUtils.triangulateShape(
    ccw.map(([u, v]) => new Vector2(u, v)),
    [],
  )
  for (const [x, out] of [
    [x0, new Vector3(-1, 0, 0)],
    [x1, new Vector3(1, 0, 0)],
  ] as const) {
    for (const [a, b, c] of caps) triangle(at(ccw[a], x), at(ccw[b], x), at(ccw[c], x), out)
  }
  // Sides: a counter-clockwise polygon's outward edge normal is the edge turned clockwise.
  ccw.forEach((p, i) => {
    const q = ccw[(i + 1) % ccw.length]
    const out = new Vector3(0, -(q[0] - p[0]), q[1] - p[1])
    triangle(at(p, x0), at(q, x0), at(q, x1), out)
    triangle(at(p, x0), at(q, x1), at(p, x1), out)
  })
}

// The half-loop as a closed solid in loop-local space (+Z along the run, entry at the
// origin): under the climb it's filled down to the ground; past vertical it's a shell
// `thickness` thick, so the inverted top is open underneath. Low lips run along both edges.
export function loopMesh(loop: Loop): TriangleMesh {
  const { width, lip, thickness } = loop
  const { points, angles } = loopProfile(loop)
  // Offsets away from (out) and towards (in) the loop's centre.
  const offset = (i: number, d: number): Point => [
    points[i][0] + Math.sin(angles[i]) * d,
    points[i][1] - Math.cos(angles[i]) * d,
  ]
  // The most vertical point: the shell's back drops straight to the ground from there.
  const back = points.reduce((best, p, i) => (p[0] > points[best][0] ? i : best), 0)

  const body: Point[] = [...points]
  for (let i = points.length - 1; i >= back; i--) body.push(offset(i, thickness))
  body.push([offset(back, thickness)[0], 0])

  const lipShape: Point[] = [...points]
  for (let i = points.length - 1; i >= 0; i--) lipShape.push(offset(i, -lip))

  const vertices: number[] = []
  const indices: number[] = []
  const side = width / 2 + LIP_THICKNESS
  prism(body, -side, side, vertices, indices)
  prism(lipShape, -side, -width / 2, vertices, indices)
  prism(lipShape, width / 2, side, vertices, indices)
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) }
}
