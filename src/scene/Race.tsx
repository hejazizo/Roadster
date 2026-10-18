import {
  CylinderCollider,
  RigidBody,
  useAfterPhysicsStep,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from '@react-three/rapier'
import { useEffect, type RefObject } from 'react'
import type { CarTelemetry } from '../car/telemetry'
import { TUNING } from '../config/tuning'
import type { RunMode } from '../state/modeStore'
import { useRaceStore } from '../state/raceStore'
import { STUNT_STEPS } from '../state/stuntRun'
import type { Level, Ring } from './levelData'

const NEXT_COLOR = '#ffd60a'
const NEXT_GLOW = 1.2
const UPCOMING_COLOR = '#ffffff'
const UPCOMING_OPACITY = 0.35
const TUBE = 0.25 // m, visual thickness of the torus

type RingStatus = 'next' | 'upcoming' | 'passed'

type RingPieceProps = {
  ring: Ring
  status: RingStatus
  visible: boolean
  onPass: () => void
  car: RefObject<RapierRigidBody | null>
}

function RingPiece({
  ring: { center, yaw, radius },
  status,
  visible,
  onPass,
  car,
}: RingPieceProps) {
  const next = status === 'next'
  return (
    <group position={center} rotation={[0, yaw, 0]}>
      {/* Sensor fills the hole; the torus itself has no collider, so it can't be hit. */}
      <CylinderCollider
        sensor
        args={[TUNING.race.ringDepth / 2, radius]}
        rotation={[Math.PI / 2, 0, 0]}
        onIntersectionEnter={({ other }) => {
          const body = car.current
          if (body && other.rigidBody?.handle === body.handle) onPass()
        }}
      />
      <mesh visible={visible} castShadow={next}>
        <torusGeometry args={[radius, TUBE, 12, 64]} />
        <meshStandardMaterial
          color={next ? NEXT_COLOR : UPCOMING_COLOR}
          emissive={NEXT_COLOR}
          emissiveIntensity={next ? NEXT_GLOW : 0}
          transparent={!next}
          opacity={next ? 1 : UPCOMING_OPACITY}
        />
      </mesh>
    </group>
  )
}

type CourseRingProps = {
  ring: Ring
  index: number
  finish: boolean
  car: RefObject<RapierRigidBody | null>
}

// A ring of the time trial.
function CourseRing({ ring, index, finish, car }: CourseRingProps) {
  // Each ring selects its own status so only rings that change re-render.
  const status = useRaceStore((s): RingStatus =>
    s.nextRing === index ? 'next' : s.nextRing < index ? 'upcoming' : 'passed',
  )
  return (
    <RingPiece
      ring={ring}
      status={status}
      // The start/finish arch stays visible after it's passed.
      visible={status !== 'passed' || finish}
      onPass={() => useRaceStore.getState().passRing(index)}
      car={car}
    />
  )
}

const FINISH_STEP = STUNT_STEPS.length - 1

// The reveal run's finish gate: lit once it's the step under way.
function FinishGate({ ring, car }: { ring: Ring; car: RefObject<RapierRigidBody | null> }) {
  const status = useRaceStore((s): RingStatus =>
    s.stunt.step === FINISH_STEP ? 'next' : s.stunt.step < FINISH_STEP ? 'upcoming' : 'passed',
  )
  return (
    <RingPiece
      ring={ring}
      status={status}
      visible
      onPass={() => useRaceStore.getState().passFinish()}
      car={car}
    />
  )
}

type RaceProps = {
  level: Level
  mode: RunMode
  car: RefObject<RapierRigidBody | null>
  telemetry: RefObject<CarTelemetry>
}

// The run modes: the ring time trial's checkpoint rings, or the reveal run's stunt steps
// (src/state/stuntRun.ts) and finish gate; and the race clock. Starting, pausing and
// restarting live in the menus (src/ui/Menus.tsx).
export default function Race({ level, mode, car, telemetry }: RaceProps) {
  const { id, rings, stunts } = level

  useEffect(() => {
    useRaceStore.getState().setCourse(id, rings.length, mode)
  }, [id, rings, mode])

  useBeforePhysicsStep((world) => useRaceStore.getState().tick(world.timestep))

  // After the step, so the telemetry the car wrote before it is this step's.
  useAfterPhysicsStep((world) => {
    const body = car.current
    if (mode !== 'reveal' || !body) return
    const p = body.translation()
    const q = body.rotation()
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z)
    useRaceStore
      .getState()
      .stepStunts(telemetry.current, { x: p.x, y: p.y, z: p.z, upY }, level, world.timestep)
  })

  return (
    <RigidBody type="fixed" colliders={false}>
      {mode === 'reveal' && stunts ? (
        <FinishGate ring={stunts.finish} car={car} />
      ) : (
        rings.map((ring, i) => (
          <CourseRing key={i} ring={ring} index={i} finish={i === rings.length - 1} car={car} />
        ))
      )}
    </RigidBody>
  )
}
