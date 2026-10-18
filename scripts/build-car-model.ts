// Converts the hero Roadster source model into public/models/car.glb, laid out as described in
// docs/car-model-spec.md. Run with `npm run model:car` after changing the source file or the
// car's chassis/wheel/suspension tuning. The placeholder car is built by build-car-model-kenney.ts.
import {
  NodeIO,
  type Material,
  type Primitive,
  type Texture,
  type TextureInfo,
  type mat4,
  type vec3,
} from '@gltf-transform/core'
import {
  ALL_EXTENSIONS,
  KHRMaterialsClearcoat,
  KHRMaterialsEmissiveStrength,
  KHRTextureTransform,
} from '@gltf-transform/extensions'
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
import { PAINTS } from '../src/config/paints.ts'
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

// Materials. The source's one texture is an atlas with the lighting baked in, so each body
// triangle is sorted into a material by its texel (at its UV centroid, luma 0–255) and its
// centroid in source units (measured on rendered views of the source).
// Above the beltline, dark is glass: the canopy runs from the windscreen back over the rear
// deck (luma 0–90, paint 130+). The windscreen's base dips lower at the front.
const BELT_Y = 0.33
const BELT_FRONT = { z: 0.3, y: 0.29 }
const GLASS_LUMA = 105
// Below it, dark is trim (splitter, sills, rear fascia), drawn as carbon fibre.
const TRIM_LUMA = 70
// The tail lights are the red strip across the rear: half-width, height range and the z
// beyond which they sit, for triangles facing backwards.
const TAIL_LIGHT = { x: 0.322, y: [0.326, 0.362], z: -0.88 }
// The front has no modelled lights, so a light bar is added across the fascia band under the
// bonnet's lip: a strip of this half-width and height range, this far proud of the surface,
// with this many segments across.
const HEAD_LIGHT = { x: 0.235, y: [0.186, 0.202], offset: 0.002, segments: 48 }
// Wheels: the tyre is the outer ring, from this fraction of the radius outwards.
const TYRE_INNER = 0.74
// Paint is drawn from a grey shade map so it can be recoloured: the atlas's luminance, scaled
// so the brightest paint (this percentile of paint triangles) is white, and flattened by this
// power in linear light, since the scene's lights shade the car again.
const PAINT_WHITE_PERCENTILE = 0.9
const PAINT_SHADE_POWER = 0.5
// Carbon fibre: a 2×2 twill weave texture, box-projected onto the trim, one tile per this
// many metres, with this many tows across a tile.
const CARBON_TILE = 0.12
const CARBON_TOWS = 8
const CARBON_TEXELS = 128

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

// A new primitive holding only the kept triangles of `prim`, vertices compacted.
const split = (prim: Primitive, keep: (t: number) => boolean): Primitive => {
  const all = prim.getIndices()!.getArray()!
  const kept: number[] = []
  for (let t = 0; t < all.length / 3; t++) {
    if (keep(t)) kept.push(all[t * 3], all[t * 3 + 1], all[t * 3 + 2])
  }
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint32Array(kept))
    .setBuffer(buffer)
  return compactPrimitive(prim.clone().setIndices(indices))
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
const bodyPrim = split(src, (t) => island[t] === bodyIsland && !inFrontTyre(t))
const wheelPrim = split(src, (t) => island[t] === rearIslands[templateIndex])

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
  type: 'VEC2' | 'VEC3' | 'SCALAR',
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

