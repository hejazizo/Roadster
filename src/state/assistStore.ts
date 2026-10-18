import { create } from 'zustand'
import { TUNING } from '../config/tuning'

export type AssistMode = keyof typeof TUNING.assists

export const ASSIST_MODES: { id: AssistMode; name: string }[] = [
  { id: 'beginner', name: 'Beginner' },
  { id: 'pro', name: 'Pro' },
]

// The driving assist mode, picked on the menus and kept in localStorage. Storage can be
// missing or throw (private mode, blocked site data), so a failure just means the default.
const KEY = 'roadster.assists'

const isMode = (value: unknown): value is AssistMode => ASSIST_MODES.some((m) => m.id === value)

function loadMode(): AssistMode {
  try {
    const mode = localStorage.getItem(KEY)
    return isMode(mode) ? mode : ASSIST_MODES[0].id
  } catch {
    return ASSIST_MODES[0].id
  }
}

function saveMode(mode: AssistMode) {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Not saved; the mode still holds for this session.
  }
}

export type AssistState = {
  mode: AssistMode
  setMode: (mode: AssistMode) => void
  cycleMode: () => void
}

export const useAssistStore = create<AssistState>((set, get) => ({
  mode: loadMode(),

  setMode: (mode) => {
    if (!isMode(mode)) return
    saveMode(mode)
    set({ mode })
  },

  cycleMode: () => {
    const i = ASSIST_MODES.findIndex((m) => m.id === get().mode)
    get().setMode(ASSIST_MODES[(i + 1) % ASSIST_MODES.length].id)
  },
}))

// The current mode's assist values, read live from TUNING (the tuning panel edits them).
export const currentAssist = () => TUNING.assists[useAssistStore.getState().mode]
