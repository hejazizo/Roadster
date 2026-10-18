import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  type Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Points,
  PointsMaterial,
  Vector3,
} from 'three'
import { type LevelArt, type Prop, type PropKind, seeded } from '../artData'
import type { Level } from '../levelData'
import { type ArtColor, block, merged, painted, placement } from './geometry'

// Scenery outside the walls: a viewing stand, hangars, an office, test structures, and the flat
// Texas horizon (a dark treeline with farms, radio masts and a town's lights). Everything solid
// is one mesh, every lit window and lamp one more, the red aviation beacons and the town's
// lights two sets of points. None of it has a collider.
const CONCRETE = '#5f6268'
const STEEL = '#3d434b'
const DARK_STEEL = '#2a2f35'
const ROOF = '#353a41'
const SKYLINE = '#0a0c0e'
const WINDOW: [number, number, number] = [2.4, 1.9, 1.3] // HDR warm light
const LAMP: [number, number, number] = [6, 5.6, 5] // HDR
const BEACON_COLOR = new Color(3, 0.15, 0.08)
const BEACON_PERIOD = 1.6 // s per blink
const TOWN_COLOR = new Color(2.2, 1.5, 0.8)

type Parts = { solid: BufferGeometry[]; glow: BufferGeometry[]; beacons: Vector3[] }

const cylinder = (r0: number, r1: number, h: number, y: number, color: ArtColor, segments = 16) => {
  const g = new CylinderGeometry(r1, r0, h, segments, 1)
  g.translate(0, y + h / 2, 0)
  return painted(g, color)
}