// Head light bar, in source units until fitted: rays cast along −Z onto the source body find
// the fascia's surface at each vertex, so the strip follows its curve.
const srcNormals = src.getAttribute('NORMAL')!.getArray()!
const nose: number[] = [] // body triangles facing forwards near the strip
for (let t = 0; t < triCount; t++) {
  const corners = [0, 1, 2].map((k) => idx[t * 3 + k])
  const near = corners.every(
    (v) => Math.abs(pos[v * 3 + 1] - HEAD_LIGHT.y[0]) < 0.05 && pos[v * 3 + 2] > SRC_FRONT_Z,
  )
  const forwards = corners.reduce((sum, v) => sum + srcNormals[v * 3 + 2], 0) > 0
  if (island[t] === bodyIsland && near && forwards) nose.push(t)
}
const surfaceZ = (x: number, y: number) => {
  let front = -Infinity
  for (const t of nose) {
    const [a, b, c] = [0, 1, 2].map((k) => idx[t * 3 + k] * 3)
    const det =
      (pos[b + 1] - pos[c + 1]) * (pos[a] - pos[c]) + (pos[c] - pos[b]) * (pos[a + 1] - pos[c + 1])
    if (det === 0) continue
    const wa =
      ((pos[b + 1] - pos[c + 1]) * (x - pos[c]) + (pos[c] - pos[b]) * (y - pos[c + 1])) / det
    const wb =
      ((pos[c + 1] - pos[a + 1]) * (x - pos[c]) + (pos[a] - pos[c]) * (y - pos[c + 1])) / det
    const wc = 1 - wa - wb
    if (wa < 0 || wb < 0 || wc < 0) continue
    front = Math.max(front, wa * pos[a + 2] + wb * pos[b + 2] + wc * pos[c + 2])
  }
  if (front === -Infinity) throw new Error(`${SOURCE}: no fascia behind the head light at ${x}`)
  return front
}
const headLightPositions: number[] = []
const headLightIndices: number[] = []
for (let i = 0; i <= HEAD_LIGHT.segments; i++) {
  const x = HEAD_LIGHT.x * ((2 * i) / HEAD_LIGHT.segments - 1)
  for (const y of HEAD_LIGHT.y)
    headLightPositions.push(...fit([x, y, surfaceZ(x, y) + HEAD_LIGHT.offset]))
  if (i > 0) headLightIndices.push(2 * i - 2, 2 * i, 2 * i + 1, 2 * i - 2, 2 * i + 1, 2 * i - 1)
}
const headLightPrim = doc
  .createPrimitive()
  .setAttribute('POSITION', accessor('VEC3', new Float32Array(headLightPositions)))
  .setAttribute(
    'NORMAL',
    accessor('VEC3', new Float32Array(headLightPositions.map((_, i) => (i % 3 === 2 ? 1 : 0)))),
  )
  .setIndices(accessor('SCALAR', new Uint32Array(headLightIndices)))

// Sort the simplified triangles into materials. The source ships its atlas in the emissive
// slot with a black base colour (it renders unlit); the new materials use it as base colour.
const atlasInfo = src.getMaterial()!.getEmissiveTextureInfo()!
const atlas = src.getMaterial()!.getEmissiveTexture()!
const { data: texels, info: atlasSize } = await sharp(atlas.getImage()!)
  .raw()
  .toBuffer({ resolveWithObject: true })
const luma = (o: number) => (texels[o] + texels[o + 1] + texels[o + 2]) / 3

// Per triangle of `prim`: its centroid, mean vertex normal and the atlas texel (offset into
// `texels`) under its UV centroid.
const sampleTriangles = (prim: Primitive) => {
  const p = prim.getAttribute('POSITION')!.getArray()!
  const n = prim.getAttribute('NORMAL')!.getArray()!
  const uv = prim.getAttribute('TEXCOORD_0')!.getArray()!
  const ids = prim.getIndices()!.getArray()!
  const { width, height, channels } = atlasSize
  return Array.from({ length: ids.length / 3 }, (_, t) => {
    const centroid = [0, 0, 0]
    const normal = [0, 0, 0]
    let u = 0
    let v = 0
    for (let k = 0; k < 3; k++) {
      const i = ids[t * 3 + k]
      for (let d = 0; d < 3; d++) {
        centroid[d] += p[i * 3 + d] / 3
        normal[d] += n[i * 3 + d] / 3
      }
      u += uv[i * 2] / 3
      v += uv[i * 2 + 1] / 3
    }
    const px = Math.min(width - 1, Math.max(0, Math.floor(u * width)))
    const py = Math.min(height - 1, Math.max(0, Math.floor(v * height)))
    return { centroid, normal, texel: (py * width + px) * channels }
  })
}

