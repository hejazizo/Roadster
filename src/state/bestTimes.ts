import type { AssistMode } from './stuntRun'

// Best times and scores in localStorage. Storage can be missing or throw (private mode,
// blocked site data), so every access is guarded and a failure just means "no best yet".
const timeKey = (levelId: string) => `roadster.bestTime.${levelId}`
// Scores are per mode and per assist mode, since the medals are.
const scoreKey = (levelId: string, mode: string, assist: AssistMode) =>
  `roadster.bestScore.${levelId}.${mode}.${assist}`

function load(key: string, valid: (value: number) => boolean): number | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null || raw.trim() === '') return null
    const value = Number(raw)
    return Number.isFinite(value) && valid(value) ? value : null
  } catch {
    return null
  }
}

function save(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Not saved; the best still holds for this session.
  }
}

export const loadBestTime = (levelId: string) => load(timeKey(levelId), (v) => v > 0)

export const saveBestTime = (levelId: string, seconds: number) => save(timeKey(levelId), seconds)

export const loadBestScore = (levelId: string, mode: string, assist: AssistMode) =>
  load(scoreKey(levelId, mode, assist), (v) => v >= 0 && Number.isInteger(v))

export const saveBestScore = (levelId: string, mode: string, assist: AssistMode, score: number) =>
  save(scoreKey(levelId, mode, assist), score)