// Each prop in its own frame (x across, y up, z along); `parts` is filled in that frame.
const BUILDERS: Record<PropKind, (parts: Parts) => void> = {
  // Seven rows of seats rising away from +X, under a roof on posts, lamps along its front.
  stand: ({ solid, glow }) => {
    const length = 44
    for (let row = 0; row < 7; row++) {
      const x = -row * 0.9
      solid.push(block(x - 0.9, x, 0, 0.55 * (row + 1), -length / 2, length / 2, CONCRETE))
    }
    solid.push(block(-7.2, -6.3, 0, 7.4, -length / 2, length / 2, CONCRETE))
    solid.push(block(-7.4, 1.4, 7.4, 7.8, -length / 2 - 1, length / 2 + 1, ROOF))
    for (let z = -length / 2; z <= length / 2; z += 11) {
      solid.push(block(0.9, 1.2, 0, 7.4, z - 0.15, z + 0.15, DARK_STEEL))
    }
    for (let z = -length / 2 + 3; z < length / 2; z += 5) {
      glow.push(block(0.6, 1.2, 7.25, 7.38, z - 1, z + 1, LAMP))
    }
  },
  // A barrel roof over low walls, the doors facing +Z with light showing under them.
  hangar: ({ solid, glow }) => {
    const width = 46
    const depth = 36
    solid.push(block(-width / 2, width / 2, 0, 9, -depth / 2, depth / 2, STEEL))
    const roof = new CylinderGeometry(
      width / 2,
      width / 2,
      depth,
      24,
      1,
      false,
      -Math.PI / 2,
      Math.PI,
    )
    roof.rotateX(-Math.PI / 2)
    roof.scale(1, 0.38, 1)
    roof.translate(0, 9, 0)
    solid.push(painted(roof, ROOF))
    solid.push(
      block(-width / 2 + 3, width / 2 - 3, 0.3, 8.5, depth / 2, depth / 2 + 0.2, DARK_STEEL),
    )
    glow.push(block(-width / 2 + 3, width / 2 - 3, 0, 0.3, depth / 2, depth / 2 + 0.25, WINDOW))
    for (const x of [-width / 2 + 5, 0, width / 2 - 5]) {
      glow.push(block(x - 0.6, x + 0.6, 9.4, 9.8, depth / 2, depth / 2 + 0.5, LAMP))
    }
  },
  // Two storeys with a row of windows each side (some lit) and a mast on the roof.
  office: ({ solid, glow, beacons }) => {
    const random = seeded(7)
    solid.push(block(-14, 14, 0, 8, -6, 6, CONCRETE))
    solid.push(block(-14.3, 14.3, 8, 8.5, -6.3, 6.3, ROOF))
    for (const floor of [1.4, 5.1]) {
      for (let x = -12; x <= 12; x += 3) {
        if (random() < 0.45) continue
        for (const z of [-6.05, 6.05])
          glow.push(block(x - 1, x + 1, floor, floor + 1.6, z - 0.05, z + 0.05, WINDOW))
      }
    }
    solid.push(cylinder(0.3, 0.12, 14, 8.5, DARK_STEEL, 6))
    beacons.push(new Vector3(0, 22.8, 0))
  },
  waterTower: ({ solid, beacons }) => {
    for (const [x, z] of [
      [-4, -4],
      [4, -4],
      [-4, 4],
      [4, 4],
    ]) {
      solid.push(block(x - 0.3, x + 0.3, 0, 26, z - 0.3, z + 0.3, DARK_STEEL))
    }
    solid.push(cylinder(6, 6, 7, 26, STEEL, 20))
    const cap = new ConeGeometry(6.2, 3, 20)
    cap.translate(0, 34.5, 0)
    solid.push(painted(cap, ROOF))
    beacons.push(new Vector3(0, 36.4, 0))
  },
  // Four silos in a row and an elevator at the end.
  silos: ({ solid, beacons }) => {
    for (let i = 0; i < 4; i++) {
      const x = i * 10
      const g = new CylinderGeometry(4.6, 4.6, 24, 18)
      g.translate(x, 12, 0)
      solid.push(painted(g, STEEL))
      const cap = new ConeGeometry(4.8, 3, 18)
      cap.translate(x, 25.5, 0)
      solid.push(painted(cap, ROOF))
    }
    solid.push(block(36, 43, 0, 42, -3.5, 3.5, CONCRETE))
    beacons.push(new Vector3(39.5, 42.6, 0))
  },
  // A test rig: two lattice towers with a beam across their tops and work lights.
  gantry: ({ solid, glow, beacons }) => {
    for (const x of [-16, 16]) {
      for (const [dx, dz] of [
        [-1.2, -1.2],
        [1.2, -1.2],
        [-1.2, 1.2],
        [1.2, 1.2],
      ]) {
        solid.push(block(x + dx - 0.15, x + dx + 0.15, 0, 36, dz - 0.15, dz + 0.15, DARK_STEEL))
      }
      for (let y = 4; y < 36; y += 6)
        solid.push(block(x - 1.3, x + 1.3, y, y + 0.25, -1.3, 1.3, DARK_STEEL))
      beacons.push(new Vector3(x, 37, 0))
    }
    solid.push(block(-17.5, 17.5, 33, 35, -1, 1, STEEL))
    for (const x of [-8, 0, 8]) glow.push(block(x - 0.8, x + 0.8, 32.6, 32.9, -0.5, 0.5, LAMP))
  },
  radioMast: ({ solid, beacons }) => {
    solid.push(cylinder(1.2, 0.25, 120, 0, DARK_STEEL, 4))
    for (const y of [40, 80, 120.5]) beacons.push(new Vector3(0, y, 0))
  },
}

function buildProp(prop: Prop, into: Parts, matrix: Matrix4) {
  const local: Parts = { solid: [], glow: [], beacons: [] }
  BUILDERS[prop.kind](local)
  into.solid.push(...local.solid.map((g) => g.applyMatrix4(matrix)))
  into.glow.push(...local.glow.map((g) => g.applyMatrix4(matrix)))
  into.beacons.push(...local.beacons.map((v) => v.applyMatrix4(matrix)))
}

