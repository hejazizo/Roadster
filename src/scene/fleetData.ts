// The parked vehicles of the Proving Ground's fleet jump (M16.4): generic look-alikes by size
// and silhouette, without badges or names. Each shape's colliders are a few boxes following
// its silhouette, so the car only hits what it can see; `scripts/build-fleet-models.ts` builds
// the matching models (public/models/fleet/*.glb) from the same numbers.
// Local axes as in docs/car-model-spec.md: nose towards +Z, centred on X and Z, ground at y = 0.
import { box, type Box, type Vec3 } from './levelData'

export type FleetModel = 'sedan' | 'crossover' | 'pickup' | 'pod' | 'semi'

export type FleetShape = {
  size: Vec3 // overall width × height × length (m)
  boxes: Box[] // colliders, local
}

// A box spanning the full width `w` (or narrower) from the ground to `top`, between z0 and z1.
const part = (w: number, top: number, z0: number, z1: number, bottom = 0) =>
  box(-w / 2, w / 2, z0, z1, bottom, top)

export const FLEET_SHAPES: Record<FleetModel, FleetShape> = {
  // Three-box saloon: body to the belt line, cabin set back from the nose.
  sedan: {
    size: [1.9, 1.45, 4.7],
    boxes: [part(1.9, 0.95, -2.35, 2.35), part(1.6, 1.45, -1.25, 0.85)],
  },
  // Taller two-box: the roof runs to the tail.
  crossover: {
    size: [1.9, 1.6, 4.8],
    boxes: [part(1.9, 1.0, -2.4, 2.4), part(1.7, 1.6, -2.15, 0.95)],
  },
  // Angular pickup: cab behind a short hood, open bed at the rear.
  pickup: {
    size: [2.2, 1.8, 5.7],
    boxes: [part(2.2, 1.15, -2.85, 2.85), part(2.0, 1.8, -0.35, 1.45)],
  },
  // Two-seat robotaxi pod: a short capsule.
  pod: {
    size: [1.9, 1.5, 3.6],
    boxes: [part(1.9, 0.9, -1.8, 1.8), part(1.7, 1.5, -1.25, 1.05)],
  },
  // Semi tractor: tall cab over the front axle, chassis and fifth-wheel deck behind it.
  semi: {
    size: [2.6, 4.0, 7.0],
    boxes: [part(2.4, 1.35, -3.5, 3.5), part(2.6, 4.0, 0.9, 3.5)],
  },
}

// A parked vehicle placed in the level: its model at `position` (ground centre) facing `yaw`,
// and its colliders in world space.
export type ParkedCar = { model: FleetModel; position: Vec3; yaw: number; boxes: Box[] }

// Places a shape. Box colliders stay axis-aligned, so `yaw` must be a multiple of 90°.
export function parkCar(model: FleetModel, position: Vec3, yaw: number): ParkedCar {
  const c = Math.round(Math.cos(yaw))
  const s = Math.round(Math.sin(yaw))
  const boxes = FLEET_SHAPES[model].boxes.map(({ center: [x, y, z], size: [sx, sy, sz] }) => ({
    // Rotation about Y: x' = x cos + z sin, z' = −x sin + z cos.
    center: [position[0] + x * c + z * s, position[1] + y, position[2] - x * s + z * c] as Vec3,
    size: (s === 0 ? [sx, sy, sz] : [sz, sy, sx]) as Vec3,
  }))
  return { model, position, yaw, boxes }
}
