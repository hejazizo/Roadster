import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { loopMesh, loopProfile, type Loop } from '../levelData'

// The half-loop's look at night: the collider's triangles shaded smooth along the curve (sharp at
// the edges), and red light strips along its edges that the bloom picks up.
const CREASE_ANGLE = 0.5 // rad: faces meeting at more than this keep a hard edge
const LIP_THICKNESS = 0.3 // m, as in levelData.ts
const STRIP_WIDTH = 0.14 // m

// The visual surface, in loop-local space like loopMesh.
export function loopSurfaceGeometry(loop: Loop) {
  const { vertices, indices } = loopMesh(loop)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(vertices, 3))
  g.setIndex(new BufferAttribute(indices, 1))
  return toCreasedNormals(g.toNonIndexed(), CREASE_ANGLE)
}

// Light strips in loop-local space: along the top of each side lip, along each outer side, and
// across the inverted lip's end.
export function loopStripGeometry(loop: Loop) {
  const { width, lip } = loop
  const { points, angles } = loopProfile(loop)
  // Profile point i moved d m out of the loop (towards its centre for d < 0), as (y, z).
  const offset = (i: number, d: number): [number, number] => [
    points[i][1] - Math.cos(angles[i]) * d,
    points[i][0] + Math.sin(angles[i]) * d,
  ]
  const positions: number[] = []
  const indices: number[] = []
  // A ribbon along the profile between two (x, d) edges.
  const ribbon = (x0: number, d0: number, x1: number, d1: number) => {
    const first = positions.length / 3
    points.forEach((_, i) => {
      const [y0, z0] = offset(i, d0)
      const [y1, z1] = offset(i, d1)
      positions.push(x0, y0, z0, x1, y1, z1)
      if (i > 0) {
        const a = first + 2 * (i - 1)
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    })
  }
  const inner = width / 2
  const outer = width / 2 + LIP_THICKNESS
  const top = -lip - 0.01
  for (const side of [-1, 1]) {
    const mid = (side * (inner + outer)) / 2
    ribbon(mid - (side * STRIP_WIDTH) / 2, top, mid + (side * STRIP_WIDTH) / 2, top)
    const x = side * (outer + 0.01)
    ribbon(x, -lip + 0.08, x, -lip + 0.08 + STRIP_WIDTH)
  }
  // Across the end of the lip, on the shell's end face.
  const last = points.length - 1
  const along = [Math.cos(angles[last]), Math.sin(angles[last])] // (z, y) beyond the lip
  const first = positions.length / 3
  for (const d of [0.12, 0.12 + STRIP_WIDTH * 1.5]) {
    const [y, z] = offset(last, d)
    for (const x of [-outer, outer]) {
      positions.push(x, y + along[1] * 0.01, z + along[0] * 0.01)
    }
  }
  indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  return g
}
