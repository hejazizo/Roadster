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
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { loopStripGeometry, loopSurfaceGeometry } from './art/loopArt'
import Fleet from './Fleet'
import {
  loopMesh,
  rampVertices,
  type Box,
  type Level as LevelData,
  type Loop,
  type Ramp,
} from './levelData'
import { roadGeometry } from './road'

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
const ROAD_COLOR = '#3a3a3a'
// The half-loop with level art: smooth metallic grey with red light strips (HDR, so they bloom).
const LOOP_METAL = '#8e959d'
const LOOP_STRIP = new Color(6, 0.22, 0.12)
// Small lifts above the ground so overlays don't z-fight with it.
const GRID_LIFT = 0.01
const ROAD_LIFT = 0.03

// A box collider, drawn unless the level art draws it (`color` null).
function BoxPiece({ center, size, color }: Box & { color: string | null }) {
  const [sx, sy, sz] = size
  return (
    <>
      <CuboidCollider args={[sx / 2, sy / 2, sz / 2]} position={center} />
      {color && (
        <mesh position={center} castShadow receiveShadow>
          <boxGeometry args={size} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
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

// The half-loop: a trimesh collider and a mesh from the same triangles; with level art, shaded
// smooth in metal, with red light strips along its edges.
function LoopPiece({ loop, art }: { loop: Loop; art: boolean }) {
  const { rapier } = useRapier()
  const { vertices, indices, geometry, material, strips } = useMemo(() => {
    const mesh = loopMesh(loop)
    if (art) {
      return {
        ...mesh,
        geometry: loopSurfaceGeometry(loop),
        material: new MeshStandardMaterial({ color: LOOP_METAL, metalness: 0.7, roughness: 0.32 }),
        strips: loopStripGeometry(loop),
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(mesh.vertices, 3))
    g.setIndex(new BufferAttribute(mesh.indices, 1))
    const greybox = new MeshStandardMaterial({ color: RAMP_COLOR, flatShading: true })
    return { ...mesh, geometry: g, material: greybox, strips: null }
  }, [loop, art])
  const stripMaterial = useMemo(
    () => new MeshBasicMaterial({ color: LOOP_STRIP, side: DoubleSide }),
    [],
  )
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
      <mesh
        geometry={geometry}
        material={material}
        position={loop.start}
        rotation={rotation}
        castShadow
        receiveShadow
      />
      {strips && (
        <mesh
          geometry={strips}
          material={stripMaterial}
          position={loop.start}
          rotation={rotation}
        />
      )}
    </>
  )
}

// Flat ribbon along a closed loop of points, just above the ground.
function Road({ points, width }: LevelData['road']) {
  const geometry = useMemo(() => roadGeometry(points, width, ROAD_LIFT), [points, width])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={ROAD_COLOR} side={DoubleSide} />
    </mesh>
  )
}

// The level's colliders and its greybox look. With level art (src/scene/art), the ground, walls
// and road are drawn by the art instead and the half-loop gets its art materials.
export default function Level({ level }: { level: LevelData }) {
  const colors = SURFACE_COLORS[level.surface]
  const art = level.art !== undefined
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {level.ground.map((piece, i) => (
          <BoxPiece key={`ground-${i}`} {...piece} color={art ? null : colors.ground} />
        ))}
        {level.platforms.map((piece, i) => (
          <BoxPiece key={`platform-${i}`} {...piece} color={PLATFORM_COLOR} />
        ))}
        {level.walls.map((piece, i) => (
          <BoxPiece key={`wall-${i}`} {...piece} color={art ? null : WALL_COLOR} />
        ))}
        {level.ramps.map((ramp, i) => (
          <RampPiece key={`ramp-${i}`} ramp={ramp} />
        ))}
        {level.loops.map((loop, i) => (
          <LoopPiece key={`loop-${i}`} loop={loop} art={art} />
        ))}
      </RigidBody>
      <Fleet cars={level.fleet} />
      {/* Grid lines make motion visible on the flat ground. */}
      {!art &&
        level.ground.map(({ center: [x, y, z], size: [sx, sy, sz] }, i) => (
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
      {!art && <Road {...level.road} />}
    </>
  )
}
