import {
  CylinderCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from '@react-three/rapier'
import { useEffect, type RefObject } from 'react'
import { TUNING } from '../config/tuning'
import { useRaceStore } from '../state/raceStore'
import { isTypingTarget } from '../ui/isTypingTarget'
import type { Level, Ring } from './testLevel'

const NEXT_COLOR = '#ffd60a'
const NEXT_GLOW = 1.2
const UPCOMING_COLOR = '#ffffff'
const UPCOMING_OPACITY = 0.35
const TUBE = 0.25 // m, visual thickness of the torus

type RingStatus = 'next' | 'upcoming' | 'passed'

type RingPieceProps = {
  ring: Ring
  index: number
  finish: boolean
  car: RefObject<RapierRigidBody | null>
}

function RingPiece({ ring: { center, yaw, radius }, index, finish, car }: RingPieceProps) {
  // Each ring selects its own status so only rings that change re-render.
  const status = useRaceStore((s): RingStatus =>
    s.nextRing === index ? 'next' : s.nextRing < index ? 'upcoming' : 'passed',
  )
  const next = status === 'next'
  // The start/finish arch stays visible after it's passed.
  const visible = status !== 'passed' || finish

  return (
    <group position={center} rotation={[0, yaw, 0]}>
      {/* Sensor fills the hole; the torus itself has no collider, so it can't be hit. */}
      <CylinderCollider
        sensor
        args={[TUNING.race.ringDepth / 2, radius]}
        rotation={[Math.PI / 2, 0, 0]}
        onIntersectionEnter={({ other }) => {
          const body = car.current
          if (body && other.rigidBody?.handle === body.handle) {
            useRaceStore.getState().passRing(index)
          }
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

type RaceProps = {
  level: Level
  car: RefObject<RapierRigidBody | null>
}

// Ring time trial: checkpoint rings, the race clock and the start/restart key.
export default function Race({ level, car }: RaceProps) {
  const { rings } = level

  useEffect(() => {
    useRaceStore.getState().setCourse(rings.length)
  }, [rings])

  useBeforePhysicsStep((world) => useRaceStore.getState().tick(world.timestep))

  // Enter starts or restarts the run. Temporary until the input layer in M8.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' || e.repeat || isTypingTarget(e)) return
      e.preventDefault()
      useRaceStore.getState().restart()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <RigidBody type="fixed" colliders={false}>
      {rings.map((ring, i) => (
        <RingPiece key={i} ring={ring} index={i} finish={i === rings.length - 1} car={car} />
      ))}
    </RigidBody>
  )
}