type BodyPart = 'paint' | 'glass' | 'carbon' | 'tail_light'
const BODY_PARTS: BodyPart[] = ['paint', 'glass', 'carbon', 'tail_light']
const bodyTriangles = sampleTriangles(bodyPrim)
const bodyPart = bodyTriangles.map(({ centroid, normal, texel }): BodyPart => {
  const [x, y, z] = centroid.map((c, d) => (c - offset[d]) / s) // back to source units
  const within = (box: { x: number; y: number[] }) =>
    Math.abs(x) < box.x && y > box.y[0] && y < box.y[1]
  if (normal[2] < -0.3 && z < TAIL_LIGHT.z && within(TAIL_LIGHT)) return 'tail_light'
  if (y > (z > BELT_FRONT.z ? BELT_FRONT.y : BELT_Y)) {
    return luma(texel) < GLASS_LUMA ? 'glass' : 'paint'
  }
  return luma(texel) < TRIM_LUMA ? 'carbon' : 'paint'
})
const bodyParts = BODY_PARTS.map((part) => {
  const prim = split(bodyPrim, (t) => bodyPart[t] === part)
  if (prim.getIndices()!.getCount() === 0) throw new Error(`${SOURCE}: no ${part} triangles`)
  return prim
})

type WheelPart = 'tyre' | 'rim'
const WHEEL_PARTS: WheelPart[] = ['tyre', 'rim']
const wheelPart = sampleTriangles(wheelPrim).map(({ centroid: [, y, z] }): WheelPart =>
  Math.hypot(y, z) > TYRE_INNER * wheels.radius ? 'tyre' : 'rim',
)
const wheelParts = WHEEL_PARTS.map((part) => split(wheelPrim, (t) => wheelPart[t] === part))

// Linear light from an 8-bit sRGB value, and back.
const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const toSrgb = (v: number) =>
  Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055))
const pngTexture = async (
  name: string,
  data: Uint8Array,
  size: number[],
  channels: 1 | 3,
): Promise<Texture> => {
  const [width, height] = size
  const image = await sharp(data, { raw: { width, height, channels } }).png().toBuffer()
  return doc.createTexture(name).setImage(new Uint8Array(image)).setMimeType('image/png')
}

// Paint shade map: grey, white where the paint is brightest.
const paintLumas = bodyTriangles
  .filter((_, t) => bodyPart[t] === 'paint')
  .map(({ texel }) => luma(texel))
  .sort((a, b) => a - b)
const paintWhite = toLinear(paintLumas[Math.floor(PAINT_WHITE_PERCENTILE * paintLumas.length)])
const shade = new Uint8Array(atlasSize.width * atlasSize.height)
for (let i = 0; i < shade.length; i++) {
  const lit = Math.min(1, toLinear(luma(i * atlasSize.channels)) / paintWhite)
  shade[i] = toSrgb(lit ** PAINT_SHADE_POWER)
}
const shadeMap = await pngTexture('paint_shade', shade, [atlasSize.width, atlasSize.height], 1)

// Carbon weave: a 2×2 twill of dark tows, each shaded across its width, alternating between
// along (brighter) and across, stepping one tow per row.
const weave = new Uint8Array(CARBON_TEXELS * CARBON_TEXELS * 3)
const tow = CARBON_TEXELS / CARBON_TOWS
for (let y = 0; y < CARBON_TEXELS; y++) {
  for (let x = 0; x < CARBON_TEXELS; x++) {
    const along = (Math.floor(x / tow) + Math.floor(y / tow)) % 4 < 2
    const across = ((along ? y : x) % tow) / tow
    const value = Math.round((along ? 50 : 32) * (0.55 + 0.45 * Math.sin(Math.PI * across)))
    weave.fill(value, (y * CARBON_TEXELS + x) * 3, (y * CARBON_TEXELS + x) * 3 + 3)
  }
}
const carbonWeave = await pngTexture('carbon_weave', weave, [CARBON_TEXELS, CARBON_TEXELS], 3)

