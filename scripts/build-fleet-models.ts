// Builds the Proving Ground's parked fleet, public/models/fleet/<model>.glb, in code: generic
// low-poly look-alikes (a sedan, a crossover, an angular pickup, a robotaxi pod and a semi
// tractor) with no badges or names. Each is sized from FLEET_SHAPES in src/scene/fleetData.ts, so it
// fills the colliders the level builds from the same numbers. Axes as in docs/car-model-spec.md:
// nose towards +Z, centred on X and Z, ground at y = 0. One mesh and one material per vehicle,
// coloured per vertex (paint, glass, tyres, trim, lamps), so each draws in one call.
// Run with `npm run model:fleet` after changing the shapes here or in fleet.ts.
import { Document, Logger, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt, weld } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import { mkdirSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// src/ imports leave out the `.ts` extension (Vite resolves them); add it for Node.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (!specifier.startsWith('.') || /\.\w+$/.test(specifier)) throw error
      return next(`${specifier}.ts`, context)
    }
  },
})
const { FLEET_SHAPES } = await import('../src/scene/fleetData.ts')
type FleetModel = import('../src/scene/fleetData.ts').FleetModel

const OUTPUT_DIR = 'public/models/fleet'
const MAX_TRIANGLES = 5000

// sRGB; Color converts to linear, which is what glTF vertex colours hold.
const COLORS = {
  glass: '#1b2228',
  tyre: '#151515',
  rim: '#8d9298',
  trim: '#26282c',
  head: '#efece0',
  tail: '#9c1414',
  amber: '#d07a12',
}
const PAINT: Record<FleetModel, string> = {
  sedan: '#8b9198',
  crossover: '#2d4a6c',
  pickup: '#b4b7b9',
  pod: '#e6e6e2',
  semi: '#d8d9db',
}

// --- Parts: plain geometry, flat-shaded, with one colour per part ----------------------------

type Part = BufferGeometry

function paint(geometry: BufferGeometry, color: string): Part {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  g.deleteAttribute('uv')
  g.computeVertexNormals() // non-indexed: one normal per face, for the low-poly look
  const c = new Color(color)
  const colors = new Float32Array(g.getAttribute('position').count * 3)
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i)
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}

// A box between the given extents (x across, y up, z along the car).
function block(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: string,
) {
  const g = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0)
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  return paint(g, color)
}

// The same box on both sides of the centre line, at |x| from `inner` to `outer`.
const pair = (
  inner: number,
  outer: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: string,
) => [block(inner, outer, y0, y1, z0, z1, color), block(-outer, -inner, y0, y1, z0, z1, color)]

// A side profile ([z, y] points, anticlockwise seen from +X) extruded `width` across, centred,
// with its edges chamfered by `bevel`.
function profile(points: [number, number][], width: number, color: string, bevel = 0.04) {
  const shape = new Shape(points.map(([z, y]) => ({ x: z, y }) as never))
  const g = new ExtrudeGeometry(shape, {
    depth: width - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  })
  // Shape x → car z, extrusion → car x.
  g.rotateY(-Math.PI / 2)
  g.translate(width / 2 - bevel, 0, 0)
  return paint(g, color)
}

function rounded(
  w: number,
  h: number,
  l: number,
  radius: number,
  at: [number, number, number],
  color: string,
) {
  const g = new RoundedBoxGeometry(w, h, l, 2, radius)
  g.translate(...at)
  return paint(g, color)
}

// A wheel (tyre and hub) with its axle on X, outer face `width` wide, at (x, radius, z).
function wheel(x: number, z: number, radius: number, width: number) {
  const tyre = new CylinderGeometry(radius, radius, width, 14)
  tyre.rotateZ(Math.PI / 2)
  tyre.translate(x, radius, z)
  const hub = new CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 10)
  hub.rotateZ(Math.PI / 2)
  hub.translate(x, radius, z)
  return [paint(tyre, COLORS.tyre), paint(hub, COLORS.rim)]
}

// Wheels on both sides at each axle z, their outer faces at ±track.
const axles = (zs: number[], track: number, radius: number, width: number) =>
  zs.flatMap((z) => [
    ...wheel(track - width / 2, z, radius, width),
    ...wheel(-track + width / 2, z, radius, width),
  ])

// A cylinder along Z (a fuel tank) or Y (an exhaust stack).
function tank(x: number, y: number, z0: number, z1: number, radius: number, color: string) {
  const g = new CylinderGeometry(radius, radius, z1 - z0, 12)
  g.rotateX(Math.PI / 2)
  g.translate(x, y, (z0 + z1) / 2)
  return paint(g, color)
}
function stack(x: number, z: number, y0: number, y1: number, radius: number, color: string) {
  const g = new CylinderGeometry(radius, radius, y1 - y0, 8)
  g.translate(x, (y0 + y1) / 2, z)
  return paint(g, color)
}

// Head and tail lamps as thin plates on the nose and tail faces.
function lamps(front: number, rear: number, x: number, w: number, y0: number, y1: number) {
  return [
    ...pair(x - w / 2, x + w / 2, y0, y1, front - 0.02, front + 0.02, COLORS.head),
    ...pair(x - w / 2, x + w / 2, y0, y1, rear - 0.02, rear + 0.02, COLORS.tail),
  ]
}

