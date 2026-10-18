// Converts the hero Roadster source model into public/models/car.glb, laid out as described in
// docs/car-model-spec.md. Run with `npm run model:car` after changing the source file or the
// car's chassis/wheel/suspension tuning. The placeholder car is built by build-car-model-kenney.ts.
import { NodeIO, type Primitive, type mat4, type vec3 } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  compactPrimitive,
  getBounds,
  meshopt,
  prune,
  textureCompress,
  transformPrimitive,
  weldPrimitive,
} from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { statSync } from 'node:fs'
import sharp from 'sharp'
import { TUNING } from '../src/config/tuning.ts'
import { FRONT, frontZ, ground, hubs, rearZ, restSag } from './car-model-targets.ts'

const SOURCE = 'assets/roadster-2026/source.glb'
const OUTPUT = 'public/models/car.glb'

// The source is one mesh made of three islands: the body with the front wheels fused in, and
// the two rear wheels. The left (+X) rear wheel is the template for all four wheels.
// Front hub z in source units, measured from the front tyres' contact patches.
const SRC_FRONT_Z = 0.527
// The fused front tyres are cut out of the body inside an X-axis cylinder around each front
// hub: this much wider than the tyre radius, from this far inside the tyre's inner face outwards.
const CUT_RADIUS = 1.05
const CUT_INNER_MARGIN = 0.01

// The fused front tyres were the front arches' only lining, so cutting them out opens a view
// into the hollow body. A dark liner closes each front arch: a cylinder around the hub, this
// much larger than the cut, running from the body side (this far inside it, m) inwards to a
// disc this far (m) inboard of the steered wheel's sweep. Its bottom is cut off flat this far
// (fraction of its radius) below the hub so it stays clear of the ground.
const LINER_RADIUS = 1.04
const LINER_SIDE_INSET = 0.04
const LINER_GAP = 0.02
const LINER_FLOOR = 0.6
const LINER_SEGMENTS = 32

// Triangle budgets after simplification. Every wheel is drawn four times.
const BODY_TRIANGLES = 95_000
const WHEEL_TRIANGLES = 11_000
// Simplifier limits: geometric error as a fraction of the part's size, and how much a UV
// change counts against it.
const SIMPLIFY_ERROR = 0.01
const UV_WEIGHT = 1

// Thruster empties at the exits of the two outer exhaust vents in the rear diffuser, in source
// units (measured). +X is the car's left.
const THRUSTERS: { name: string; at: vec3 }[] = [
  { name: 'thruster_left', at: [0.128, 0.208, -0.93] },
  { name: 'thruster_right', at: [-0.128, 0.208, -0.93] },
]

const WHEEL_NAMES = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']
// +X is the car's left, so right wheels turn the template's outer face round to −X.
const RIGHT = [1, 3]

const { wheels, steering } = TUNING.car

await MeshoptEncoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(SOURCE)
const root = doc.getRoot()
const scene = root.getDefaultScene() ?? root.listScenes()[0]
const buffer = root.listBuffers()[0]

const srcMesh = root.listMeshes()[0]
const src = srcMesh.listPrimitives()[0]
const pos = src.getAttribute('POSITION')!.getArray()!
const idx = src.getIndices()!.getArray()!
const triCount = idx.length / 3

