import { create } from 'zustand'
import { PAINTS } from '../config/paints'

// The car's paint, picked on the main menu and kept in localStorage. Storage can be missing
// or throw (private mode, blocked site data), so a failure just means the default paint.
const KEY = 'roadster.paint'

function loadPaint(): string {
  try {
    const id = localStorage.getItem(KEY)
    return PAINTS.some((p) => p.id === id) ? id! : PAINTS[0].id
  } catch {
    return PAINTS[0].id
  }
}

function savePaint(id: string) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Not saved; the paint still holds for this session.
  }
}

export type PaintState = {
  paintId: string // an id from PAINTS
  setPaint: (id: string) => void
  cyclePaint: (step: 1 | -1) => void // next / previous paint, wrapping around
}

export const usePaintStore = create<PaintState>((set, get) => ({
  paintId: loadPaint(),

  setPaint: (id) => {
    if (!PAINTS.some((p) => p.id === id)) return
    savePaint(id)
    set({ paintId: id })
  },

  cyclePaint: (step) => {
    const i = PAINTS.findIndex((p) => p.id === get().paintId)
    get().setPaint(PAINTS[(i + step + PAINTS.length) % PAINTS.length].id)
  },
}))

export const paintColor = (id: string) => (PAINTS.find((p) => p.id === id) ?? PAINTS[0]).color
