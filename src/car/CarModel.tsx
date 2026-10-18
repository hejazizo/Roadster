import { useGLTF } from '@react-three/drei'
import { useImperativeHandle, useLayoutEffect, useMemo, type RefObject } from 'react'
import {
  Quaternion,
  Vector3,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three'
import { CAR_MODEL_URL } from '../config/assets'
import { TUNING } from '../config/tuning'
import { paintColor, usePaintStore } from '../state/paintStore'
import ThrusterFlame from '../vfx/ThrusterFlame'

const { wheels, suspension } = TUNING.car

// Node names from docs/car-model-spec.md. Wheels are in the order of TUNING.car.wheels.positions.
const WHEEL_NODES = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']
const THRUSTER_PREFIX = 'thruster'
// The recolourable material (optional): its base colour is set from the chosen paint.
const PAINT_MATERIAL = 'paint'
// The tail lights (optional): brightened while braking.
const TAIL_LIGHT_MATERIAL = 'tail_light'
// Dev check: wheel hubs further than this (m) from the physics wheels get a warning.
const HUB_TOLERANCE = 0.05

type Pose = { position: Vector3; quaternion: Quaternion }

type CarParts = {
  // Bodywork: everything in the model except the wheels.
  body: Object3D
  wheels: (Object3D | undefined)[]
  thrusters: Pose[]
  paint: MeshStandardMaterial | null
  tailLight: MeshStandardMaterial | null
}

// Warns about a model that breaks the spec, so a swapped-in model fails loudly in dev.
function checkWheel(name: string, node: Object3D | undefined, root: Object3D, i: number) {
  if (!node) {
    console.warn(`Car model: no "${name}" node, so that wheel isn't drawn (docs/car-model-spec.md)`)
    return
  }
  if (node.parent !== root) console.warn(`Car model: "${name}" should be a root node`)
  const [x, y, z] = wheels.positions[i]
  const d = node.position.distanceTo(new Vector3(x, y - suspension.restLength, z))
  if (d > HUB_TOLERANCE) {
    console.warn(`Car model: "${name}" hub is ${d.toFixed(2)} m from its physics wheel`)
  }
}

function splitModel(scene: Group): CarParts {
  const root = scene.clone()
  // The clone shares materials with the loader's cache, so the paint and tail lights,
  // which change at runtime, get their own copies.
  let paint: MeshStandardMaterial | null = null
  let tailLight: MeshStandardMaterial | null = null
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    const material = mesh.material as MeshStandardMaterial
    if (material.name === PAINT_MATERIAL) {
      paint ??= material.clone()
      mesh.material = paint
    } else if (material.name === TAIL_LIGHT_MATERIAL) {
      tailLight ??= material.clone()
      mesh.material = tailLight
    }
  })
  root.updateMatrixWorld(true)

  const thrusters: Pose[] = []
  root.traverse((o) => {
    if (!o.name.startsWith(THRUSTER_PREFIX)) return
    const quaternion = o.getWorldQuaternion(new Quaternion())
    const position = o.getWorldPosition(new Vector3())
    thrusters.push({ position, quaternion })
  })

  // Wheels leave the bodywork: the car drives their position, steering and spin.
  const wheelNodes = WHEEL_NODES.map((name, i) => {
    const node = root.getObjectByName(name)
    if (import.meta.env.DEV) checkWheel(name, node, root, i)
    node?.removeFromParent()
    node?.position.set(0, 0, 0)
    return node
  })

  return { body: root, wheels: wheelNodes, thrusters, paint, tailLight }
}

type CarModelProps = {
  steerGroups: RefObject<(Group | null)[]>
  spinGroups: RefObject<(Group | null)[]>
  nozzles: RefObject<(Group | null)[]>
  thrust: RefObject<number>
  tailLight: RefObject<MeshStandardMaterial | null>
}

// The car's look, loaded from the GLB. Visual only: the physics never reads the model.
export default function CarModel({
  steerGroups,
  spinGroups,
  nozzles,
  thrust,
  tailLight,
}: CarModelProps) {
  const { scene } = useGLTF(CAR_MODEL_URL)
  const parts = useMemo(() => splitModel(scene), [scene])
  useImperativeHandle<MeshStandardMaterial | null, MeshStandardMaterial | null>(
    tailLight,
    () => parts.tailLight,
    [parts],
  )
  const paintId = usePaintStore((s) => s.paintId)
  useLayoutEffect(() => {
    parts.paint?.color.set(paintColor(paintId))
  }, [parts, paintId])

  return (
    <>
      <primitive object={parts.body} />
      {wheels.positions.map(([x, y, z], i) => (
        <group
          key={i}
          position={[x, y - suspension.restLength, z]}
          ref={(g) => {
            steerGroups.current[i] = g
          }}
        >
          <group
            ref={(g) => {
              spinGroups.current[i] = g
            }}
          >
            {parts.wheels[i] && <primitive object={parts.wheels[i]} />}
          </group>
        </group>
      ))}
      {parts.thrusters.map(({ position, quaternion }, i) => (
        <group
          key={i}
          position={position}
          quaternion={quaternion}
          ref={(g) => {
            nozzles.current[i] = g
          }}
        >
          <ThrusterFlame thrust={thrust} seed={i} />
        </group>
      ))}
    </>
  )
}

useGLTF.preload(CAR_MODEL_URL)