// The horizon: a ring of dark treelines broken by fields, with a few farm buildings, centred on
// the pad and far enough out that the fog swallows its detail.
function skyline(centre: [number, number], parts: Parts) {
  const random = seeded(1015)
  const positions: number[] = []
  const steps = 900
  let height = 8
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const r = 620 + 90 * Math.sin(a * 3 + 1) + 40 * Math.sin(a * 11)
    // A random walk, flattened to nothing in the gaps between tree belts.
    height = Math.min(18, Math.max(0, height + (random() - 0.5) * 5))
    const belt = Math.sin(a * 7 + 2) + Math.sin(a * 17) * 0.5 > -0.4 ? 1 : 0
    const h = belt * (height + 4 * random())
    const x = centre[0] + Math.cos(a) * r
    const z = centre[1] + Math.sin(a) * r
    positions.push(x, -0.1, z, x, Math.max(h, 0.5), z)
    if (belt && random() < 0.02) {
      // A farm a little in front of the trees.
      const barn = block(-6, 6, 0, 7 + random() * 5, -4, 4, SKYLINE)
      const bx = centre[0] + Math.cos(a) * (r - 25)
      const bz = centre[1] + Math.sin(a) * (r - 25)
      parts.solid.push(barn.applyMatrix4(placement(bx, 0, bz, -a)))
    }
  }
  // A strip of quads (the material is double-sided).
  const index: number[] = []
  for (let i = 0; i < steps; i++) {
    const a = 2 * i
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setIndex(index)
  parts.solid.push(painted(g, SKYLINE))
}

// The town's lights: a scatter of points low on the horizon in its direction.
function townLights(centre: [number, number], [tx, tz]: [number, number]) {
  const random = seeded(254)
  const heading = Math.atan2(tz, tx)
  const positions: number[] = []
  for (let i = 0; i < 260; i++) {
    const a = heading + (random() - 0.5) * 0.7 * (0.3 + random())
    const r = 700 + random() * 120
    positions.push(
      centre[0] + Math.cos(a) * r,
      0.5 + random() * random() * 14,
      centre[1] + Math.sin(a) * r,
    )
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return g
}

export default function Scenery({ art, level }: { art: LevelArt; level: Level }) {
  const scene = useMemo(() => {
    // Centred on the level's ground.
    const [cx, , cz] = level.ground[0]?.center ?? [0, 0, 0]
    const centre: [number, number] = [cx, cz]
    const parts: Parts = { solid: [], glow: [], beacons: [] }
    for (const prop of art.props) {
      buildProp(prop, parts, placement(prop.position[0], 0, prop.position[1], prop.yaw))
    }
    skyline(centre, parts)
    // A beacon on top of every floodlight tower.
    for (const { mast, height } of art.floodlights)
      if (height > 10) parts.beacons.push(new Vector3(mast[0], height + 2, mast[1]))
    const beacons = new BufferGeometry().setFromPoints(parts.beacons)
    return {
      solid: merged(parts.solid),
      glow: merged(parts.glow),
      beacons,
      town: townLights(centre, art.townGlow),
      solidMaterial: new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.2,
        side: DoubleSide,
      }),
      glowMaterial: new MeshBasicMaterial({ vertexColors: true }),
      beaconMaterial: new PointsMaterial({
        color: BEACON_COLOR,
        size: 4,
        sizeAttenuation: false,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
      townMaterial: new PointsMaterial({
        color: TOWN_COLOR,
        size: 1.6,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        fog: false,
      }),
    }
  }, [art, level])

  // Aviation beacons blink together: a short flash each period.
  const beacons = useRef<Points>(null)
  useFrame(({ clock }) => {
    const phase = (clock.elapsedTime % BEACON_PERIOD) / BEACON_PERIOD
    const material = beacons.current?.material as PointsMaterial | undefined
    if (material) material.opacity = phase < 0.45 ? 1 : 0.12
  })

  return (
    <>
      <mesh geometry={scene.solid} material={scene.solidMaterial} />
      <mesh geometry={scene.glow} material={scene.glowMaterial} />
      <points
        ref={beacons}
        geometry={scene.beacons}
        material={scene.beaconMaterial}
        frustumCulled={false}
      />
      <points geometry={scene.town} material={scene.townMaterial} frustumCulled={false} />
    </>
  )
}
