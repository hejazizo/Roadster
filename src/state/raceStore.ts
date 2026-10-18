import { create } from 'zustand'
import { TUNING } from '../config/tuning'
import { loadBestTime, saveBestTime } from './bestTimes'

export type RacePhase = 'menu' | 'countdown' | 'racing' | 'finished'

export type RaceState = {
  phase: RacePhase
  paused: boolean // physics (and so the race clock) stops while set
  levelId: string
  ringCount: number
  nextRing: number // index of the ring that counts next
  countdown: number // s left before the start
  time: number // s since the start, physics time
  finalTime: number | null
  bestTime: number | null // saved best for this level
  newBest: boolean // the finished run set the best time
  runId: number // bumped on every restart or quit; the car watches it to return to spawn
  setCourse: (levelId: string, ringCount: number) => void
  restart: () => void
  quit: () => void
  setPaused: (paused: boolean) => void
  tick: (dt: number) => void
  passRing: (index: number) => void
}

// Ring time trial: menu → countdown → racing → finished, with pause during countdown and
// racing. Stepped from the physics loop (`tick` per step, `passRing` from ring sensors) so
// the clock matches the simulation.
export const useRaceStore = create<RaceState>((set, get) => ({
  phase: 'menu',
  paused: false,
  levelId: '',
  ringCount: 0,
  nextRing: 0,
  countdown: 0,
  time: 0,
  finalTime: null,
  bestTime: null,
  newBest: false,
  runId: 0,

  setCourse: (levelId, ringCount) => set({ levelId, ringCount, bestTime: loadBestTime(levelId) }),

  restart: () =>
    set((s) => ({
      phase: 'countdown',
      paused: false,
      nextRing: 0,
      countdown: TUNING.race.countdown,
      time: 0,
      finalTime: null,
      newBest: false,
      runId: s.runId + 1,
    })),

  quit: () =>
    set((s) => ({
      phase: 'menu',
      paused: false,
      nextRing: 0,
      countdown: 0,
      time: 0,
      finalTime: null,
      newBest: false,
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
    const { phase, nextRing, ringCount, time, levelId, bestTime } = get()
    if (phase !== 'racing' || index !== nextRing) return
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
}))

// The car is held at the start until the countdown ends.
export const isCarHeld = (phase: RacePhase) => phase === 'menu' || phase === 'countdown'

// A run is under way (and can be paused).
export const isRunning = (phase: RacePhase) => phase === 'countdown' || phase === 'racing'
