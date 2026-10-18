import { useMemo } from 'react'
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, PlaneGeometry } from 'three'
import type { LevelArt, Paint, PaintArea, PaintLine, XZ } from '../artData'
import type { Box, Level } from '../levelData'
import { offsetLoop, roadGeometry } from '../road'
import { grainTexture, nightGroundMaterial, poolUniforms } from './nightGround'

// The ground at night: the pad's asphalt and the circuit road (the slab's collider stays the
// greybox one), the dark land outside the walls out to the horizon, and the painted markings,
// concrete aprons and patches. All of it shows the floodlights' baked pools.
const ASPHALT = '#3a3c40'
const ROAD = '#303236'
const LAND = '#1b1d18'
const GRAIN_TILE = 4 // m per repeat of the grain texture
const LAND_SIZE = 2400 // m across, centred on the pad
const LAND_DEPTH = 0.06 // m below the pad, so the slab's top hides it there

const PAINT: Record<Paint, string> = {
  white: '#c4c4bd',
  yellow: '#d9a62a',
  red: '#b8261e',
  black: '#141517',
  concrete: '#7a7972',
  patch: '#2f3134',
  joint: '#3b3b38',
}
// Heights above the ground: areas lie under the lines, and road markings above the road.
const AREA_LIFT = 0.012
const LINE_LIFT = 0.022
const ROAD_LIFT = 0.03
const ROAD_LINE_LIFT = 0.04
const ROAD_EDGE_INSET = 0.35 // m from the road's edge to its edge lines
const ROAD_DASH: [number, number] = [3, 5]

type Quad = { corners: [XZ, XZ, XZ, XZ]; y: number; color: string }

function quadsGeometry(quads: Quad[]) {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const c = new Color()
  for (const { corners, y, color } of quads) {
    c.set(color) // sRGB to linear
    const first = positions.length / 3
    for (const [x, z] of corners) {
      positions.push(x, y, z)
      colors.push(c.r, c.g, c.b)
    }
    // Wound so the face points up whichever way the corners go round.
    const [a, b, d] = corners
    const up = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]) < 0
    indices.push(
      ...(up
        ? [first, first + 1, first + 2, first, first + 2, first + 3]
        : [first, first + 2, first + 1, first, first + 3, first + 2]),
    )
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

// A line as one quad, or one per dash.
function lineQuads({ from, to, width, paint, dash }: PaintLine, y: number): Quad[] {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const length = Math.hypot(dx, dz)
  if (length < 1e-6) return []
  const ux = dx / length
  const uz = dz / length
  const sx = (-uz * width) / 2
  const sz = (ux * width) / 2
  const pieces: [number, number][] = []
  if (dash) {
    for (let s = 0; s < length; s += dash[0] + dash[1])
      pieces.push([s, Math.min(s + dash[0], length)])
  } else {
    pieces.push([0, length])
  }
  return pieces.map(([s0, s1]) => {
    const ax = from[0] + ux * s0
    const az = from[1] + uz * s0
    const bx = from[0] + ux * s1
    const bz = from[1] + uz * s1
    return {
      corners: [
        [ax + sx, az + sz],
        [bx + sx, bz + sz],
        [bx - sx, bz - sz],
        [ax - sx, az - sz],
      ],
      y,
      color: PAINT[paint],
    }
  })
}

function areaQuad({ center: [cx, cz], size: [w, l], paint, yaw = 0 }: PaintArea): Quad {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const corner = (x: number, z: number): XZ => [cx + x * c + z * s, cz - x * s + z * c]
  return {
    corners: [
      corner(-w / 2, -l / 2),
      corner(w / 2, -l / 2),
      corner(w / 2, l / 2),
      corner(-w / 2, l / 2),
    ],
    y: AREA_LIFT + (paint === 'black' ? 0.004 : 0), // checker squares over their white band
    color: PAINT[paint],
  }
}

