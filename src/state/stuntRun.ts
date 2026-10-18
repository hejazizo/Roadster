// The reveal run (M16.5): the event's stunts as ordered steps, read from the car's telemetry
// each physics step, and the score they add up to. Pure logic, so the headless sim
// (scripts/sim-car.ts) runs the same steps as the game; the race store owns the game's run.
import type { CarTelemetry, LandingKind } from '../car/telemetry'
import { TUNING } from '../config/tuning'
import type { Level } from '../scene/levelData'

export const STUNT_STEPS = [
  'Half-loop',
  'Inverted hold',
  'Drop & roll',
  'Clean landing',
  'Fleet jump',
  'Finish line',
] as const

// Steps by index, for readability.
const LOOP = 0
const HOLD = 1
const ROLL = 2
const LANDING = 3
const FLEET = 4
const FINISH = 5

export type StepOutcome = 'pending' | 'done' | 'clean' | 'failed'

export type AssistMode = keyof typeof TUNING.assists
export type Medal = 'gold' | 'silver' | 'bronze' | null

// A popup's worth of news: a step done, points won, a penalty or a parked car clipped.
export type StuntEvent = {
  label: string
  points: number
  kind: 'step' | 'bonus' | 'penalty' | 'hit'
}

export type StuntRun = {
  step: number // index into STUNT_STEPS of the step under way; STUNT_STEPS.length when done
  outcomes: StepOutcome[]
  holdTime: number // s of unbroken ceiling hold in this attempt at the loop
  leftCeiling: boolean // took off from the ceiling after the hold
  dropTurns: number // roll turns in the drop, at its landing
  flipTurns: number // most roll turns in one flight over the fleet
  overRow: boolean // has been in the air above the fleet since last touching beside it
  cleanLandings: number
  badLandings: number
  falls: number // times off the loop before the hold
  hits: number // parked cars clipped
  // Telemetry counters at the last step, to spot changes.
  last: { hits: number; landings: number; respawns: number; touching: boolean } | null
  // The worst landing since the drop (or the flight over the fleet) began: a bounce off the
  // loop or a roof can come before the touch that ends the step.
  worstLanding: LandingKind | null
}

export const createStuntRun = (): StuntRun => ({
  step: LOOP,
  outcomes: STUNT_STEPS.map(() => 'pending'),
  holdTime: 0,
  leftCeiling: false,
  dropTurns: 0,
  flipTurns: 0,
  overRow: false,
  cleanLandings: 0,
  badLandings: 0,
  falls: 0,
  hits: 0,
  last: null,
  worstLanding: null,
})

// What the stepper needs of the car's pose: its centre and its up vector's world height.
export type StuntPose = { x: number; y: number; z: number; upY: number }

// The fleet row's footprint along its heading (the parked cars' yaw) and across it.
type RowFrame = { hx: number; hz: number; along: [number, number]; side: [number, number] }
const rowFrames = new WeakMap<Level, RowFrame | null>()

function rowFrame(level: Level): RowFrame | null {
  if (rowFrames.has(level)) return rowFrames.get(level)!
  let frame: RowFrame | null = null
  if (level.fleet.length > 0) {
    const yaw = level.fleet[0].yaw
    const hx = Math.sin(yaw)
    const hz = Math.cos(yaw)
    const along: [number, number] = [Infinity, -Infinity]
    const side: [number, number] = [Infinity, -Infinity]
    for (const { center, size } of level.fleet.flatMap((car) => car.boxes)) {
      for (const dx of [-0.5, 0.5]) {
        for (const dz of [-0.5, 0.5]) {
          const x = center[0] + dx * size[0]
          const z = center[2] + dz * size[2]
          const a = x * hx + z * hz
          const s = x * hz - z * hx
          along[0] = Math.min(along[0], a)
          along[1] = Math.max(along[1], a)
          side[0] = Math.min(side[0], s)
          side[1] = Math.max(side[1], s)
        }
      }
    }
    frame = { hx, hz, along, side }
  }
  rowFrames.set(level, frame)
  return frame
}

const outcomeOf = (kind: LandingKind): StepOutcome =>
  kind === 'clean' ? 'clean' : kind === 'bad' ? 'failed' : 'done'

// Less roll than this gets no popup.
const MIN_TURNS = 0.05

const turns = (n: number) => `${Math.abs(n).toFixed(1)} turns`

