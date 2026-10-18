import { create } from 'zustand'
import { TUNING } from '../config/tuning'

export type RacePhase = 'ready' | 'countdown' | 'racing' | 'finished'

export type RaceState = {
  phase: RacePhase
  ringCount: number
  nextRing: number // index of the ring that counts next
  countdown: number // s left before the start
  time: number // s since the start, physics time
  finalTime: number | null
  runId: number // bumped on every restart; the car watches it to return to spawn
  setCourse: (ringCount: number) => void
  restart: () => void
  tick: (dt: number) => void
  passRing: (index: number) => void
}

// Ring time trial: ready → countdown → racing → finished. Stepped from the physics loop
// (`tick` per step, `passRing` from ring sensors) so the clock matches the simulation.
export const useRaceStore = create<RaceState>((set, get) => ({
  phase: 'ready',
  ringCount: 0,
  nextRing: 0,
  countdown: 0,
  time: 0,
  finalTime: null,
  runId: 0,

  setCourse: (ringCount) => set({ ringCount }),

  restart: () =>
    set((s) => ({
      phase: 'countdown',
      nextRing: 0,
      countdown: TUNING.race.countdown,
      time: 0,
      finalTime: null,
      runId: s.runId + 1,
    })),

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
    const { phase, nextRing, ringCount, time } = get()
    if (phase !== 'racing' || index !== nextRing) return
    if (index === ringCount - 1) set({ phase: 'finished', nextRing: ringCount, finalTime: time })
    else set({ nextRing: index + 1 })
  },
}))

// The car is held at the start until the countdown ends.
export const isCarHeld = (phase: RacePhase) => phase === 'ready' || phase === 'countdown'
