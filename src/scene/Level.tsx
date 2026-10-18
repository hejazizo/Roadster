import { Grid } from '@react-three/drei'
import {
  ConvexHullCollider,
  CuboidCollider,
  RigidBody,
  TrimeshCollider,
  useRapier,
  type TrimeshArgs,
} from '@react-three/rapier'
import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, Float32BufferAttribute, Vector3 } from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import {
  loopMesh,
  rampVertices,
  type Box,
  type Level as LevelData,
  type Loop,
  type Ramp,
} from './levelData'

const SURFACE_COLORS: Record<
  LevelData['surface'],
  { ground: string; grid: string; section: string }
> = {
  grass: { ground: '#6b8e4e', grid: '#55733d', section: '#45602f' },
  asphalt: { ground: '#4b4e53', grid: '#585c62', section: '#666a71' },
}
const PLATFORM_COLOR = '#9a9a9a'
const WALL_COLOR = '#c8b48a'
const RAMP_COLOR = '#e8892c'
const FLEET_COLOR = '#5d86b0'
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

function RampPiece({ ramp }: { ramp: Ramp }) {
  const { points, geometry } = useMemo(() => {
    const vertices = rampVertices(ramp).map((v) => new Vector3(...v))
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

// The half-loop: a trimesh collider and a mesh from the same triangles.
function LoopPiece({ loop }: { loop: Loop }) {
  const { rapier } = useRapier()
  const { vertices, indices, geometry } = useMemo(() => {
    const mesh = loopMesh(loop)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(mesh.vertices, 3))
    g.setIndex(new BufferAttribute(mesh.indices, 1))
    return { ...mesh, geometry: g }
  }, [loop])
  const rotation: [number, number, number] = [0, loop.yaw, 0]
  return (
    <>
      {/* Without FIX_INTERNAL_EDGES a scraping chassis catches on triangle edges and stops
          dead on the climb. The args go straight to Rapier's ColliderDesc.trimesh, which takes
          the flags third; the library's type only lists the first two. */}
      <TrimeshCollider
        args={[vertices, indices, rapier.TriMeshFlags.FIX_INTERNAL_EDGES] as unknown as TrimeshArgs}
        position={loop.start}
        rotation={rotation}
      />
      <mesh geometry={geometry} position={loop.start} rotation={rotation} castShadow receiveShadow>
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
  const colors = SURFACE_COLORS[level.surface]
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {level.ground.map((piece, i) => (
          <BoxPiece key={`ground-${i}`} {...piece} color={colors.ground} />
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
        {level.loops.map((loop, i) => (
          <LoopPiece key={`loop-${i}`} loop={loop} />
        ))}
        {level.fleet.map((piece, i) => (
          <BoxPiece key={`fleet-${i}`} {...piece} color={FLEET_COLOR} />
        ))}
      </RigidBody>
      {/* Grid lines make motion visible on the flat ground. */}
      {level.ground.map(({ center: [x, y, z], size: [sx, sy, sz] }, i) => (
        <Grid
          key={i}
          args={[sx, sz]}
          position={[x, y + sy / 2 + GRID_LIFT, z]}
          cellSize={2}
          cellColor={colors.grid}
          sectionSize={10}
          sectionColor={colors.section}
          fadeDistance={150}
        />
      ))}
      <Road {...level.road} />
    </>
  )
}