// Islands: vertices are split along UV seams, so join them by position before union-find.
const parent = Int32Array.from({ length: pos.length / 3 }, (_, i) => i)
const find = (v: number) => {
  while (parent[v] !== v) v = parent[v] = parent[parent[v]]
  return v
}
const byPosition = new Map<string, number>()
for (let v = 0; v < pos.length / 3; v++) {
  const key = `${pos[v * 3]},${pos[v * 3 + 1]},${pos[v * 3 + 2]}`
  const first = byPosition.get(key)
  if (first === undefined) byPosition.set(key, v)
  else parent[find(v)] = find(first)
}
for (let t = 0; t < idx.length; t += 3) {
  parent[find(idx[t + 1])] = find(idx[t])
  parent[find(idx[t + 2])] = find(idx[t])
}
const island = new Int32Array(triCount)
const islandSize = new Map<number, number>()
for (let t = 0; t < triCount; t++) {
  island[t] = find(idx[t * 3])
  islandSize.set(island[t], (islandSize.get(island[t]) ?? 0) + 1)
}
if (islandSize.size !== 3) {
  throw new Error(`${SOURCE}: expected 3 islands (body + 2 rear wheels), found ${islandSize.size}`)
}
const [bodyIsland, ...rearIslands] = [...islandSize.keys()].sort(
  (a, b) => islandSize.get(b)! - islandSize.get(a)!,
)

const islandBounds = (id: number) => {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let t = 0; t < triCount; t++) {
    if (island[t] !== id) continue
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k]
      for (let d = 0; d < 3; d++) {
        min[d] = Math.min(min[d], pos[v * 3 + d])
        max[d] = Math.max(max[d], pos[v * 3 + d])
      }
    }
  }
  return { min, max, centre: min.map((m, d) => (m + max[d]) / 2) as vec3 }
}
const rear = rearIslands.map(islandBounds)
const templateIndex = rear[0].centre[0] > 0 ? 0 : 1
const template = rear[templateIndex]
const size = template.max.map((m, d) => m - template.min[d])
if (size[0] >= size[1] || size[0] >= size[2]) {
  throw new Error(`${SOURCE}: the template wheel's axle isn't along X (size ${size})`)
}
const srcRadius = size[1] / 2
const srcWidth = size[0]
const srcRearZ = (rear[0].centre[2] + rear[1].centre[2]) / 2
const srcTrack = (rear[0].centre[0] + rear[1].centre[0]) / 2
const srcGround = Math.min(rear[0].min[1], rear[1].min[1])

// A new primitive holding only the kept triangles of the source, vertices compacted.
const pick = (keep: (t: number) => boolean): Primitive => {
  const kept: number[] = []
  for (let t = 0; t < triCount; t++) {
    if (keep(t)) kept.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2])
  }
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint32Array(kept))
    .setBuffer(buffer)
  return compactPrimitive(src.clone().setIndices(indices))
}

// Bodywork: the body island minus the fused front tyres.
const cutRadius = srcRadius * CUT_RADIUS
const cutInner = Math.abs(template.min[0]) - CUT_INNER_MARGIN
const inFrontTyre = (t: number) => {
  let x = 0
  let y = 0
  let z = 0
  for (let k = 0; k < 3; k++) {
    const v = idx[t * 3 + k]
    x += pos[v * 3] / 3
    y += pos[v * 3 + 1] / 3
    z += pos[v * 3 + 2] / 3
  }
  return Math.abs(x) > cutInner && Math.hypot(y - template.centre[1], z - SRC_FRONT_Z) < cutRadius
}
const bodyPrim = pick((t) => island[t] === bodyIsland && !inFrontTyre(t))
const wheelPrim = pick((t) => island[t] === rearIslands[templateIndex])

// One uniform scale fits the wheelbase, so the wheels sit in the body's arches; the source
// ground line maps onto the ground line with the car resting on its suspension, so the arches
// are centred on the loaded wheels and keep the body's ride height.
const s = (frontZ - rearZ) / (SRC_FRONT_Z - srcRearZ)
const srcAnchor: vec3 = [srcTrack, srcGround, (SRC_FRONT_Z + srcRearZ) / 2]
const anchor: vec3 = [0, ground + restSag, (frontZ + rearZ) / 2]
const offset = anchor.map((a, d) => a - s * srcAnchor[d]) as vec3
const fit = (p: vec3): vec3 => [s * p[0] + offset[0], s * p[1] + offset[1], s * p[2] + offset[2]]
// prettier-ignore
transformPrimitive(bodyPrim, [
  s, 0, 0, 0,
  0, s, 0, 0,
  0, 0, s, 0,
  ...offset, 1,
] as mat4)

