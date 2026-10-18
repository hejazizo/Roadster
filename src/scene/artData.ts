// Level art (M16.6): a visual layer over a level's greybox colliders, as data. Nothing here has
// a collider, so the physics and the headless sim never see it. A level without `art` keeps
// the greybox look and the day sky. src/scene/art/ renders it.
// World axes as in levelData.ts: −Z is "north", +X is east, ground level is y = 0.
import type { Vec3 } from './levelData'

export type XZ = [number, number]

// What a painted mark or ground area is made of; the colours live with the renderer.
export type Paint = 'white' | 'yellow' | 'red' | 'black' | 'concrete' | 'patch' | 'joint'

// A straight painted line on the ground, solid or dashed (`dash`: m painted, m gap).
export type PaintLine = { from: XZ; to: XZ; width: number; paint: Paint; dash?: [number, number] }

// A rectangle on the ground: a concrete apron, an asphalt patch, a checker square.
export type PaintArea = { center: XZ; size: XZ; paint: Paint; yaw?: number }

// A floodlight tower: a mast standing at `mast` with a bank of lamps `height` m up, aimed at
// `aim`. A few are real spot lights (`spot`); the rest light the asphalt with a baked pool.
export type Floodlight = { mast: XZ; height: number; aim: Vec3; spot?: boolean }

// Scenery outside the walls, built in code from simple shapes (src/scene/art/Scenery.tsx).
export type PropKind =
  | 'stand' // a covered viewing stand, its seats facing +X before `yaw`
  | 'hangar' // a barrel-roofed hangar, doors facing +Z before `yaw`
  | 'office' // a two-storey building with lit windows and a mast
  | 'waterTower'
  | 'silos' // a row of grain silos and an elevator
  | 'gantry' // a test rig: two lattice towers and a beam
  | 'radioMast' // a tall, thin mast with red lights
export type Prop = { kind: PropKind; position: XZ; yaw: number }

export type LevelArt = {
  moon: Vec3 // direction towards the moon, the night's key light and only shadow caster
  townGlow: XZ // horizontal direction of the nearest town: the sky glows there, its lights show
  floodlights: Floodlight[]
  areas: PaintArea[]
  lines: PaintLine[]
  props: Prop[]
  roadMarkings: boolean // edge lines and a dashed centre line on the level's circuit road
}

// --- Helpers for laying out markings ------------------------------------------------------

// The four sides of an axis-aligned rectangle, as lines centred on its edges.
export function outline(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  width: number,
  paint: Paint,
): PaintLine[] {
  const h = width / 2
  return [
    { from: [x0 - h, z0], to: [x1 + h, z0], width, paint },
    { from: [x0 - h, z1], to: [x1 + h, z1], width, paint },
    { from: [x0, z0], to: [x0, z1], width, paint },
    { from: [x1, z0], to: [x1, z1], width, paint },
  ]
}

// Diagonal stripes across an axis-aligned rectangle, `spacing` m apart along Z.
export function hatch(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  spacing: number,
  width: number,
  paint: Paint,
): PaintLine[] {
  const lines: PaintLine[] = []
  const lo = Math.min(z0, z1)
  const hi = Math.max(z0, z1)
  const run = x1 - x0 // stripes rise 45°: one metre of z per metre of x
  for (let z = lo - run; z < hi; z += spacing) {
    // Clip the stripe from (x0, z) to (x1, z + run) to the rectangle.
    const a = Math.max(0, lo - z)
    const b = Math.min(run, hi - z)
    if (b - a < 0.5) continue
    lines.push({ from: [x0 + a, z + a], to: [x0 + b, z + b], width, paint })
  }
  return lines
}

// A chevron pointing along −Z (north), its tip at (x, z).
export function chevron(
  x: number,
  z: number,
  halfWidth: number,
  depth: number,
  width: number,
  paint: Paint,
): PaintLine[] {
  return [
    { from: [x - halfWidth, z + depth], to: [x, z], width, paint },
    { from: [x + halfWidth, z + depth], to: [x, z], width, paint },
  ]
}

// A circle of `segments` straight pieces.
export function circle(
  x: number,
  z: number,
  radius: number,
  width: number,
  paint: Paint,
  segments = 48,
): PaintLine[] {
  return Array.from({ length: segments }, (_, i): PaintLine => {
    const a = (i / segments) * Math.PI * 2
    const b = ((i + 1) / segments) * Math.PI * 2
    return {
      from: [x + Math.cos(a) * radius, z + Math.sin(a) * radius],
      to: [x + Math.cos(b) * radius, z + Math.sin(b) * radius],
      width,
      paint,
    }
  })
}

// A two-row checkered band across X at z, from x0 to x1, in squares of `square` m (the black
// squares; the white ones are the band under them).
export function checker(x0: number, x1: number, z: number, square: number): PaintArea[] {
  const areas: PaintArea[] = [
    { center: [(x0 + x1) / 2, z], size: [x1 - x0, 2 * square], paint: 'white' },
  ]
  const count = Math.round((x1 - x0) / square)
  for (let i = 0; i < count; i++) {
    for (let row = 0; row < 2; row++) {
      if ((i + row) % 2) continue
      const cx = x0 + (i + 0.5) * square
      const cz = z + (row - 0.5) * square
      areas.push({ center: [cx, cz], size: [square, square], paint: 'black' })
    }
  }
  return areas
}

// Expansion joints across a concrete area: dark lines every `spacing` m both ways.
export function joints(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  spacing: number,
): PaintLine[] {
  const lines: PaintLine[] = []
  for (let x = x0 + spacing; x < x1 - 0.1; x += spacing) {
    lines.push({ from: [x, z0], to: [x, z1], width: 0.06, paint: 'joint' })
  }
  for (let z = z0 + spacing; z < z1 - 0.1; z += spacing) {
    lines.push({ from: [x0, z], to: [x1, z], width: 0.06, paint: 'joint' })
  }
  return lines
}

// A small seeded random generator (mulberry32), so scattered art is the same on every load.
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