// Lines along a closed loop of points, solid or dashed by arc length.
function loopLines(points: XZ[], paint: Paint, width: number, dash?: [number, number]) {
  const lines: PaintLine[] = []
  const period = dash ? dash[0] + dash[1] : 0
  let s = 0
  points.forEach((from, i) => {
    const to = points[(i + 1) % points.length]
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    if (!dash) {
      lines.push({ from, to, width, paint })
    } else {
      // The painted part of [s, s + length] in each period.
      for (let k = Math.floor(s / period) * period; k < s + length; k += period) {
        const a = Math.max(k, s) - s
        const b = Math.min(k + dash[0], s + length) - s
        if (b <= a) continue
        const lerp = (t: number): XZ => [
          from[0] + ((to[0] - from[0]) * t) / length,
          from[1] + ((to[1] - from[1]) * t) / length,
        ]
        lines.push({ from: lerp(a), to: lerp(b), width, paint })
      }
    }
    s += length
  })
  return lines
}

function slabTop({ center: [x, y, z], size: [sx, sy, sz] }: Box) {
  const g = new PlaneGeometry(sx, sz)
  g.rotateX(-Math.PI / 2)
  g.translate(x, y + sy / 2, z)
  // Uvs in grain tiles, so the texture's scale is the same on any slab.
  const uv = g.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * sx) / GRAIN_TILE, (uv.getY(i) * sz) / GRAIN_TILE)
  }
  return g
}

export default function Ground({ level, art }: { level: Level; art: LevelArt }) {
  const parts = useMemo(() => {
    const grain = grainTexture()
    const asphaltPools = poolUniforms(art.floodlights, 0.35)
    const paintPools = poolUniforms(art.floodlights, 0.15, 0.55)
    const { points, width } = level.road
    const roadLines = art.roadMarkings
      ? [
          ...loopLines(offsetLoop(points, width / 2 - ROAD_EDGE_INSET), 'white', 0.18),
          ...loopLines(offsetLoop(points, -(width / 2 - ROAD_EDGE_INSET)), 'white', 0.18),
          ...loopLines(points, 'yellow', 0.15, ROAD_DASH),
        ]
      : []
    const land = new PlaneGeometry(LAND_SIZE, LAND_SIZE)
    land.rotateX(-Math.PI / 2)
    const [, , pz] = level.ground[0]?.center ?? [0, 0, 0]
    land.translate(0, -LAND_DEPTH, pz)
    return {
      slabs: level.ground.map(slabTop),
      land,
      road: roadGeometry(points, width, ROAD_LIFT),
      areas: quadsGeometry(art.areas.map(areaQuad)),
      lines: quadsGeometry([
        ...art.lines.flatMap((line) => lineQuads(line, LINE_LIFT)),
        ...roadLines.flatMap((line) => lineQuads(line, ROAD_LINE_LIFT)),
      ]),
      asphalt: nightGroundMaterial({ color: ASPHALT, map: grain, roughness: 0.78 }, asphaltPools),
      roadSurface: nightGroundMaterial(
        { color: ROAD, map: grain, roughness: 0.72, side: DoubleSide },
        asphaltPools,
      ),
      landSurface: nightGroundMaterial(
        { color: LAND, roughness: 1 },
        poolUniforms(art.floodlights, 0.6),
      ),
      areaPaint: nightGroundMaterial(
        {
          vertexColors: true,
          roughness: 0.8,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -2,
        },
        paintPools,
      ),
      linePaint: nightGroundMaterial(
        {
          vertexColors: true,
          roughness: 0.6,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -4,
        },
        paintPools,
      ),
    }
  }, [level, art])

  return (
    <>
      {parts.slabs.map((g, i) => (
        <mesh key={i} geometry={g} material={parts.asphalt} receiveShadow />
      ))}
      <mesh geometry={parts.land} material={parts.landSurface} />
      <mesh geometry={parts.road} material={parts.roadSurface} receiveShadow />
      <mesh geometry={parts.areas} material={parts.areaPaint} receiveShadow />
      <mesh geometry={parts.lines} material={parts.linePaint} receiveShadow />
    </>
  )
}
