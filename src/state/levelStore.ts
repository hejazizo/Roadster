import { create } from 'zustand'
import { LEVELS } from '../scene/levels'

// The level, picked on the main menu and kept in localStorage. Storage can be missing or
// throw (private mode, blocked site data), so a failure just means the first level.
const KEY = 'roadster.level'

const isLevel = (value: unknown): value is string => LEVELS.some(({ level }) => level.id === value)

function loadLevel(): string {
  try {
    const id = localStorage.getItem(KEY)
    return isLevel(id) ? id : LEVELS[0].level.id
  } catch {
    return LEVELS[0].level.id
  }
}

function saveLevel(id: string) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Not saved; the choice still holds for this session.
  }
}

export type LevelState = {
  levelId: string
  setLevel: (id: string) => void
  cycleLevel: () => void
}

export const useLevelStore = create<LevelState>((set, get) => ({
  levelId: loadLevel(),

  setLevel: (id) => {
    if (!isLevel(id)) return
    saveLevel(id)
    set({ levelId: id })
  },

  cycleLevel: () => {
    const i = LEVELS.findIndex(({ level }) => level.id === get().levelId)
    get().setLevel(LEVELS[(i + 1) % LEVELS.length].level.id)
  },
}))

// The chosen level's data.
export const useLevel = () =>
  useLevelStore((s) => (LEVELS.find(({ level }) => level.id === s.levelId) ?? LEVELS[0]).level)
