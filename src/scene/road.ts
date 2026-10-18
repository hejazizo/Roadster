import { BufferGeometry, Float32BufferAttribute } from 'three'

type Point = [number, number]

// A closed loop of points on the XZ plane moved `offset` m sideways: to the left of the
// direction of travel for a positive offset.
export function offsetLoop(points: Point[], offset: number): Point[] {
  const n = points.length
  return points.map(([x, z], i) => {
    const [px, pz] = points[(i - 1 + n) % n]
    const [nx, nz] = points[(i + 1) % n]
    const len = Math.hypot(nx - px, nz - pz)
    // The tangent turned 90° on the ground plane.
    return [x + ((nz - pz) / len) * offset, z - ((nx - px) / len) * offset]
  })
}

// A flat ribbon `width` m wide along a closed loop of points, `lift` m above the ground.
// Its faces point down or up depending on the loop's direction, so draw it double-sided.
export function roadGeometry(points: Point[], width: number, lift: number) {
  const left = offsetLoop(points, width / 2)
  const right = offsetLoop(points, -width / 2)
  const positions: number[] = []
  const indices: number[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    positions.push(left[i][0], lift, left[i][1], right[i][0], lift, right[i][1])
    const a = 2 * i
    const b = 2 * ((i + 1) % n)
    indices.push(a, a + 1, b, b, a + 1, b + 1)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}