// --- The vehicles: each fits its FLEET_SHAPES size (and its collider boxes) ------------------

function sedan(): Part[] {
  const [w, , l] = FLEET_SHAPES.sedan.size
  const f = l / 2
  const p = PAINT.sedan
  return [
    // Body to the belt line: low trunk, sloping hood.
    profile(
      [
        [-f, 0.32],
        [f, 0.32],
        [f, 0.66],
        [f - 0.35, 0.84],
        [0.95, 0.95],
        [-1.9, 0.95],
        [-f, 0.86],
      ],
      w,
      p,
    ),
    // Greenhouse and roof.
    profile(
      [
        [-1.25, 0.95],
        [0.85, 0.95],
        [0.3, 1.38],
        [-0.85, 1.38],
      ],
      1.56,
      COLORS.glass,
      0.03,
    ),
    profile(
      [
        [-0.85, 1.38],
        [0.3, 1.38],
        [0.25, 1.45],
        [-0.8, 1.45],
      ],
      1.58,
      p,
      0.02,
    ),
    block(-0.6, 0.6, 0.38, 0.6, f - 0.02, f + 0.03, COLORS.trim), // grille
    ...lamps(f + 0.01, -f - 0.01, 0.66, 0.34, 0.62, 0.72),
    ...axles([-1.45, 1.45], w / 2 + 0.02, 0.33, 0.22),
  ]
}

function crossover(): Part[] {
  const [w, , l] = FLEET_SHAPES.crossover.size
  const f = l / 2
  const p = PAINT.crossover
  return [
    profile(
      [
        [-f, 0.36],
        [f, 0.36],
        [f, 0.7],
        [f - 0.4, 0.9],
        [1.15, 1.0],
        [-f, 1.0],
      ],
      w,
      p,
    ),
    profile(
      [
        [-2.2, 1.0],
        [0.95, 1.0],
        [0.3, 1.52],
        [-2.05, 1.52],
      ],
      1.66,
      COLORS.glass,
      0.03,
    ),
    profile(
      [
        [-2.08, 1.52],
        [0.3, 1.52],
        [0.24, 1.58],
        [-2.04, 1.58],
      ],
      1.68,
      p,
      0.02,
    ),
    ...pair(0.62, 0.68, 1.58, 1.6, -1.8, 0.0, COLORS.trim), // roof rails
    block(-w / 2 - 0.01, w / 2 + 0.01, 0.36, 0.52, -f, f, COLORS.trim), // cladding
    block(-0.62, 0.62, 0.42, 0.66, f - 0.02, f + 0.03, COLORS.trim),
    ...lamps(f + 0.01, -f - 0.01, 0.68, 0.3, 0.7, 0.8),
    ...axles([-1.5, 1.5], w / 2 + 0.02, 0.36, 0.24),
  ]
}

function pickup(): Part[] {
  const [w, , l] = FLEET_SHAPES.pickup.size
  const f = l / 2
  const p = PAINT.pickup
  const bed = -0.4 // the cab's back wall
  return [
    // Angular nose and cab: a flat hood rising in one straight line to the roof peak.
    profile(
      [
        [bed, 0.42],
        [f, 0.42],
        [f, 0.92],
        [f - 0.2, 1.15],
        [1.45, 1.15],
        [bed, 1.15],
      ],
      w,
      p,
      0.02,
    ),
    profile(
      [
        [bed, 1.15],
        [1.45, 1.15],
        [0.55, 1.78],
        [-0.3, 1.78],
      ],
      1.96,
      COLORS.glass,
      0.02,
    ),
    profile(
      [
        [-0.3, 1.74],
        [0.55, 1.74],
        [0.5, 1.8],
        [-0.3, 1.8],
      ],
      1.98,
      p,
      0.01,
    ),
    // The open bed: floor, side walls and tailgate.
    block(-w / 2, w / 2, 0.42, 0.72, -f, bed, p),
    ...pair(w / 2 - 0.12, w / 2, 0.72, 1.15, -f, bed, p),
    block(-w / 2 + 0.12, w / 2 - 0.12, 0.72, 1.12, -f, -f + 0.1, p),
    block(-w / 2 - 0.01, w / 2 + 0.01, 0.42, 0.56, -f, f, COLORS.trim),
    block(-w / 2 + 0.15, w / 2 - 0.15, 0.95, 1.0, f - 0.02, f + 0.02, COLORS.head), // light bar
    ...pair(0.7, 1.0, 0.95, 1.08, -f - 0.02, -f + 0.02, COLORS.tail),
    ...axles([-1.85, 1.75], w / 2 + 0.02, 0.42, 0.3),
  ]
}

