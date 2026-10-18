import { useFrame } from '@react-three/fiber'
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { Suspense, useEffect, useRef, type RefObject } from 'react'
import { MathUtils, Quaternion, Vector3, type Group, type MeshStandardMaterial } from 'three'
import { TUNING } from '../config/tuning'
import { rumble } from '../input/input'
import { currentAssist } from '../state/assistStore'
import { useCarStore } from '../state/carStore'
import { isCarHeld, useRaceStore } from '../state/raceStore'
import CarAudio from '../audio/CarAudio'
import CarEffects from '../vfx/CarEffects'
import {
  createAbilityState,
  resetAbilities,
  stepAbilities,
  type VehicleController,
} from './abilities'
import CarModel from './CarModel'
import { createDrivingState, resetDriving, stepDriving } from './handling'
import { createSafePoint, placeAtSafePoint, stepSafePoint, type Ray, type Spawn } from './respawn'
import { resetTelemetry, stepTelemetry, type CarTelemetry } from './telemetry'
import type { JetLevels } from '../vfx/jets'
import { released, useCarControls } from './useCarControls'

const { chassis, wheels, suspension } = TUNING.car

// Tail-light brightness while braking, as a multiple of the model's own.
const BRAKE_LIGHT_BOOST = 3
// Gamepad rumble: a short kick when boost starts, and a thump on landing scaled by impact.
const BOOST_RUMBLE = { strength: 0.35, ms: 120 }
const LANDING_RUMBLE = { strength: 1, ms: 180 }

// Controls while the race holds the car at the start.
const HELD = { ...released(), handbrake: true }
// After the finish the car rolls to a stop on the idle brake behind the results screen
// (a rear handbrake at boost speed could spin it).
const COASTING = released()

const quat = new Quaternion()
const up = new Vector3()
const vel = new Vector3()

type CarProps = {
  ref: RefObject<RapierRigidBody | null>
  // The car's visual root, whose world transform is its interpolated pose (for the camera).
  visualRef: RefObject<Group | null>
  // Landings, skids and braking for the effects and camera; written here every physics step.
  telemetry: RefObject<CarTelemetry>
  // The level's start pose; the car returns here on a restart or level change.
  spawn: Spawn
  jets: boolean // the level allows lift and air roll
}

export default function Car({ ref, visualRef, telemetry, spawn, jets }: CarProps) {
  const { world, rapier } = useRapier()
  const readControls = useCarControls()
  const vehicle = useRef<VehicleController | null>(null)
  const driving = useRef(createDrivingState())
  const runId = useRef(useRaceStore.getState().runId)
  const abilities = useRef(createAbilityState())
  const safePoint = useRef(createSafePoint())
  const ray = useRef<Ray | null>(null)
  // 0–1, smoothed from boosting/gliding; sizes the flames and embers.
  const thrust = useRef(0)
  const nozzles = useRef<(Group | null)[]>([])
  // 0–1, smoothed from lift and roll; sizes the cold-gas plumes and vapour.
  const jetLevels = useRef<JetLevels>({ lift: 0, left: 0, right: 0 })
  const jetNozzles = useRef<(Group | null)[]>([])
  const tailLight = useRef<MeshStandardMaterial | null>(null)
  const tailLightBase = useRef<number | null>(null)
  const feedback = useRef({ boosting: false, landings: telemetry.current.landings })
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
      const fellAt = fell && !restarted ? body.translation() : undefined
      placeAtSafePoint(safePoint.current, body, spawn, fellAt)
      resetDriving(driving.current)
      resetAbilities(abilities.current, body)
      resetTelemetry(telemetry.current, !restarted)
    }

    const assist = currentAssist()
    const holding = abilities.current.suction > 0
    stepDriving(driving.current, body, vc, c, world.timestep, assist, holding)
    // Wheel rays and ground probes ignore sensors, so the car can't ride on a ring.
    const solidOnly = rapier.QueryFilterFlags.EXCLUDE_SENSORS
    vc.updateVehicle(world.timestep, solidOnly)
    const probe = { world, ray: ray.current, flags: solidOnly }
    stepAbilities(abilities.current, body, vc, c, world.timestep, assist, probe, jets)
    const contacts = { world, collider: body.collider(0) }
    stepTelemetry(telemetry.current, body, vc, c, world.timestep, abilities.current, contacts)
    stepSafePoint(safePoint.current, body, vc, world, ray.current, solidOnly, world.timestep)
  })

  // Visual wheels follow the controller's suspension, steering and spin.
  useFrame((_, dt) => {
    const { fuel, grounded, boosting, gliding, fans, suction, hold, lifting, roll } =
      abilities.current
    const t = telemetry.current
    if (!useRaceStore.getState().paused) {
      const { glideLevel, attack, release } = TUNING.vfx.flame
      const target = boosting ? 1 : gliding ? glideLevel : 0
      const rate = target > thrust.current ? attack : release
      thrust.current = MathUtils.damp(thrust.current, target, rate, dt)
      const j = jetLevels.current
      const follow = (level: number, to: number) =>
        MathUtils.damp(level, to, to > level ? TUNING.vfx.jets.attack : TUNING.vfx.jets.release, dt)
      j.lift = follow(j.lift, lifting ? 1 : 0)
      j.right = follow(j.right, Math.max(0, roll)) // positive roll lifts the left side
      j.left = follow(j.left, Math.max(0, -roll))
    }

    const light = tailLight.current
    if (light) {
      tailLightBase.current ??= light.emissiveIntensity
      light.emissiveIntensity = tailLightBase.current * (t.braking ? BRAKE_LIGHT_BOOST : 1)
    }

    const fb = feedback.current
    if (boosting && !fb.boosting) rumble(BOOST_RUMBLE.strength, BOOST_RUMBLE.ms)
    if (t.landings !== fb.landings) {
      const strength = t.landingKind === 'bad' ? 1 : t.landingImpact
      rumble(LANDING_RUMBLE.strength * strength, LANDING_RUMBLE.ms)
    }
    fb.boosting = boosting
    fb.landings = t.landings

    // Mirror the car's state for the HUD once per rendered frame. Speed is along the car's
    // plane, so it reads the same on a wall as on the floor.
    const body = ref.current
    let speed = 0
    if (body) {
      const r = body.rotation()
      const v = body.linvel()
      up.set(0, 1, 0).applyQuaternion(quat.set(r.x, r.y, r.z, r.w))
      vel.set(v.x, v.y, v.z)
      speed = vel.addScaledVector(up, -vel.dot(up)).length()
    }
    useCarStore.setState({
      speed,
      fuel,
      grounded,
      boosting,
      gliding,
      drifting: driving.current.drifting,
      fans,
      suction,
      hold,
      lifting,
      airborne: !t.touching,
      height: t.height,
      verticalSpeed: t.verticalSpeed,
      rollTurns: t.rollTurns,
      landings: t.landings,
      landingKind: t.landingKind,
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
    <>
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
              nozzles={nozzles}
              thrust={thrust}
              jetNozzles={jetNozzles}
              jetLevels={jetLevels}
              tailLight={tailLight}
            />
          </Suspense>
        </group>
      </RigidBody>
      {/* World-space effects, outside the moving body. */}
      <CarEffects
        body={ref}
        telemetry={telemetry}
        thrust={thrust}
        nozzles={nozzles}
        jetLevels={jetLevels}
        jetNozzles={jetNozzles}
      />
      <CarAudio
        body={ref}
        telemetry={telemetry}
        thrust={thrust}
        jetLevels={jetLevels}
        abilities={abilities}
      />
    </>
  )
}
