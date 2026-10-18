import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Building blocks for the level art: plain shapes, each painted one colour per vertex, so a whole
// set of them merges into one mesh and draws in one call.

// A colour in linear values: sRGB strings convert, and [r, g, b] is taken as linear, so it may go
// above 1 for HDR glow that the bloom picks up.
export type ArtColor = string | [number, number, number]
const toLinear = (color: ArtColor) =>
  typeof color === 'string' ? new Color(color) : new Color(color[0], color[1], color[2])

// Bakes `matrix` into a flat-shaded, non-indexed copy of `geometry` coloured `color`.
export function painted(geometry: BufferGeometry, color: ArtColor, matrix?: Matrix4) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  geometry.dispose()
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position') g.deleteAttribute(name)
  }
  if (matrix) g.applyMatrix4(matrix)
  g.computeVertexNormals()
  const c = toLinear(color)
  const colors = new Float32Array(g.getAttribute('position').count * 3)
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i)
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}

// A box between the given extents.
export function block(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: ArtColor,
) {
  const g = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0)
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  return painted(g, color)
}

const UP = new Vector3(0, 1, 0)

// Places local geometry in the world: rotated `yaw` about Y, then moved to (x, y, z).
export const placement = (x: number, y: number, z: number, yaw = 0) =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromAxisAngle(UP, yaw),
    new Vector3(1, 1, 1),
  )

// Merges painted parts (position, normal, color) into one geometry.
export function merged(parts: BufferGeometry[]) {
  const g = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  if (!g) throw new Error('Level art: parts with different attributes')
  g.computeBoundingSphere()
  return g
}