// Steps the run by one physics step. Returns what happened, for popups and sounds.
export function stepStuntRun(
  run: StuntRun,
  t: CarTelemetry,
  pose: StuntPose,
  level: Level,
  dt: number,
): StuntEvent[] {
  const r = TUNING.reveal
  const events: StuntEvent[] = []
  const last = run.last ?? {
    hits: t.hits,
    landings: t.landings,
    respawns: t.respawns,
    touching: t.touching,
  }
  // Landings the telemetry counted (a soft plain one isn't): a bad one sticks.
  if (t.landings !== last.landings) {
    run.worstLanding = run.worstLanding === 'bad' ? 'bad' : t.landingKind
  }
  // How the step's landing went; touching the pad overturned is bad whatever was counted.
  const landingKind = (): LandingKind =>
    pose.upY < TUNING.car.landing.uprightDot ? 'bad' : (run.worstLanding ?? 'wheels')
  const onPad = t.touching && pose.y < r.floorY
  const respawned = t.respawns !== last.respawns

  // Clipping a parked car costs points at any step, up to a cap per run.
  for (let i = last.hits; i < t.hits; i++) {
    run.hits++
    events.push({ label: 'Hit', points: run.hits <= r.hitCap ? -r.hit : 0, kind: 'hit' })
  }

  const advance = (to: number, outcome: StepOutcome = 'done') => {
    run.outcomes[run.step] = outcome
    run.step = to
  }
  const fellOff = () => {
    run.falls++
    run.step = LOOP
    run.outcomes = STUNT_STEPS.map(() => 'pending')
    run.holdTime = 0
    run.leftCeiling = false
    events.push({ label: 'Fell off the loop', points: -r.fellOffLoop, kind: 'penalty' })
  }
  const land = (rolled: boolean) => {
    const kind = respawned ? 'bad' : landingKind()
    run.dropTurns = respawned ? 0 : t.rollTurns
    if (!rolled) run.outcomes[ROLL] = 'failed'
    run.outcomes[LANDING] = outcomeOf(kind)
    run.step = FLEET
    if (Math.abs(run.dropTurns) > MIN_TURNS) {
      events.push({
        label: `Roll ${turns(run.dropTurns)}`,
        points: Math.round(r.rollPerTurn * Math.abs(run.dropTurns)),
        kind: 'bonus',
      })
    }
    events.push(landingEvent(kind, respawned ? 'Recovered' : undefined))
  }
  const landingEvent = (kind: LandingKind, label?: string): StuntEvent => {
    if (kind === 'clean') {
      run.cleanLandings++
      return { label: 'Clean landing', points: r.cleanLanding, kind: 'bonus' }
    }
    if (kind === 'bad') {
      run.badLandings++
      return { label: label ?? 'Bad landing', points: -r.badLanding, kind: 'penalty' }
    }
    return { label: 'Landed', points: 0, kind: 'step' }
  }

  const ceiling = t.grounded && t.hold === 'ceiling'
  switch (run.step) {
    case LOOP:
      if (ceiling) {
        advance(HOLD)
        run.holdTime = 0
        events.push({ label: 'Half-loop', points: 0, kind: 'step' })
      }
      break
    case HOLD:
      if (ceiling) {
        run.holdTime += dt
        if (run.holdTime >= r.holdMin) {
          advance(ROLL)
          events.push({ label: 'Inverted hold', points: 0, kind: 'step' })
        }
      } else if (onPad || respawned) fellOff()
      else run.holdTime = 0 // an unbroken hold counts; a wall moment starts it over
      break
    case ROLL:
      if (!run.leftCeiling) {
        if (ceiling) run.holdTime = Math.min(run.holdTime + dt, r.holdCap)
        if (onPad || respawned)
          fellOff() // drove back down the loop, or recovered
        else if (!t.touching) {
          run.leftCeiling = true
          run.worstLanding = null
          events.push({
            label: `Hold ${run.holdTime.toFixed(1)} s`,
            points: Math.round(r.holdPerSecond * run.holdTime),
            kind: 'bonus',
          })
        }
      } else if (onPad || respawned) land(false)
      else if (!t.touching && pose.upY > r.uprightDot) {
        advance(LANDING)
        events.push({ label: 'Rolled upright', points: 0, kind: 'step' })
      }
      break
    case LANDING:
      if (onPad || respawned) land(true)
      break
    case FLEET: {
      const row = rowFrame(level)
      if (!row) break
      const a = pose.x * row.hx + pose.z * row.hz
      const s = pose.x * row.hz - pose.z * row.hx
      const inRow =
        a >= row.along[0] &&
        a <= row.along[1] &&
        s >= row.side[0] - r.rowMargin &&
        s <= row.side[1] + r.rowMargin
      if (!t.touching && inRow) {
        if (!run.overRow) run.worstLanding = null
        run.overRow = true
        run.flipTurns = Math.max(run.flipTurns, Math.abs(t.rollTurns))
      }
      if (t.touching && !respawned && run.overRow && a > row.along[1]) {
        const kind = landingKind()
        run.flipTurns = Math.max(run.flipTurns, Math.abs(t.rollTurns))
        advance(FINISH, outcomeOf(kind))
        if (run.flipTurns > MIN_TURNS) {
          events.push({
            label: `Kickflip ${turns(run.flipTurns)}`,
            points: Math.round(r.rollPerTurn * run.flipTurns),
            kind: 'bonus',
          })
        }
        events.push(landingEvent(kind))
      } else if ((t.touching && !inRow) || respawned) {
        // Short of the row, beside it or recovered: jump again. On a roof it still counts.
        run.overRow = false
        run.flipTurns = 0
      }
      break
    }
  }

  run.last = { hits: t.hits, landings: t.landings, respawns: t.respawns, touching: t.touching }
  return events
}

