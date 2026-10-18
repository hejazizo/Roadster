import { create } from 'zustand'
import type { CarTelemetry } from '../car/telemetry'
import { TUNING } from '../config/tuning'
import type { Level } from '../scene/levelData'
import { loadBestScore, loadBestTime, saveBestScore, saveBestTime } from './bestTimes'
import type { RunMode } from './modeStore'
import {
  type AssistMode,
  createStuntRun,
  finishStuntRun,
  scoreStuntRun,
  type StepOutcome,
  stepStuntRun,
  type StuntEvent,
  type StuntPose,
  stuntPoints,
  type StuntScore,
} from './stuntRun'

export type RacePhase = 'menu' | 'countdown' | 'racing' | 'finished'

// The reveal run's progress, for the HUD.
export type StuntProgress = {
  step: number // index into STUNT_STEPS; its length once finished
  outcomes: StepOutcome[]
  holdTime: number // s of ceiling hold in this attempt
  points: number // won and lost so far (no time or no-contact bonus yet)
}

export type Popup = StuntEvent & { id: number }

const POPUPS_KEPT = 4

const progressOf = (run: ReturnType<typeof createStuntRun>): StuntProgress => ({
  step: run.step,
  outcomes: [...run.outcomes],
  holdTime: run.holdTime,
  points: stuntPoints(run),
})

const sameProgress = (a: StuntProgress, b: StuntProgress) =>
  a.step === b.step &&
  a.holdTime === b.holdTime &&
  a.points === b.points &&
  a.outcomes.every((o, i) => o === b.outcomes[i])

const noBestScores = (): Record<AssistMode, number | null> => ({ beginner: null, pro: null })

// The game's reveal run; reset on every restart.
let stunts = createStuntRun()

export type RaceState = {
  phase: RacePhase
  paused: boolean // physics (and so the race clock) stops while set
  levelId: string
  mode: RunMode
  ringCount: number
  nextRing: number // index of the ring that counts next
  countdown: number // s left before the start
  time: number // s since the start, physics time
  finalTime: number | null
  bestTime: number | null // saved best for this level
  newBest: boolean // the finished run set the best time (or score)
  runId: number // bumped on every restart, quit, level or mode change; the car watches it to return to spawn
  // Reveal run:
  assist: AssistMode // the run is scored as; Beginner if it was on at any point of the run
  stunt: StuntProgress
  popups: Popup[] // the latest few, newest last
  stuntSteps: number // bumped on every step done, for the sound
  stuntFails: number // bumped on every fall off the loop or bad landing, for the sound
  score: StuntScore | null // the finished run's breakdown
  bestScores: Record<AssistMode, number | null> // saved bests for this level, per assist mode
  setCourse: (levelId: string, ringCount: number, mode: RunMode) => void
  restart: (assist: AssistMode) => void
  noteAssist: (assist: AssistMode) => void // the assist mode changed
  quit: () => void
  setPaused: (paused: boolean) => void
  tick: (dt: number) => void
  passRing: (index: number) => void
  stepStunts: (t: CarTelemetry, pose: StuntPose, level: Level, dt: number) => void
  passFinish: () => void
}

// What a restart or quit clears.
const freshRun = () => {
  stunts = createStuntRun()
  return {
    nextRing: 0,
    time: 0,
    finalTime: null,
    newBest: false,
    stunt: progressOf(stunts),
    popups: [],
    score: null,
  }
}

let popupId = 0

