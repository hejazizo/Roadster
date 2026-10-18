import { create } from 'zustand'

// Volume settings, kept in localStorage like the paint. Storage can be missing or throw
// (private mode, blocked site data), so a failure just means the defaults.
const KEY = 'roadster.audio'

export type Bus = 'master' | 'music' | 'sfx'

type Volumes = Record<Bus, number> & { muted: boolean }

const DEFAULTS: Volumes = { master: 0.8, music: 0.5, sfx: 0.8, muted: false }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// Junk or missing fields fall back to their default one by one.
function loadVolumes(): Volumes {
  const volumes = { ...DEFAULTS }
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof saved !== 'object' || saved === null) return volumes
    const s = saved as Record<string, unknown>
    for (const bus of ['master', 'music', 'sfx'] as const) {
      const v = s[bus]
      if (typeof v === 'number' && Number.isFinite(v)) volumes[bus] = clamp01(v)
    }
    if (typeof s.muted === 'boolean') volumes.muted = s.muted
  } catch {
    // Unreadable or not JSON: defaults.
  }
  return volumes
}

function saveVolumes({ master, music, sfx, muted }: Volumes) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ master, music, sfx, muted }))
  } catch {
    // Not saved; the settings still hold for this session.
  }
}

export type AudioState = Volumes & {
  started: boolean // the audio context exists (after the first click or key press)
  setVolume: (bus: Bus, value: number) => void // 0–1
  toggleMute: () => void
}

export const useAudioStore = create<AudioState>((set, get) => ({
  ...loadVolumes(),
  started: false,

  setVolume: (bus, value) => {
    set({ [bus]: clamp01(value) })
    saveVolumes(get())
  },

  toggleMute: () => {
    set({ muted: !get().muted })
    saveVolumes(get())
  },
}))