// The finish gate, passed: true if it ended the run.
export function finishStuntRun(run: StuntRun): boolean {
  if (run.step !== FINISH) return false
  run.outcomes[FINISH] = 'done'
  run.step = STUNT_STEPS.length
  return true
}

export const stuntDone = (run: StuntRun) => run.step >= STUNT_STEPS.length

export type ScoreLine = { label: string; detail: string; points: number }
export type StuntScore = { total: number; lines: ScoreLine[]; medal: Medal }

const holdPoints = (run: StuntRun) =>
  run.holdTime >= TUNING.reveal.holdMin
    ? Math.round(TUNING.reveal.holdPerSecond * Math.min(run.holdTime, TUNING.reveal.holdCap))
    : 0

// Points won and lost so far, without the time bonus or the no-contact bonus (both only known
// at the finish): the running score on the HUD.
export function stuntPoints(run: StuntRun): number {
  const r = TUNING.reveal
  return (
    (run.step > HOLD ? holdPoints(run) : 0) +
    Math.round(r.rollPerTurn * Math.abs(run.dropTurns)) +
    (run.step > FLEET ? Math.round(r.rollPerTurn * run.flipTurns) : 0) +
    r.cleanLanding * run.cleanLandings -
    r.badLanding * run.badLandings -
    r.hit * Math.min(run.hits, r.hitCap) -
    r.fellOffLoop * run.falls
  )
}

export function medalFor(score: number, assist: AssistMode): Medal {
  const m = TUNING.reveal.medals[assist]
  return score >= m.gold
    ? 'gold'
    : score >= m.silver
      ? 'silver'
      : score >= m.bronze
        ? 'bronze'
        : null
}

// The finished run's breakdown. Never below 0.
export function scoreStuntRun(run: StuntRun, time: number, assist: AssistMode): StuntScore {
  const r = TUNING.reveal
  const hitsCounted = Math.min(run.hits, r.hitCap)
  const lines: ScoreLine[] = [
    {
      label: 'Time',
      detail: `${time.toFixed(1)} s`,
      points: Math.round(Math.max(0, r.timeBonus - r.timePerSecond * time)),
    },
    { label: 'Inverted hold', detail: `${run.holdTime.toFixed(1)} s`, points: holdPoints(run) },
    {
      label: 'Roll',
      detail: turns(Math.abs(run.dropTurns) + run.flipTurns),
      points:
        Math.round(r.rollPerTurn * Math.abs(run.dropTurns)) +
        Math.round(r.rollPerTurn * run.flipTurns),
    },
    {
      label: 'Clean landings',
      detail: `${run.cleanLandings}`,
      points: r.cleanLanding * run.cleanLandings,
    },
    {
      label: 'No contact',
      detail: run.hits === 0 ? '✓' : '—',
      points: run.hits === 0 ? r.noContact : 0,
    },
    {
      label: 'Bad landings',
      detail: `${run.badLandings}`,
      points: -r.badLanding * run.badLandings,
    },
    { label: 'Contact', detail: `${run.hits}`, points: -r.hit * hitsCounted },
    { label: 'Fell off the loop', detail: `${run.falls}`, points: -r.fellOffLoop * run.falls },
  ]
  const total = Math.max(
    0,
    lines.reduce((sum, line) => sum + line.points, 0),
  )
  return { total, lines, medal: medalFor(total, assist) }
}
