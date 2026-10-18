import { useFrame } from '@react-three/fiber'
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { Suspense, useEffect, useRef, type RefObject } from 'react'
import { MathUtils, type Group, type MeshStandardMaterial } from 'three'
import { TUNING } from '../config/tuning'
import { useCarStore } from '../state/carStore'
import { isCarHeld, useRaceStore } from '../state/raceStore'
import {
  createAbilityState,
  resetAbilities,
  stepAbilities,
  type VehicleController,
} from './abilities'
import CarModel from './CarModel'
import { createSafePoint, placeAtSafePoint, stepSafePoint, type Ray } from './respawn'
import { released, useCarControls } from './useCarControls'

const { spawn, chassis, wheels, suspension, tires, engine, brake, steering } = TUNING.car

// Thruster glow while boosting or gliding; dark otherwise, including when out of fuel.
const THRUSTER_GLOW_INTENSITY = 3

const isFront = (i: number) => i < 2

// Controls while the race holds the car at the start.
const HELD = { ...released(), handbrake: true }
// After the finish the car rolls to a stop on the idle brake behind the results screen
// (a rear handbrake at boost speed could spin it).
const COASTING = released()

// Applied every step so suspension and tire changes from the tuning panel take effect live.
function applyWheelTuning(vc: VehicleController, i: number) {
  vc.setWheelSuspensionRestLength(i, suspension.restLength)
  vc.setWheelMaxSuspensionTravel(i, suspension.maxTravel)
  vc.setWheelSuspensionStiffness(i, suspension.stiffness)
  vc.setWheelSuspensionCompression(i, suspension.compression)
  vc.setWheelSuspensionRelaxation(i, suspension.relaxation)
  vc.setWheelMaxSuspensionForce(i, suspension.maxForce)
  vc.setWheelFrictionSlip(i, tires.frictionSlip)
  vc.setWheelSideFrictionStiffness(i, tires.sideFrictionStiffness)
}

type CarProps = {
  ref: RefObject<RapierRigidBody | null>
  // The car's visual root, whose world transform is its interpolated pose (for the camera).
  visualRef: RefObject<Group | null>
}

export default function Car({ ref, visualRef }: CarProps) {
  const { world, rapier } = useRapier()
  const readControls = useCarControls()
  const vehicle = useRef<VehicleController | null>(null)
  const steer = useRef(0)
  const runId = useRef(useRaceStore.getState().runId)
  const abilities = useRef(createAbilityState())
  const safePoint = useRef(createSafePoint())
  const ray = useRef<Ray | null>(null)
  const thrusterMaterials = useRef<(MeshStandardMaterial | null)[]>([])
  const steerGroups = useRef<(Group | null)[]>([])
  const spinGroups = useRef<(Group | null)[]>([])

  useEffect(() => {
    const body = ref.current
    if (!body) return

    const vc = world.createVehicleController(body)
    vc.indexUpAxis = 1
    vc.setIndexForwardAxis = 2
    wheels.positions.forEach(([x, y, z]) => {
      vc.addWheel(
        { x, y, z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        suspension.restLength,
        wheels.radius,
      )
    })
    vehicle.current = vc
    ray.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })

    return () => {
      vehicle.current = null
      ray.current = null
      world.removeVehicleController(vc)
    }
  }, [world, rapier, ref])

  useBeforePhysicsStep((world) => {
    const vc = vehicle.current
    const body = ref.current
    if (!vc || !body || !ray.current) return
    const race = useRaceStore.getState()
    // Read every step, so presses made on a menu or during the countdown don't carry over.
    const input = readControls()
    const c = race.phase === 'racing' ? input : isCarHeld(race.phase) ? HELD : COASTING

    // A race restart forgets the safe point, so the car goes back to spawn.
    const restarted = race.runId !== runId.current
    runId.current = race.runId
    if (restarted) safePoint.current.valid = false

    // R or falling out of the world puts the car back at its last safe point.
    const fell = body.translation().y < TUNING.world.killY
    if (restarted || c.reset || fell) {
      placeAtSafePoint(safePoint.current, body)
      steer.current = 0
      resetAbilities(abilities.current, body)
    }

    // Analog throttle: forces scale with how far the trigger (or key, fully) is pressed.
    const speed = vc.currentVehicleSpeed()
    const { stopSpeed } = TUNING.car
    const t = c.throttle
    let engineForce = 0
    let brakeForce = 0
    if (t > 0) {
      if (speed < -stopSpeed) brakeForce = brake.force * t
      else if (speed < engine.maxSpeed) engineForce = engine.force * t
    } else if (t < 0) {
      if (speed > stopSpeed) brakeForce = brake.force * -t
      else if (speed > -engine.maxReverseSpeed) engineForce = engine.reverseForce * t
    } else {
      brakeForce = brake.idleBrake
    }

    // Positive steering angle turns left.
    const steerTarget = -c.steer * steering.maxAngle
    const maxDelta = steering.speed * world.timestep
    steer.current += MathUtils.clamp(steerTarget - steer.current, -maxDelta, maxDelta)

    for (let i = 0; i < wheels.positions.length; i++) {
      const front = isFront(i)
      applyWheelTuning(vc, i)
      vc.setWheelSteering(i, front ? steer.current : 0)
      vc.setWheelEngineForce(i, front ? 0 : engineForce)
      vc.setWheelBrake(i, !front && c.handbrake ? brake.handbrakeForce : brakeForce)
    }
    // Wheel rays and ground probes ignore sensors, so the car can't ride on a ring.
    const solidOnly = rapier.QueryFilterFlags.EXCLUDE_SENSORS
    vc.updateVehicle(world.timestep, solidOnly)
    stepAbilities(abilities.current, body, vc, c, world.timestep)
    stepSafePoint(safePoint.current, body, vc, world, ray.current, solidOnly, world.timestep)
  })

  // Visual wheels follow the controller's suspension, steering and spin.
  useFrame(() => {
    const { fuel, grounded, boosting, gliding } = abilities.current
    for (const m of thrusterMaterials.current) {
      if (m) m.emissiveIntensity = boosting || gliding ? THRUSTER_GLOW_INTENSITY : 0
    }
    // Mirror the car's state for the HUD once per rendered frame.
    const v = ref.current?.linvel()
    useCarStore.setState({
      speed: v ? Math.hypot(v.x, v.z) : 0,
      fuel,
      grounded,
      boosting,
      gliding,
    })
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
      {/* Outside the Suspense, so the camera has a target while the model loads. */}
      <group ref={visualRef}>
        <Suspense fallback={null}>
          <CarModel
            steerGroups={steerGroups}
            spinGroups={spinGroups}
            thrusterMaterials={thrusterMaterials}
          />
        </Suspense>
      </group>
    </RigidBody>
  )
}