// Gives each triangle of `prim` its own vertices with UVs projected onto the axis plane its
// face is most nearly parallel to, then welds them back. The UVs are stored in 0…1 so they
// can be quantized; the returned offset and scale (KHR_texture_transform) map them back to
// tiles of `tile` metres.
const boxProject = (prim: Primitive, tile: number) => {
  const p = prim.getAttribute('POSITION')!.getArray()!
  const n = prim.getAttribute('NORMAL')!.getArray()!
  const ids = prim.getIndices()!.getArray()!
  const positions = new Float32Array(ids.length * 3)
  const normals = new Float32Array(ids.length * 3)
  const uvs = new Float32Array(ids.length * 2)
  const corner = (t: number, k: number, d: number) => p[ids[t * 3 + k] * 3 + d]
  for (let t = 0; t < ids.length / 3; t++) {
    const e1 = [0, 1, 2].map((d) => corner(t, 1, d) - corner(t, 0, d))
    const e2 = [0, 1, 2].map((d) => corner(t, 2, d) - corner(t, 0, d))
    const face = [0, 1, 2].map((d) =>
      Math.abs(e1[(d + 1) % 3] * e2[(d + 2) % 3] - e1[(d + 2) % 3] * e2[(d + 1) % 3]),
    )
    const axis = face.indexOf(Math.max(...face))
    const [a, b] = [0, 1, 2].filter((d) => d !== axis)
    for (let k = 0; k < 3; k++) {
      const out = t * 3 + k
      for (let d = 0; d < 3; d++) {
        positions[out * 3 + d] = corner(t, k, d)
        normals[out * 3 + d] = n[ids[t * 3 + k] * 3 + d]
      }
      uvs[out * 2] = corner(t, k, a) / tile
      uvs[out * 2 + 1] = corner(t, k, b) / tile
    }
  }
  const min = [Infinity, Infinity]
  const max = [-Infinity, -Infinity]
  uvs.forEach((uv, i) => {
    min[i % 2] = Math.min(min[i % 2], uv)
    max[i % 2] = Math.max(max[i % 2], uv)
  })
  const scale = [0, 1].map((d) => max[d] - min[d]) as [number, number]
  for (let i = 0; i < uvs.length; i++) uvs[i] = (uvs[i] - min[i % 2]) / scale[i % 2]
  prim
    .setAttribute('POSITION', accessor('VEC3', positions))
    .setAttribute('NORMAL', accessor('VEC3', normals))
    .setAttribute('TEXCOORD_0', accessor('VEC2', uvs))
    .setIndices(
      accessor(
        'SCALAR',
        Uint32Array.from({ length: ids.length }, (_, i) => i),
      ),
    )
  weldPrimitive(prim)
  return { offset: min as [number, number], scale }
}
const carbonUvs = boxProject(bodyParts[BODY_PARTS.indexOf('carbon')], CARBON_TILE)

// Materials, physically based through glTF extensions (three loads them as
// MeshPhysicalMaterial). Double-sided like the source, whose shell has open edges.
const clearcoat = doc.createExtension(KHRMaterialsClearcoat)
const emissiveStrength = doc.createExtension(KHRMaterialsEmissiveStrength)
const withAtlas = (info: TextureInfo | null) =>
  info!
    .setTexCoord(atlasInfo.getTexCoord())
    .setWrapS(atlasInfo.getWrapS())
    .setWrapT(atlasInfo.getWrapT())
    .setMinFilter(atlasInfo.getMinFilter())
    .setMagFilter(atlasInfo.getMagFilter())
