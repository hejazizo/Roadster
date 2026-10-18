import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  type InstancedMesh,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  Shape,
} from 'three'
import type { Box } from '../levelData'

// The perimeter walls, dressed: a run of concrete barriers along each wall's inner face and a
// chain-link fence on posts above them, up to the wall's top. The wall boxes keep their
// colliders and aren't drawn. Barriers and posts are instanced.
const BARRIER_LENGTH = 3 // m, one barrier
const BARRIER_HEIGHT = 1.05
const BARRIER_COLOR = '#8e8c86'
const POST_SPACING = 3
const POST_COLOR = '#4a5058'
const FENCE_COLOR = '#a3a9b0'
const MESH_SIZE = 0.5 // m, one chain-link diamond

// Jersey barrier profile (across, up), its inner face at x = 0 and its back at x = 0.62.
function barrierGeometry() {
  const shape = new Shape()
  const outline: [number, number][] = [
    [0, 0],
    [0, 0.08],
    [0.2, 0.3],
    [0.24, BARRIER_HEIGHT],
    [0.38, BARRIER_HEIGHT],
    [0.42, 0.3],
    [0.62, 0.08],
    [0.62, 0],
  ]
  outline.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)))
  const g = new ExtrudeGeometry(shape, { depth: BARRIER_LENGTH - 0.04, bevelEnabled: false })
  g.translate(0, 0, -(BARRIER_LENGTH - 0.04) / 2)
  return g
}

// Diamond chain-link as an alpha map: white wire on black.
function chainLinkTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(size, size)
    ctx.moveTo(size, 0)
    ctx.lineTo(0, size)
    ctx.stroke()
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  texture.anisotropy = 8
  return texture
}

type Run = {
  alongX: boolean // the wall runs along X (else along Z)
  from: number // run extent along its axis
  to: number
  inner: number // the inner face's coordinate across the run
  centre: number // the wall's centre line across the run
  inward: number // +1 or −1: the direction from the wall into the pad, across the run
  top: number // the wall's top
}

// Each wall's inner run, clipped to the pad the walls enclose.
function runs(walls: Box[]): Run[] {
  const cx = walls.reduce((s, w) => s + w.center[0], 0) / walls.length
  const cz = walls.reduce((s, w) => s + w.center[2], 0) / walls.length
  const raw = walls.map(({ center: [x, y, z], size: [sx, sy, sz] }) => {
    const alongX = sx > sz
    const centre = alongX ? z : x
    const half = (alongX ? sz : sx) / 2
    const inward = (alongX ? cz - z : cx - x) > 0 ? 1 : -1
    return { alongX, centre, inner: centre + inward * half, inward, top: y + sy / 2 }
  })
  const extent = (alongX: boolean) => {
    const faces = raw.filter((r) => r.alongX !== alongX).map((r) => r.inner)
    return [Math.min(...faces), Math.max(...faces)] as const
  }
  return raw.map((r) => {
    const [from, to] = extent(r.alongX)
    return { ...r, from, to }
  })
}

// A point on a run: `t` along it, `d` across it from the inner face into the wall.
function at(run: Run, t: number, d: number, y: number): [number, number, number] {
  const across = run.inner - run.inward * d
  return run.alongX ? [t, y, across] : [across, y, t]
}

function fenceGeometry(runs: Run[]) {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const run of runs) {
    const depth = Math.abs(run.inner - run.centre)
    const corners = [
      at(run, run.from, depth, BARRIER_HEIGHT - 0.1),
      at(run, run.to, depth, BARRIER_HEIGHT - 0.1),
      at(run, run.to, depth, run.top),
      at(run, run.from, depth, run.top),
    ]
    const u = (run.to - run.from) / MESH_SIZE
    const v = (run.top - BARRIER_HEIGHT) / MESH_SIZE
    const first = positions.length / 3
    corners.forEach((c) => positions.push(...c))
    uvs.push(0, 0, u, 0, u, v, 0, v)
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

export default function Perimeter({ walls }: { walls: Box[] }) {
  const barriers = useRef<InstancedMesh>(null)
  const posts = useRef<InstancedMesh>(null)

  const layout = useMemo(() => {
    const wallRuns = runs(walls)
    const barrierPoses: Object3D[] = []
    const postPoses: Object3D[] = []
    for (const run of wallRuns) {
      const length = run.to - run.from
      const count = Math.round(length / BARRIER_LENGTH)
      for (let i = 0; i < count; i++) {
        const o = new Object3D()
        o.position.set(...at(run, run.from + (i + 0.5) * (length / count), 0, 0))
        // The profile's +X goes into the wall, its extrusion along the run.
        o.rotation.y = run.alongX
          ? run.inward > 0
            ? Math.PI / 2
            : -Math.PI / 2
          : run.inward > 0
            ? Math.PI
            : 0
        barrierPoses.push(o)
      }
      const depth = Math.abs(run.inner - run.centre)
      for (let t = run.from; t <= run.to + 0.01; t += POST_SPACING) {
        const o = new Object3D()
        o.position.set(...at(run, t, depth, run.top / 2))
        o.scale.y = run.top
        postPoses.push(o)
      }
    }
    return { wallRuns, barrierPoses, postPoses }
  }, [walls])

  const parts = useMemo(
    () => ({
      barrier: barrierGeometry(),
      post: new BoxGeometry(0.12, 1, 0.12),
      fence: fenceGeometry(layout.wallRuns),
      concrete: new MeshStandardMaterial({ color: BARRIER_COLOR, roughness: 0.85 }),
      metal: new MeshStandardMaterial({ color: POST_COLOR, metalness: 0.6, roughness: 0.5 }),
      mesh: new MeshStandardMaterial({
        color: FENCE_COLOR,
        metalness: 0.5,
        roughness: 0.45,
        alphaMap: chainLinkTexture(),
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    }),
    [layout],
  )

  useLayoutEffect(() => {
    for (const [mesh, poses] of [
      [barriers.current, layout.barrierPoses],
      [posts.current, layout.postPoses],
    ] as const) {
      if (!mesh) continue
      poses.forEach((o, i) => {
        o.updateMatrix()
        mesh.setMatrixAt(i, o.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [layout])

  return (
    <>
      <instancedMesh
        ref={barriers}
        args={[parts.barrier, parts.concrete, layout.barrierPoses.length]}
        frustumCulled={false}
        receiveShadow
      />
      <instancedMesh
        ref={posts}
        args={[parts.post, parts.metal, layout.postPoses.length]}
        frustumCulled={false}
      />
      <mesh geometry={parts.fence} material={parts.mesh} />
    </>
  )
}
