import { useGLTF } from '@react-three/drei'
import { useMemo, type RefObject } from 'react'
import {
  DoubleSide,
  Quaternion,
  Vector3,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three'
import { CAR_MODEL_URL } from '../config/assets'
import { TUNING } from '../config/tuning'

const { wheels, suspension } = TUNING.car

// Node names from docs/car-model-spec.md. Wheels are in the order of TUNING.car.wheels.positions.
const WHEEL_NODES = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']
const THRUSTER_PREFIX = 'thruster'
// Dev check: wheel hubs further than this (m) from the physics wheels get a warning.
const HUB_TOLERANCE = 0.05

// Placeholder thruster glow: a disc just behind each thruster node, lit while boosting or gliding.
const THRUSTER_COLOR = '#333333'
const THRUSTER_GLOW = '#ff8c1a'
const THRUSTER_RADIUS = 0.15
const THRUSTER_OFFSET = 0.02 // m behind the node, so the disc doesn't z-fight the body

type Pose = { position: Vector3; quaternion: Quaternion }

type CarParts = {
  // Bodywork: everything in the model except the wheels.
  body: Object3D
  wheels: (Object3D | undefined)[]
  thrusters: Pose[]
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
  root.traverse((o) => {
    if ((o as Mesh).isMesh) o.castShadow = true
  })
  root.updateMatrixWorld(true)

  const thrusters: Pose[] = []
  root.traverse((o) => {
    if (!o.name.startsWith(THRUSTER_PREFIX)) return
    const quaternion = o.getWorldQuaternion(new Quaternion())
    const position = new Vector3(0, 0, -THRUSTER_OFFSET).applyMatrix4(o.matrixWorld)
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

  return { body: root, wheels: wheelNodes, thrusters }
}

type CarModelProps = {
  steerGroups: RefObject<(Group | null)[]>
  spinGroups: RefObject<(Group | null)[]>
  thrusterMaterials: RefObject<(MeshStandardMaterial | null)[]>
}

// The car's look, loaded from the GLB. Visual only: the physics never reads the model.
export default function CarModel({ steerGroups, spinGroups, thrusterMaterials }: CarModelProps) {
  const { scene } = useGLTF(CAR_MODEL_URL)
  const parts = useMemo(() => splitModel(scene), [scene])

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
        <mesh key={i} position={position} quaternion={quaternion}>
          <circleGeometry args={[THRUSTER_RADIUS, 16]} />
          <meshStandardMaterial
            ref={(m) => {
              thrusterMaterials.current[i] = m
            }}
            color={THRUSTER_COLOR}
            emissive={THRUSTER_GLOW}
            emissiveIntensity={0}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </>
  )
}

useGLTF.preload(CAR_MODEL_URL)
