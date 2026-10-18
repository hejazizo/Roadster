import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  type InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  ShaderMaterial,
  SpotLight,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Floodlight } from '../artData'
import { block, merged, painted } from './geometry'

// Floodlight towers: a mast, a bank of lamps aimed at the pad, and a faint beam of light through
// the night air. Masts, lamp frames and lamps are three instanced meshes, all the beams one
// mesh. Towers marked `spot` also get a real spot light (no shadows); the others light the
// asphalt with a baked pool (nightGround.ts).
const MAST_COLOR = '#3a3f46'
const FRAME_COLOR = '#24282d'
const LAMP_COLOR: [number, number, number] = [10, 9.6, 8.8] // HDR, so the lamps bloom
const LAMP_ROWS = 2
const LAMP_COLUMNS = 4
const MODEL_HEIGHT = 28 // m: the mast is modelled this tall and scaled to each tower's height

const SPOT_COLOR = '#fff4e6'
const SPOT_ILLUMINANCE = 6 // lux at the aim point: each spot's candela is this × its throw²
const SPOT_RANGE = 260 // m, where the light reaches nothing
const SPOT_SPREAD = 22 // m, the lit radius round the aim point
const SPOT_PENUMBRA = 0.55

const BEAM_COLOR = new Color(1, 0.96, 0.9)
const BEAM_INTENSITY = 0.045
const BEAM_TOP_RADIUS = 2 // m, at the lamps
const BEAM_SPREAD = 0.3 // end radius over the beam's length

function mastGeometry() {
  const shaft = new CylinderGeometry(0.35, 0.85, MODEL_HEIGHT - 1.6, 4, 1)
  shaft.rotateY(Math.PI / 4)
  shaft.translate(0, (MODEL_HEIGHT - 1.6) / 2, 0)
  return merged([
    painted(shaft, MAST_COLOR),
    // A service platform under the lamps and a ladder cage up one side.
    block(-1.6, 1.6, MODEL_HEIGHT - 2.4, MODEL_HEIGHT - 2.2, -1.2, 1.2, MAST_COLOR),
    block(-0.25, 0.25, 0, MODEL_HEIGHT - 2.4, 0.75, 0.85, MAST_COLOR),
  ])
}

// The lamp bank, facing +Z: a frame of housings, and the lamps' faces drawn separately.
const LAMP = { w: 1.25, h: 1.1, gap: 0.2 }
function lampCentres() {
  const centres: [number, number][] = []
  for (let r = 0; r < LAMP_ROWS; r++) {
    for (let c = 0; c < LAMP_COLUMNS; c++) {
      centres.push([
        (c - (LAMP_COLUMNS - 1) / 2) * (LAMP.w + LAMP.gap),
        (r - (LAMP_ROWS - 1) / 2) * (LAMP.h + LAMP.gap),
      ])
    }
  }
  return centres
}

function frameGeometry() {
  const width = LAMP_COLUMNS * (LAMP.w + LAMP.gap) + 0.3
  const height = LAMP_ROWS * (LAMP.h + LAMP.gap) + 0.3
  return merged([
    block(-width / 2, width / 2, -height / 2, height / 2, -0.5, -0.3, FRAME_COLOR),
    ...lampCentres().map(([x, y]) =>
      block(
        x - LAMP.w / 2,
        x + LAMP.w / 2,
        y - LAMP.h / 2,
        y + LAMP.h / 2,
        -0.3,
        0.25,
        FRAME_COLOR,
      ),
    ),
  ])
}

function lampGeometry() {
  return merged(
    lampCentres().map(([x, y]) =>
      block(x - 0.52, x + 0.52, y - 0.45, y + 0.45, 0.25, 0.27, LAMP_COLOR),
    ),
  )
}

const UP = new Vector3(0, 1, 0)
const headOf = ({ mast: [x, z], height }: Floodlight) => new Vector3(x, height, z)
const aimOf = ({ aim }: Floodlight) => new Vector3(...aim)

