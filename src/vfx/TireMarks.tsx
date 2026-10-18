import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicMaterial, Vector3 } from 'three'
import type { CarTelemetry, WheelTelemetry } from '../car/telemetry'
import { TUNING } from '../config/tuning'
import { useRaceStore } from '../state/raceStore'

const MARK_COLOR = '#161616'
const MARK_OPACITY = 0.75 // at full skid
const MAX_SEGMENTS = 3000 // oldest marks are overwritten
const LIFT = 0.045 // m along the ground normal, above the visual road ribbon (0.03 m)
const MIN_SEGMENT = 0.2 // m a wheel travels before a new piece of mark is laid
const MAX_SEGMENT = 3 // m; a longer jump (a reset) starts a new mark instead
const MIN_SKID = 0.05

const VERTS = 6 // two triangles per segment

type Trail = {
  active: boolean
  point: Vector3 // where the last piece ended
  hasEdges: boolean // left/right are known once the first piece sets the direction
  left: Vector3
  right: Vector3
  alpha: number
}

const point = new Vector3()
const step = new Vector3()
const side = new Vector3()
const left = new Vector3()
const right = new Vector3()

// One strip per wheel, stored as quads in a ring buffer.
class MarkBuffer {
  readonly geometry = new BufferGeometry()
  readonly material = new MeshBasicMaterial({
    color: MARK_COLOR,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    // Wins against the ground and road it lies on.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  private readonly position = new BufferAttribute(new Float32Array(MAX_SEGMENTS * VERTS * 3), 3)
  // RGBA vertex colours: white, with the skid as alpha.
  private readonly color = new BufferAttribute(
    new Float32Array(MAX_SEGMENTS * VERTS * 4).fill(1),
    4,
  )
  private readonly trails: Trail[] = TUNING.car.wheels.positions.map(() => ({
    active: false,
    point: new Vector3(),
    hasEdges: false,
    left: new Vector3(),
    right: new Vector3(),
    alpha: 0,
  }))
  private next = 0
  private count = 0

  constructor() {
    this.geometry.setAttribute('position', this.position)
    this.geometry.setAttribute('color', this.color)
    this.geometry.setDrawRange(0, 0)
  }

  clear() {
    this.next = 0
    this.count = 0
    for (const trail of this.trails) trail.active = false
    this.geometry.setDrawRange(0, 0)
  }

  update(wheels: WheelTelemetry[]) {
    const halfWidth = TUNING.car.wheels.width / 2
    wheels.forEach((w, i) => {
      const trail = this.trails[i]
      if (!w.contact || w.skid < MIN_SKID) {
        trail.active = false
        return
      }
      point.copy(w.point).addScaledVector(w.normal, LIFT)
      const alpha = w.skid * MARK_OPACITY
      if (!trail.active) {
        trail.active = true
        trail.point.copy(point)
        trail.alpha = alpha
        trail.hasEdges = false
        return
      }
      step.subVectors(point, trail.point)
      const d = step.length()
      if (d < MIN_SEGMENT) return
      if (d > MAX_SEGMENT) {
        trail.point.copy(point)
        trail.hasEdges = false
        return
      }
      side.crossVectors(step, w.normal).setLength(halfWidth)
      left.copy(point).add(side)
      right.copy(point).sub(side)
      if (!trail.hasEdges) {
        trail.left.copy(trail.point).add(side)
        trail.right.copy(trail.point).sub(side)
      }
      this.addSegment(trail.left, trail.right, left, right, trail.alpha, alpha)
      trail.point.copy(point)
      trail.left.copy(left)
      trail.right.copy(right)
      trail.hasEdges = true
      trail.alpha = alpha
    })
    this.geometry.setDrawRange(0, this.count * VERTS)
  }

  private addSegment(
    a0: Vector3,
    a1: Vector3,
    b0: Vector3,
    b1: Vector3,
    alphaA: number,
    alphaB: number,
  ) {
    const i = this.next
    this.next = (i + 1) % MAX_SEGMENTS
    this.count = Math.min(this.count + 1, MAX_SEGMENTS)
    const v = i * VERTS
    const corners = [a0, a1, b0, a1, b1, b0]
    const alphas = [alphaA, alphaA, alphaB, alphaA, alphaB, alphaB]
    corners.forEach((c, k) => {
      this.position.setXYZ(v + k, c.x, c.y, c.z)
      this.color.setW(v + k, alphas[k])
    })
    this.position.addUpdateRange(v * 3, VERTS * 3)
    this.color.addUpdateRange(v * 4, VERTS * 4)
    this.position.needsUpdate = true
    this.color.needsUpdate = true
  }
}

type TireMarksProps = {
  telemetry: RefObject<CarTelemetry>
}

// Dark strips laid behind sliding wheels; they last until overwritten or a restart.
export default function TireMarks({ telemetry }: TireMarksProps) {
  const runId = useRef(useRaceStore.getState().runId)
  const marks = useMemo(() => new MarkBuffer(), [])

  useFrame(() => {
    const race = useRaceStore.getState()
    if (race.runId !== runId.current) {
      runId.current = race.runId
      marks.clear()
    }
    if (!race.paused) marks.update(telemetry.current.wheels)
  })

  return <mesh geometry={marks.geometry} material={marks.material} frustumCulled={false} />
}
