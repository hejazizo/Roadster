// Converts the Kenney Car Kit source car (the M9 placeholder, kept as a fallback) into
// public/models/car.glb, laid out as described in docs/car-model-spec.md. Run with
// `npm run model:car:kenney`; the hero car is built by build-car-model.ts.
import { NodeIO, type Node, type vec3 } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { clearNodeParent, getBounds } from '@gltf-transform/functions'
import { TUNING } from '../src/config/tuning.ts'
import { FRONT, REAR, frontZ, ground, hubs, mean, rearZ } from './car-model-targets.ts'

const SOURCE = 'assets/car-kit/race-future.glb'
const OUTPUT = 'public/models/car.glb'

// Source wheel node → spec node, in the order of TUNING.car.wheels.positions (FL, FR, RL, RR).
const WHEELS: [string, string][] = [
  ['wheel-front-left', 'wheel_fl'],
  ['wheel-front-right', 'wheel_fr'],
  ['wheel-back-left', 'wheel_rl'],
  ['wheel-back-right', 'wheel_rr'],
]

// Thruster empties as fractions of the fitted body's bounds: x across the width (0 = centre,
// 1 = side), y up from the bottom; both sit on the rear face. +X is the car's left.
const THRUSTERS: { name: string; x: number; y: number }[] = [
  { name: 'thruster_left', x: 0.3, y: 0.35 },
  { name: 'thruster_right', x: -0.3, y: 0.35 },
]

const { wheels } = TUNING.car

const centre = (n: Node): vec3 => {
  const { min, max } = getBounds(n)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(SOURCE)
const root = doc.getRoot()
const scene = root.getDefaultScene() ?? root.listScenes()[0]

const findNode = (name: string) => {
  const node = root.listNodes().find((n) => n.getName() === name)
  if (!node) throw new Error(`${SOURCE}: no node named "${name}"`)
  return node
}

// Every source wheel becomes a root-level node with its world transform baked in.
const srcWheels = WHEELS.map(([name]) => clearNodeParent(findNode(name)))
for (const w of srcWheels) {
  const [x, y, z, rw] = w.getRotation()
  if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 1e-6 || Math.abs(rw) < 1 - 1e-6) {
    throw new Error(
      `${SOURCE}: wheel "${w.getName()}" is rotated; only translated wheels are supported`,
    )
  }
}

// Source measurements. Kenney wheel origins sit on the tyre's inner face, so use bounds centres.
const srcCentres = srcWheels.map(centre)
const srcBounds = srcWheels.map((w) => getBounds(w))
const srcRadius = (srcBounds[0].max[1] - srcBounds[0].min[1]) / 2
const srcWidth = srcBounds[0].max[0] - srcBounds[0].min[0]
const srcGround = Math.min(...srcBounds.map((b) => b.min[1]))
const srcFrontZ = mean(FRONT.map((i) => srcCentres[i][2]))
const srcRearZ = mean(REAR.map((i) => srcCentres[i][2]))

// One uniform scale fits the wheelbase, so the wheels sit in the body's arches; the source
// ground line maps onto the physics ground line at rest, keeping the body's ride height.
const s = (frontZ - rearZ) / (srcFrontZ - srcRearZ)
const srcAnchor: vec3 = [mean(srcCentres.map((c) => c[0])), srcGround, (srcFrontZ + srcRearZ) / 2]
const anchor: vec3 = [mean(hubs.map((h) => h[0])), ground, (frontZ + rearZ) / 2]
const fit = (p: vec3): vec3 => [
  anchor[0] + s * (p[0] - srcAnchor[0]),
  anchor[1] + s * (p[1] - srcAnchor[1]),
  anchor[2] + s * (p[2] - srcAnchor[2]),
]

// Everything else in the scene is bodywork: move it under one `body` node, fitted.
const body = doc.createNode('body')
for (const n of scene.listChildren()) {
  if (srcWheels.includes(n)) continue
  scene.removeChild(n)
  const [sx, sy, sz] = n.getScale()
  n.setName(`${n.getName()}_mesh`)
    .setTranslation(fit(n.getTranslation()))
    .setScale([sx * s, sy * s, sz * s])
  body.addChild(n)
}
scene.addChild(body)

// Each wheel node sits at its physics hub; its mesh child is centred on the hub and scaled to
// the physics radius and width.
const wheelScale: vec3 = [
  wheels.width / srcWidth,
  wheels.radius / srcRadius,
  wheels.radius / srcRadius,
]
WHEELS.forEach(([, name], i) => {
  const mesh = srcWheels[i]
  const t = mesh.getTranslation()
  const c = srcCentres[i]
  const [sx, sy, sz] = mesh.getScale()
  scene.removeChild(mesh)
  mesh
    .setName(`${name}_mesh`)
    .setTranslation([
      wheelScale[0] * (t[0] - c[0]),
      wheelScale[1] * (t[1] - c[1]),
      wheelScale[2] * (t[2] - c[2]),
    ])
    .setScale([sx * wheelScale[0], sy * wheelScale[1], sz * wheelScale[2]])
  scene.addChild(doc.createNode(name).setTranslation(hubs[i]).addChild(mesh))
})

const { min, max } = getBounds(body)
const halfWidth = (max[0] - min[0]) / 2
for (const { name, x, y } of THRUSTERS) {
  const pos: vec3 = [(min[0] + max[0]) / 2 + x * halfWidth, min[1] + y * (max[1] - min[1]), min[2]]
  scene.addChild(doc.createNode(name).setTranslation(pos))
}

scene.setName('car')
// A .glb output embeds the texture in its binary chunk.
await io.write(OUTPUT, doc)

const round = (v: number[]) => v.map((n) => +n.toFixed(3)).join(', ')
console.log(`${SOURCE} → ${OUTPUT} (scale ${s.toFixed(3)})`)
console.log(`  body bounds: [${round(min)}] … [${round(max)}]`)