// All the beams: an open cone per tower from its lamps to just short of its aim point, with
// `t` (0 at the lamps, 1 at the end) in the uv's y.
function beamGeometry(lights: Floodlight[]) {
  const cones = lights.map((light) => {
    const head = headOf(light)
    const aim = aimOf(light)
    const length = head.distanceTo(aim) * 0.96
    const cone = new CylinderGeometry(BEAM_TOP_RADIUS, length * BEAM_SPREAD, length, 24, 1, true)
    const toHead = head.clone().sub(aim).normalize()
    cone.applyQuaternion(new Quaternion().setFromUnitVectors(UP, toHead))
    cone.translate(
      ...head
        .clone()
        .addScaledVector(toHead, -length / 2)
        .toArray(),
    )
    return cone
  })
  const g = mergeGeometries(cones)
  for (const cone of cones) cone.dispose()
  if (!g) throw new Error('Floodlights: no beams')
  return g
}

const beamMaterial = () =>
  new ShaderMaterial({
    uniforms: { uColor: { value: BEAM_COLOR }, uIntensity: { value: BEAM_INTENSITY } },
    vertexShader: /* glsl */ `
      varying float vT;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vT = 1.0 - uv.y;
        vNormal = normal;
        vWorld = position;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vT;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 view = normalize(cameraPosition - vWorld);
        // Thick where the beam is seen through its middle, gone at its silhouette.
        float facing = pow(clamp(abs(dot(normalize(vNormal), view)), 0.0, 1.0), 1.5);
        // Clamped: MSAA samples varyings just outside the triangle, and pow() of a negative
        // number is NaN, which the bloom would spread over the whole frame.
        float t = clamp(vT, 0.0, 1.0);
        float along = pow(1.0 - t, 1.6) * smoothstep(0.0, 0.04, t);
        gl_FragColor = vec4(uColor, uIntensity * facing * along);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })

function useInstances(ref: RefObject<InstancedMesh | null>, matrices: Object3D[]) {
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    matrices.forEach((o, i) => {
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [ref, matrices])
}

export default function Floodlights({ lights }: { lights: Floodlight[] }) {
  const masts = useRef<InstancedMesh>(null)
  const frames = useRef<InstancedMesh>(null)
  const lamps = useRef<InstancedMesh>(null)

  const parts = useMemo(
    () => ({
      mast: mastGeometry(),
      frame: frameGeometry(),
      lamp: lampGeometry(),
      beams: beamGeometry(lights),
      metal: new MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.55 }),
      glow: new MeshBasicMaterial({ vertexColors: true, fog: false }),
      beam: beamMaterial(),
    }),
    [lights],
  )

  const placements = useMemo(() => {
    const mastPoses = lights.map((light) => {
      const o = new Object3D()
      o.position.set(light.mast[0], 0, light.mast[1])
      o.scale.set(1, light.height / MODEL_HEIGHT, 1)
      o.rotation.y = Math.atan2(light.aim[0] - light.mast[0], light.aim[2] - light.mast[1])
      return o
    })
    const headPoses = lights.map((light) => {
      const o = new Object3D()
      o.position.copy(headOf(light))
      o.lookAt(aimOf(light))
      return o
    })
    return { mastPoses, headPoses }
  }, [lights])
  useInstances(masts, placements.mastPoses)
  useInstances(frames, placements.headPoses)
  useInstances(lamps, placements.headPoses)

  // Real spot lights for the towers on the stunts, each with its target in the scene.
  const spots = useMemo(
    () =>
      lights
        .filter((light) => light.spot)
        .map((light) => {
          const head = headOf(light)
          const aim = aimOf(light)
          const throwDistance = head.distanceTo(aim)
          const angle = Math.atan(SPOT_SPREAD / throwDistance)
          const spot = new SpotLight(
            SPOT_COLOR,
            SPOT_ILLUMINANCE * throwDistance ** 2,
            SPOT_RANGE,
            angle,
            SPOT_PENUMBRA,
            2,
          )
          spot.position.copy(head)
          spot.target.position.copy(aim)
          return spot
        }),
    [lights],
  )

  return (
    <>
      <instancedMesh
        ref={masts}
        args={[parts.mast, parts.metal, lights.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={frames}
        args={[parts.frame, parts.metal, lights.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={lamps}
        args={[parts.lamp, parts.glow, lights.length]}
        frustumCulled={false}
      />
      <mesh geometry={parts.beams} material={parts.beam} renderOrder={2} frustumCulled={false} />
      {spots.map((spot, i) => (
        <group key={i}>
          <primitive object={spot} />
          <primitive object={spot.target} />
        </group>
      ))}
    </>
  )
}