function pod(): Part[] {
  const [w, , l] = FLEET_SHAPES.pod.size
  const f = l / 2
  const p = PAINT.pod
  return [
    rounded(w, 0.62, l, 0.26, [0, 0.58, 0], p),
    rounded(1.68, 0.66, 2.3, 0.28, [0, 1.15, -0.1], COLORS.glass),
    rounded(1.5, 0.1, 1.7, 0.05, [0, 1.47, -0.15], p),
    block(-0.7, 0.7, 0.72, 0.78, f - 0.02, f + 0.01, COLORS.head), // light strips
    block(-0.7, 0.7, 0.72, 0.78, -f - 0.01, -f + 0.02, COLORS.tail),
    ...axles([-1.15, 1.15], w / 2 - 0.02, 0.3, 0.2),
  ]
}

function semi(): Part[] {
  const [w, h, l] = FLEET_SHAPES.semi.size
  const f = l / 2
  const p = PAINT.semi
  const back = 0.9 // the cab's back wall; the deck runs behind it
  return [
    // Chassis rails and the deck with its fifth-wheel plate.
    ...pair(0.35, 0.55, 0.55, 1.0, -f, f - 0.2, COLORS.trim),
    block(-1.15, 1.15, 1.0, 1.15, -f + 0.1, back, COLORS.trim),
    tank(0, 1.2, -2.6, -1.4, 0.05, COLORS.trim),
    block(-0.6, 0.6, 1.15, 1.3, -2.6, -1.4, COLORS.rim),
    // Cab over the front axle, with a roof fairing and a sleeper behind the seats.
    profile(
      [
        [back, 0.95],
        [f - 0.06, 0.95],
        [f - 0.06, 3.15],
        [f - 0.9, h - 0.06],
        [back, h - 0.06],
      ],
      w - 0.1,
      p,
      0.06,
    ),
    block(-1.1, 1.1, 2.15, 3.05, f + 0.01, f + 0.04, COLORS.glass), // windshield
    ...pair(1.2, 1.23, 2.2, 3.0, 2.5, 3.3, COLORS.glass), // side windows
    block(-w / 2, w / 2, 0.45, 0.95, f - 0.25, f + 0.04, COLORS.trim), // bumper
    block(-0.8, 0.8, 1.1, 1.9, f + 0.01, f + 0.04, COLORS.trim), // grille
    ...pair(0.85, 1.15, 1.15, 1.35, f + 0.02, f + 0.05, COLORS.head),
    ...pair(1.2, 1.25, 3.7, 3.8, 1.2, 3.0, COLORS.amber), // marker lights along the roof
    // Fuel tanks between the axles, exhaust stacks against the cab's back wall.
    tank(0.95, 0.75, -0.9, 0.9, 0.3, COLORS.rim),
    tank(-0.95, 0.75, -0.9, 0.9, 0.3, COLORS.rim),
    stack(1.15, back + 0.1, 1.0, h - 0.05, 0.09, COLORS.rim),
    stack(-1.15, back + 0.1, 1.0, h - 0.05, 0.09, COLORS.rim),
    ...pair(1.0, 1.25, 0.25, 0.95, -f, -f + 0.04, COLORS.trim), // mud flaps
    ...axles([2.5], w / 2 - 0.05, 0.5, 0.3),
    ...axles([-1.4, -2.6], w / 2 - 0.05, 0.5, 0.55),
  ]
}

const BUILDERS: Record<FleetModel, () => Part[]> = { sedan, crossover, pickup, pod, semi }

// --- Write one GLB per vehicle ---------------------------------------------------------------

await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
mkdirSync(OUTPUT_DIR, { recursive: true })

const round = (v: number[]) => v.map((n) => +n.toFixed(2)).join(', ')
for (const [model, build] of Object.entries(BUILDERS) as [FleetModel, () => Part[]][]) {
  const geometry = mergeGeometries(build())
  geometry.computeBoundingBox()
  const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN))
  const buffer = doc.createBuffer()
  const accessor = (array: ArrayLike<number>) =>
    doc.createAccessor().setType('VEC3').setArray(new Float32Array(array)).setBuffer(buffer)
  const material = doc
    .createMaterial(`${model}_body`)
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0.2)
    .setRoughnessFactor(0.55)
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor(geometry.getAttribute('position').array))
    .setAttribute('NORMAL', accessor(geometry.getAttribute('normal').array))
    .setAttribute('COLOR_0', accessor(geometry.getAttribute('color').array))
    .setMaterial(material)
  const mesh = doc.createMesh(model).addPrimitive(primitive)
  const scene = doc.createScene(model)
  scene.addChild(doc.createNode(model).setMesh(mesh))
  doc.getRoot().setDefaultScene(scene)
  await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder }))

  const triangles = primitive.getIndices()!.getCount() / 3
  if (triangles > MAX_TRIANGLES)
    throw new Error(`${model}: ${triangles} triangles > ${MAX_TRIANGLES}`)
  const output = `${OUTPUT_DIR}/${model}.glb`
  await io.write(output, doc)
  const { min, max } = geometry.boundingBox!
  console.log(
    `${output}: ${triangles} triangles, ${(statSync(output).size / 1024).toFixed(1)} kB, ` +
      `bounds [${round(min.toArray())}] … [${round(max.toArray())}], size ${round(FLEET_SHAPES[model].size)}`,
  )
}