// The wheel is centred on its hub and scaled to the physics radius and width.
const ws: vec3 = [wheels.width / srcWidth, wheels.radius / srcRadius, wheels.radius / srcRadius]
const c = template.centre
// prettier-ignore
transformPrimitive(wheelPrim, [
  ws[0], 0, 0, 0,
  0, ws[1], 0, 0,
  0, 0, ws[2], 0,
  -ws[0] * c[0], -ws[1] * c[1], -ws[2] * c[2], 1,
] as mat4)

// Simplify each part to its own budget. The source's UV atlas splits most vertices along
// seams, which the default simplifier won't collapse, so it runs permissive with the UVs as
// weighted attributes: seams can move, but only where the texture stays in place.
const simplifyTo = (prim: Primitive, triangles: number) => {
  weldPrimitive(prim)
  const positions = prim.getAttribute('POSITION')!.getArray() as Float32Array
  const uvs = prim.getAttribute('TEXCOORD_0')!.getArray() as Float32Array
  const indices = new Uint32Array(prim.getIndices()!.getArray()!)
  const [kept] = MeshoptSimplifier.simplifyWithAttributes(
    indices,
    positions,
    3,
    uvs,
    2,
    [UV_WEIGHT, UV_WEIGHT],
    null,
    triangles * 3,
    SIMPLIFY_ERROR,
    ['Permissive'],
  )
  prim.getIndices()!.setArray(new Uint32Array(kept))
  compactPrimitive(prim)
  return kept.length / 3
}
const bodyTris = simplifyTo(bodyPrim, BODY_TRIANGLES)
const wheelTris = simplifyTo(wheelPrim, WHEEL_TRIANGLES)

// The source ships its texture in the emissive slot with a black base colour, so it renders
// unlit. Move it to base colour so the car takes the scene's lights and shadows.
const material = src.getMaterial()!
const texture = material.getEmissiveTexture()!
const sampler = material.getEmissiveTextureInfo()!
material
  .setBaseColorTexture(texture)
  .setBaseColorFactor([1, 1, 1, 1])
  .setEmissiveTexture(null)
  .setEmissiveFactor([0, 0, 0])
  .setRoughnessFactor(0.5)
  .setMetallicFactor(0)
material
  .getBaseColorTextureInfo()!
  .setTexCoord(sampler.getTexCoord())
  .setWrapS(sampler.getWrapS())
  .setWrapT(sampler.getWrapT())
  .setMinFilter(sampler.getMinFilter())
  .setMagFilter(sampler.getMagFilter())

// Arch liners, in fitted metres, around the hub axis (X): a disc on the inner end and a
// cylinder out to the body side. The material is double-sided, so normals only need to be axial.
const sweep =
  (wheels.width / 2) * Math.cos(steering.maxAngle) + wheels.radius * Math.sin(steering.maxAngle)
