// Best times per level in localStorage. Storage can be missing or throw (private mode,
// blocked site data), so every access is guarded and a failure just means "no best time".
const key = (levelId: string) => `roadster.bestTime.${levelId}`

export function loadBestTime(levelId: string): number | null {
  try {
    const value = Number(localStorage.getItem(key(levelId)))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function saveBestTime(levelId: string, seconds: number) {
  try {
    localStorage.setItem(key(levelId), String(seconds))
  } catch {
    // Not saved; the best time still holds for this session.
  }
}
