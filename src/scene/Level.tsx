import { Grid } from '@react-three/drei'
import { ConvexHullCollider, CuboidCollider, RigidBody } from '@react-three/rapier'
import { useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Vector3 } from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import type { Box, Level as LevelData, Ramp } from './testLevel'

const GROUND_COLOR = '#6b8e4e'
const GRID_COLOR = '#55733d'
const GRID_SECTION_COLOR = '#45602f'
const PLATFORM_COLOR = '#9a9a9a'
const WALL_COLOR = '#c8b48a'
const RAMP_COLOR = '#e8892c'
const ROAD_COLOR = '#3a3a3a'
// Small lifts above the ground so overlays don't z-fight with it.
const GRID_LIFT = 0.01
const ROAD_LIFT = 0.03

function BoxPiece({ center, size, color }: Box & { color: string }) {
  const [sx, sy, sz] = size
  return (
    <>
      <CuboidCollider args={[sx / 2, sy / 2, sz / 2]} position={center} />
      <mesh position={center} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} />
      </mesh>
    </>
  )
}

// Wedge corners in ramp-local space: +Z along the run, low edge at the origin, bottom on
// the ground (y = -start.y).
function rampVertices({ start, run, rise, width }: Ramp): Vector3[] {
  const floor = -start[1]
  return [width / 2, -width / 2].flatMap((x) => [
    new Vector3(x, 0, 0),
    new Vector3(x, rise, run),
    new Vector3(x, floor, run),
    ...(floor < 0 ? [new Vector3(x, floor, 0)] : []),
  ])
}

function RampPiece({ ramp }: { ramp: Ramp }) {
  const { points, geometry } = useMemo(() => {
    const vertices = rampVertices(ramp)
    return {
      points: new Float32Array(vertices.flatMap((v) => v.toArray())),
      geometry: new ConvexGeometry(vertices),
    }
  }, [ramp])
  const rotation: [number, number, number] = [0, ramp.yaw, 0]
  return (
    <>
      <ConvexHullCollider args={[points]} position={ramp.start} rotation={rotation} />
      <mesh geometry={geometry} position={ramp.start} rotation={rotation} castShadow receiveShadow>
        <meshStandardMaterial color={RAMP_COLOR} flatShading />
      </mesh>
    </>
  )
}

// Flat ribbon along a closed loop of points, just above the ground.
function Road({ points, width }: LevelData['road']) {
  const geometry = useMemo(() => {
    const positions: number[] = []
    const indices: number[] = []
    const n = points.length
    points.forEach(([x, z], i) => {
      const [px, pz] = points[(i - 1 + n) % n]
      const [nx, nz] = points[(i + 1) % n]
      const len = Math.hypot(nx - px, nz - pz)
      // Side offset: the tangent turned 90° on the ground plane.
      const ox = ((nz - pz) / len) * (width / 2)
      const oz = (-(nx - px) / len) * (width / 2)
      positions.push(x + ox, ROAD_LIFT, z + oz, x - ox, ROAD_LIFT, z - oz)
      const a = 2 * i
      const b = 2 * ((i + 1) % n)
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    })
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }, [points, width])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={ROAD_COLOR} side={DoubleSide} />
    </mesh>
  )
}

export default function Level({ level }: { level: LevelData }) {
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {level.ground.map((piece, i) => (
          <BoxPiece key={`ground-${i}`} {...piece} color={GROUND_COLOR} />
        ))}
        {level.platforms.map((piece, i) => (
          <BoxPiece key={`platform-${i}`} {...piece} color={PLATFORM_COLOR} />
        ))}
        {level.walls.map((piece, i) => (
          <BoxPiece key={`wall-${i}`} {...piece} color={WALL_COLOR} />
        ))}
        {level.ramps.map((ramp, i) => (
          <RampPiece key={`ramp-${i}`} ramp={ramp} />
        ))}
      </RigidBody>
      {/* Grid lines make motion visible on the flat ground. */}
      {level.ground.map(({ center: [x, y, z], size: [sx, sy, sz] }, i) => (
        <Grid
          key={i}
          args={[sx, sz]}
          position={[x, y + sy / 2 + GRID_LIFT, z]}
          cellSize={2}
          cellColor={GRID_COLOR}
          sectionSize={10}
          sectionColor={GRID_SECTION_COLOR}
          fadeDistance={150}
        />
      ))}
      <Road {...level.road} />
    </>
  )
}
