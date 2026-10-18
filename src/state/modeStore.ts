import { create } from 'zustand'
import { useLevelStore } from './levelStore'
import { LEVELS } from '../scene/levels'

// The run mode, picked on the main menu and kept in localStorage: the ring time trial, or the
// reveal run on a level that has one (Level.stunts). Storage can be missing or throw
// (private mode, blocked site data), so a failure just means the time trial.
export type RunMode = 'rings' | 'reveal'

export const RUN_MODES: { id: RunMode; name: string }[] = [
  { id: 'rings', name: 'Ring time trial' },
  { id: 'reveal', name: 'Reveal run' },
]

const KEY = 'roadster.mode'

const isMode = (value: unknown): value is RunMode => RUN_MODES.some((m) => m.id === value)

function loadMode(): RunMode {
  try {
    const mode = localStorage.getItem(KEY)
    return isMode(mode) ? mode : RUN_MODES[0].id
  } catch {
    return RUN_MODES[0].id
  }
}

function saveMode(mode: RunMode) {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Not saved; the choice still holds for this session.
  }
}

export type ModeState = {
  mode: RunMode // as picked; see runModeFor for the one a level plays
  setMode: (mode: RunMode) => void
  cycleMode: () => void
}

export const useModeStore = create<ModeState>((set, get) => ({
  mode: loadMode(),

  setMode: (mode) => {
    if (!isMode(mode)) return
    saveMode(mode)
    set({ mode })
  },

  cycleMode: () => {
    const i = RUN_MODES.findIndex((m) => m.id === get().mode)
    get().setMode(RUN_MODES[(i + 1) % RUN_MODES.length].id)
  },
}))

// The mode a level plays: the time trial on a level without a reveal run.
export const runModeFor = (levelId: string, mode: RunMode): RunMode =>
  mode === 'reveal' && LEVELS.some(({ level }) => level.id === levelId && level.stunts)
    ? 'reveal'
    : 'rings'

export const useRunMode = () => {
  const levelId = useLevelStore((s) => s.levelId)
  const mode = useModeStore((s) => s.mode)
  return runModeFor(levelId, mode)
}
