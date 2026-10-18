import { useFrame } from '@react-three/fiber'
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { useEffect, useRef, type RefObject } from 'react'
import { MathUtils, Quaternion, Vector3, type Group, type Mesh } from 'three'
import { TUNING } from '../config/tuning'
import { useCarControls } from './useCarControls'

const { spawn, chassis, wheels, suspension, tires, engine, brake, steering, stopSpeed } = TUNING.car

const BODY_COLOR = '#e63946'
const CABIN_COLOR = '#1d3557'
const WHEEL_COLOR = '#222222'

const SPAWN_ROTATION = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), spawn.yaw)
const [hx, hy, hz] = chassis.halfExtents

const isFront = (i: number) => i < 2

type VehicleController = ReturnType<
  ReturnType<typeof useRapier>['world']['createVehicleController']
>

type CarProps = {
  ref: RefObject<RapierRigidBody | null>
  // The chassis mesh, whose world transform is the car's interpolated pose (for the camera).
  visualRef: RefObject<Mesh | null>
}

export default function Car({ ref, visualRef }: CarProps) {
  const { world } = useRapier()
  const controls = useCarControls()
  const vehicle = useRef<VehicleController | null>(null)
  const steer = useRef(0)
  const resetHeld = useRef(false)
  const steerGroups = useRef<(Group | null)[]>([])
  const spinGroups = useRef<(Group | null)[]>([])

  useEffect(() => {
    const body = ref.current
    if (!body) return

    const vc = world.createVehicleController(body)
    vc.indexUpAxis = 1
    vc.setIndexForwardAxis = 2
    wheels.positions.forEach(([x, y, z], i) => {
      vc.addWheel(
        { x, y, z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        suspension.restLength,
        wheels.radius,
      )
      vc.setWheelMaxSuspensionTravel(i, suspension.maxTravel)
      vc.setWheelSuspensionStiffness(i, suspension.stiffness)
      vc.setWheelSuspensionCompression(i, suspension.compression)
      vc.setWheelSuspensionRelaxation(i, suspension.relaxation)
      vc.setWheelMaxSuspensionForce(i, suspension.maxForce)
      vc.setWheelFrictionSlip(i, tires.frictionSlip)
      vc.setWheelSideFrictionStiffness(i, tires.sideFrictionStiffness)
    })
    vehicle.current = vc

    return () => {
      vehicle.current = null
      world.removeVehicleController(vc)
    }
  }, [world, ref])

  useBeforePhysicsStep((world) => {
    const vc = vehicle.current
    const body = ref.current
    if (!vc || !body) return
    const c = controls.current

    if (c.reset && !resetHeld.current) {
      const [x, y, z] = spawn.position
      body.setTranslation({ x, y, z }, true)
      body.setRotation(SPAWN_ROTATION, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      steer.current = 0
    }
    resetHeld.current = c.reset

    const speed = vc.currentVehicleSpeed()
    let engineForce = 0
    let brakeForce = 0
    if (c.forward) {
      if (speed < -stopSpeed) brakeForce = brake.force
      else if (speed < engine.maxSpeed) engineForce = engine.force
    } else if (c.backward) {
      if (speed > stopSpeed) brakeForce = brake.force
      else if (speed > -engine.maxReverseSpeed) engineForce = -engine.reverseForce
    } else {
      brakeForce = brake.idleBrake
    }

    const steerTarget = (Number(c.left) - Number(c.right)) * steering.maxAngle
    const maxDelta = steering.speed * world.timestep
    steer.current += MathUtils.clamp(steerTarget - steer.current, -maxDelta, maxDelta)

    for (let i = 0; i < wheels.positions.length; i++) {
      const front = isFront(i)
      vc.setWheelSteering(i, front ? steer.current : 0)
      vc.setWheelEngineForce(i, front ? 0 : engineForce)
      vc.setWheelBrake(i, !front && c.handbrake ? brake.handbrakeForce : brakeForce)
    }
    vc.updateVehicle(world.timestep)
  })

  // Visual wheels follow the controller's suspension, steering and spin.
  useFrame(() => {
    const vc = vehicle.current
    if (!vc) return
    wheels.positions.forEach(([, y], i) => {
      const steerGroup = steerGroups.current[i]
      const spinGroup = spinGroups.current[i]
      if (!steerGroup || !spinGroup) return
      steerGroup.position.y = y - (vc.wheelSuspensionLength(i) ?? suspension.restLength)
      steerGroup.rotation.y = vc.wheelSteering(i) ?? 0
      spinGroup.rotation.x = vc.wheelRotation(i) ?? 0
    })
  })

  return (
    <RigidBody
      ref={ref}
      colliders={false}
      position={spawn.position}
      rotation={[0, spawn.yaw, 0]}
      canSleep={false}
    >
      <CuboidCollider args={chassis.halfExtents} mass={chassis.mass} />
      <mesh ref={visualRef} castShadow>
        <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
        <meshStandardMaterial color={BODY_COLOR} />
      </mesh>
      {/* Cabin sits towards the front (+Z) so the heading is readable. */}
      <mesh castShadow position={[0, hy + 0.2, hz * 0.15]}>
        <boxGeometry args={[hx * 1.6, 0.4, hz * 0.9]} />
        <meshStandardMaterial color={CABIN_COLOR} />
      </mesh>
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
            <mesh castShadow rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[wheels.radius, wheels.radius, wheels.width, 16]} />
              <meshStandardMaterial color={WHEEL_COLOR} />
            </mesh>
          </group>
        </group>
      ))}
    </RigidBody>
  )
}