type Surface = {
  texture?: Texture | null // base colour; the atlas by default
  metal?: number
  rough?: number
  coat?: number // clearcoat
  coatRough?: number
}
const material = (
  name: string,
  { texture = atlas, metal = 0, rough = 0.5, coat = 0, coatRough = 0 }: Surface,
): Material => {
  const m = doc
    .createMaterial(name)
    .setBaseColorTexture(texture)
    .setMetallicFactor(metal)
    .setRoughnessFactor(rough)
    .setDoubleSided(true)
  if (texture === atlas) withAtlas(m.getBaseColorTextureInfo())
  if (coat > 0) {
    m.setExtension(
      'KHR_materials_clearcoat',
      clearcoat.createClearcoat().setClearcoatFactor(coat).setClearcoatRoughnessFactor(coatRough),
    )
  }
  return m
}
const glow = (m: Material, strength: number) =>
  m.setExtension(
    'KHR_materials_emissive_strength',
    emissiveStrength.createEmissiveStrength().setEmissiveStrength(strength),
  )
const defaultPaint = PAINTS[0].color.match(/\w\w/g)!.map((c) => toLinear(parseInt(c, 16)))
const MATERIALS: Record<BodyPart | WheelPart | 'head_light', Material> = {
  // Recoloured at runtime through its base colour factor.
  paint: material('paint', {
    texture: shadeMap,
    metal: 0.3,
    rough: 0.4,
    coat: 1,
    coatRough: 0.05,
  }).setBaseColorFactor([...defaultPaint, 1] as [number, number, number, number]),
  // Opaque: there's no interior to see through to.
  glass: material('glass', { rough: 0.05 }),
  carbon: material('carbon', {
    texture: carbonWeave,
    metal: 0.2,
    rough: 0.45,
    coat: 1,
    coatRough: 0.1,
  }),
  head_light: glow(
    material('head_light', { texture: null, rough: 0.2 }).setEmissiveFactor([1, 0.95, 0.85]),
    4,
  ),
  tail_light: glow(material('tail_light', { rough: 0.2 }).setEmissiveFactor([1, 1, 1]), 3),
  tyre: material('tyre', { rough: 0.9 }),
  rim: material('rim', { metal: 0.8, rough: 0.3 }),
}
MATERIALS.carbon
  .getBaseColorTextureInfo()!
  .setExtension(
    'KHR_texture_transform',
    doc
      .createExtension(KHRTextureTransform)
      .createTransform()
      .setOffset(carbonUvs.offset)
      .setScale(carbonUvs.scale),
  )
MATERIALS.tail_light.setEmissiveTexture(atlas)
withAtlas(MATERIALS.tail_light.getEmissiveTextureInfo())
bodyParts.forEach((prim, i) => prim.setMaterial(MATERIALS[BODY_PARTS[i]]))
wheelParts.forEach((prim, i) => prim.setMaterial(MATERIALS[WHEEL_PARTS[i]]))
headLightPrim.setMaterial(MATERIALS.head_light)

// Replace the source node with the spec layout.
for (const n of scene.listChildren()) n.dispose()
srcMesh.dispose()
bodyPrim.dispose()
wheelPrim.dispose()

const bodyMesh = doc.createMesh('body')
for (const prim of [...bodyParts, headLightPrim, linerPrim]) bodyMesh.addPrimitive(prim)
const body = doc.createNode('body').addChild(doc.createNode('body_mesh').setMesh(bodyMesh))
scene.addChild(body)

// Every wheel node sits at its physics hub and shares one mesh through a child node.
const wheelMesh = doc.createMesh('wheel')
for (const prim of wheelParts) wheelMesh.addPrimitive(prim)
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
const headLightTris = headLightIndices.length / 3
const totalTris = bodyTris + linerTris + headLightTris + 4 * wheelTris
console.log(
  `  triangles: body ${bodyTris} + liners ${linerTris} + head light ${headLightTris}` +
    ` + 4 × wheel ${wheelTris} = ${totalTris}`,
)
const tris = (prims: Primitive[], names: string[]) =>
  prims.map((p, i) => `${names[i]} ${p.getIndices()!.getCount() / 3}`).join(', ')
console.log(`  body materials: ${tris(bodyParts, BODY_PARTS)}`)
console.log(`  wheel materials: ${tris(wheelParts, WHEEL_PARTS)}`)
console.log(`  size: ${(statSync(OUTPUT).size / 1e6).toFixed(2)} MB`)