// Ring time trial: menu → countdown → racing → finished, with pause during countdown and
// racing. Stepped from the physics loop (`tick` per step, `passRing` from ring sensors) so
// the clock matches the simulation.
export const useRaceStore = create<RaceState>((set, get) => ({
  phase: 'menu',
  paused: false,
  levelId: '',
  mode: 'rings',
  ringCount: 0,
  nextRing: 0,
  countdown: 0,
  time: 0,
  finalTime: null,
  bestTime: null,
  newBest: false,
  runId: 0,
  assist: 'beginner',
  stunt: progressOf(stunts),
  popups: [],
  stuntSteps: 0,
  stuntFails: 0,
  score: null,
  bestScores: noBestScores(),

  // A new level or mode (picked on the main menu) sends the car to its spawn, like a quit.
  setCourse: (levelId, ringCount, mode) =>
    set((s) => ({
      levelId,
      mode,
      ringCount,
      bestTime: loadBestTime(levelId),
      bestScores: {
        beginner: loadBestScore(levelId, 'reveal', 'beginner'),
        pro: loadBestScore(levelId, 'reveal', 'pro'),
      },
      ...freshRun(),
      runId: s.runId + 1,
    })),

  restart: (assist) =>
    set((s) => ({
      phase: 'countdown',
      paused: false,
      countdown: TUNING.race.countdown,
      ...freshRun(),
      assist,
      runId: s.runId + 1,
    })),

  // A run switched to Beginner at any point (on the pause menu) is scored as a Beginner run.
  noteAssist: (assist) => {
    if (assist === 'beginner' && isRunning(get().phase)) set({ assist })
  },

  quit: () =>
    set((s) => ({
      phase: 'menu',
      paused: false,
      countdown: 0,
      ...freshRun(),
      runId: s.runId + 1,
    })),

  setPaused: (paused) => {
    if (isRunning(get().phase)) set({ paused })
  },

  tick: (dt) => {
    const { phase, countdown, time } = get()
    if (phase === 'countdown') {
      // Time left over past zero counts towards the race clock.
      const left = countdown - dt
      set(left > 0 ? { countdown: left } : { phase: 'racing', countdown: 0, time: -left })
    } else if (phase === 'racing') {
      set({ time: time + dt })
    }
  },

  passRing: (index) => {
    const { phase, mode, nextRing, ringCount, time, levelId, bestTime } = get()
    if (phase !== 'racing' || mode !== 'rings' || index !== nextRing) return
    if (index < ringCount - 1) {
      set({ nextRing: index + 1 })
      return
    }
    const newBest = bestTime === null || time < bestTime
    if (newBest) saveBestTime(levelId, time)
    set({
      phase: 'finished',
      nextRing: ringCount,
      finalTime: time,
      bestTime: newBest ? time : bestTime,
      newBest,
    })
  },

  stepStunts: (t, pose, level, dt) => {
    const s = get()
    if (s.phase !== 'racing' || s.mode !== 'reveal') return
    const events = stepStuntRun(stunts, t, pose, level, dt)
    const stunt = progressOf(stunts)
    const changed = !sameProgress(stunt, s.stunt)
    if (!changed && events.length === 0) return
    const fails = events.filter((e) => e.kind === 'penalty').length
    set({
      stunt: changed ? stunt : s.stunt,
      popups: events.length
        ? [...s.popups, ...events.map((e) => ({ ...e, id: ++popupId }))].slice(-POPUPS_KEPT)
        : s.popups,
      stuntSteps: s.stuntSteps + (stunt.step - s.stunt.step > 0 ? stunt.step - s.stunt.step : 0),
      stuntFails: s.stuntFails + fails,
    })
  },

  passFinish: () => {
    const { phase, mode, time, levelId, assist, bestScores } = get()
    if (phase !== 'racing' || mode !== 'reveal' || !finishStuntRun(stunts)) return
    const score = scoreStuntRun(stunts, time, assist)
    const best = bestScores[assist]
    const newBest = best === null || score.total > best
    if (newBest) saveBestScore(levelId, 'reveal', assist, score.total)
    set({
      phase: 'finished',
      finalTime: time,
      stunt: progressOf(stunts),
      score,
      newBest,
      bestScores: newBest ? { ...bestScores, [assist]: score.total } : bestScores,
    })
  },
}))

// The car is held at the start until the countdown ends.
export const isCarHeld = (phase: RacePhase) => phase === 'menu' || phase === 'countdown'

// A run is under way (and can be paused).
export const isRunning = (phase: RacePhase) => phase === 'countdown' || phase === 'racing'