const linerRadius = cutRadius * s * LINER_RADIUS
const bodyPosition = bodyPrim.getAttribute('POSITION')!
const bodySide = [bodyPosition.getMin([0, 0, 0])[0], bodyPosition.getMax([0, 0, 0])[0]]
const linerPositions: number[] = []
const linerNormals: number[] = []
const linerIndices: number[] = []
for (const i of FRONT) {
  const [hx, hubY, hz] = hubs[i]
  const hy = hubY + restSag // the arch is centred on the loaded wheel
  const side = Math.sign(hx)
  const inner = hx - side * (sweep + LINER_GAP)
  const outer = bodySide[side > 0 ? 1 : 0] - side * LINER_SIDE_INSET
  const ring = (k: number): [number, number] => {
    const a = (k / LINER_SEGMENTS) * 2 * Math.PI
    return [
      Math.max(hy + linerRadius * Math.sin(a), hy - LINER_FLOOR * linerRadius),
      hz + linerRadius * Math.cos(a),
    ]
  }
  // Disc: centre, then one vertex per segment.
  const disc = linerPositions.length / 3
  linerPositions.push(inner, hy, hz)
  linerNormals.push(side, 0, 0)
  for (let k = 0; k < LINER_SEGMENTS; k++) {
    linerPositions.push(inner, ...ring(k))
    linerNormals.push(side, 0, 0)
    linerIndices.push(disc, disc + 1 + k, disc + 1 + ((k + 1) % LINER_SEGMENTS))
  }
  // Cylinder: an inner and an outer vertex per segment, normals towards the axis.
  const tube = linerPositions.length / 3
  for (let k = 0; k < LINER_SEGMENTS; k++) {
    const [y, z] = ring(k)
    const len = Math.hypot(y - hy, z - hz)
    for (const x of [inner, outer]) {
      linerPositions.push(x, y, z)
      linerNormals.push(0, (hy - y) / len, (hz - z) / len)
    }
    const a = tube + 2 * k
    const b = tube + 2 * ((k + 1) % LINER_SEGMENTS)
    linerIndices.push(a, a + 1, b + 1, a, b + 1, b)
  }
}
const accessor = (
  type: 'VEC3' | 'SCALAR',
  array: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer)
const linerPrim = doc
  .createPrimitive()
  .setAttribute('POSITION', accessor('VEC3', new Float32Array(linerPositions)))
  .setAttribute('NORMAL', accessor('VEC3', new Float32Array(linerNormals)))
  .setIndices(accessor('SCALAR', new Uint32Array(linerIndices)))
  .setMaterial(
    doc
      .createMaterial('arch_liner')
      .setBaseColorFactor([0.02, 0.02, 0.02, 1])
      .setRoughnessFactor(1)
      .setMetallicFactor(0)
      .setDoubleSided(true),
  )

// Replace the source node with the spec layout.
for (const n of scene.listChildren()) n.dispose()
srcMesh.dispose()

const body = doc
  .createNode('body')
  .addChild(
    doc
      .createNode('body_mesh')
      .setMesh(doc.createMesh('body').addPrimitive(bodyPrim).addPrimitive(linerPrim)),
  )
scene.addChild(body)

// Every wheel node sits at its physics hub and shares one mesh through a child node.
const wheelMesh = doc.createMesh('wheel').addPrimitive(wheelPrim)
WHEEL_NAMES.forEach((name, i) => {
  const mesh = doc.createNode(`${name}_mesh`).setMesh(wheelMesh)
  if (RIGHT.includes(i)) mesh.setRotation([0, 1, 0, 0])
  scene.addChild(doc.createNode(name).setTranslation(hubs[i]).addChild(mesh))
})

for (const { name, at } of THRUSTERS) scene.addChild(doc.createNode(name).setTranslation(fit(at)))

scene.setName('car')
await doc.transform(
  prune({ keepLeaves: true }), // keep the empty thruster nodes
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048] }),
  meshopt({ encoder: MeshoptEncoder }),
)
await io.write(OUTPUT, doc)

const { min, max } = getBounds(body)
const round = (v: number[]) => v.map((n) => +n.toFixed(3)).join(', ')
const frontHubs = FRONT.map((i) => round(hubs[i])).join(' / ')
console.log(`${SOURCE} → ${OUTPUT} (scale ${s.toFixed(3)})`)
console.log(`  body bounds: [${round(min)}] … [${round(max)}]`)
console.log(`  wheel nodes: ${frontHubs} (front), rest sag ${restSag.toFixed(3)} m`)
console.log(`  front tyres cut out within ${(cutRadius * s).toFixed(3)} m of the hub`)
const linerTris = linerIndices.length / 3
const totalTris = bodyTris + linerTris + 4 * wheelTris
console.log(
  `  triangles: body ${bodyTris} + liners ${linerTris} + 4 × wheel ${wheelTris} = ${totalTris}`,
)
console.log(`  size: ${(statSync(OUTPUT).size / 1e6).toFixed(2)} MB`)
