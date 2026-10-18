import { useEffect } from 'react'
import { isRunning, useRaceStore } from '../state/raceStore'
import { formatTime } from './formatTime'
import { isTypingTarget } from './isTypingTarget'
import './Menus.css'

const play = () => useRaceStore.getState().restart()
const quit = () => useRaceStore.getState().quit()
const resume = () => useRaceStore.getState().setPaused(false)

const CONTROLS: [string, string][] = [
  ['W / S', 'Drive, brake, reverse'],
  ['A / D', 'Steer'],
  ['Shift', 'Boost'],
  ['Space', 'Hop, hold to glide'],
  ['E', 'Handbrake'],
  ['R', 'Back to safe point'],
  ['Enter', 'Restart'],
  ['Esc', 'Pause'],
]

// Menu keys: Enter (re)starts, Esc pauses/resumes (or leaves the results), Q quits to the
// main menu. Leaving the tab or window pauses a run. Temporary until the input layer in M8.
function useMenuKeys() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e)) return
      // Enter on a focused button already clicks it.
      if (e.code === 'Enter' && e.target instanceof HTMLButtonElement) return
      const { phase, paused, setPaused } = useRaceStore.getState()
      if (e.code === 'Enter') play()
      else if (e.code === 'Escape' && isRunning(phase)) setPaused(!paused)
      else if (e.code === 'Escape' && phase === 'finished') quit()
      else if (e.code === 'KeyQ' && (paused || phase === 'finished')) quit()
      else return
      e.preventDefault()
    }
    const pause = () => useRaceStore.getState().setPaused(true)
    const onVisibilityChange = () => {
      if (document.hidden) pause()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}

type MenuButtonProps = {
  label: string
  keyHint: string
  onClick: () => void
  primary?: boolean
}

function MenuButton({ label, keyHint, onClick, primary }: MenuButtonProps) {
  return (
    <button
      type="button"
      className={primary ? 'menu-button is-primary' : 'menu-button'}
      onClick={onClick}
    >
      {label}
      <kbd className="menu-key">{keyHint}</kbd>
    </button>
  )
}

function MainMenu() {
  const bestTime = useRaceStore((s) => s.bestTime)
  return (
    <div className="menu">
      <div className="menu-card">
        <h1 className="menu-title">Roadster</h1>
        <div className="menu-subtitle">Ring time trial</div>
        <div className="menu-best">
          {bestTime === null ? (
            'No best time yet'
          ) : (
            <>
              <span className="hud-label">Best</span> {formatTime(bestTime)}
            </>
          )}
        </div>
        <div className="menu-buttons">
          <MenuButton primary label="Play" keyHint="Enter" onClick={play} />
        </div>
        <dl className="menu-controls">
          {CONTROLS.map(([key, action]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function PauseMenu() {
  return (
    <div className="menu is-dim">
      <div className="menu-card">
        <h2 className="menu-heading">Paused</h2>
        <div className="menu-buttons">
          <MenuButton primary label="Resume" keyHint="Esc" onClick={resume} />
          <MenuButton label="Restart" keyHint="Enter" onClick={play} />
          <MenuButton label="Quit" keyHint="Q" onClick={quit} />
        </div>
      </div>
    </div>
  )
}

function Results() {
  const finalTime = useRaceStore((s) => s.finalTime ?? 0)
  const bestTime = useRaceStore((s) => s.bestTime)
  const newBest = useRaceStore((s) => s.newBest)
  return (
    <div className="menu">
      <div className="menu-card">
        <h2 className="menu-heading">Finished</h2>
        <div className="menu-time">{formatTime(finalTime)}</div>
        <div className="menu-best">
          {newBest ? (
            <span className="menu-badge">New best!</span>
          ) : (
            bestTime !== null && (
              <>
                <span className="hud-label">Best</span> {formatTime(bestTime)}
              </>
            )
          )}
        </div>
        <div className="menu-buttons">
          <MenuButton primary label="Retry" keyHint="Enter" onClick={play} />
          <MenuButton label="Menu" keyHint="Esc" onClick={quit} />
        </div>
      </div>
    </div>
  )
}

// Main menu, pause menu and results screen over the canvas. Each screen unmounts when its
// buttons are used, so no button keeps focus (Space would click it again).
export default function Menus() {
  useMenuKeys()
  const screen = useRaceStore((s) =>
    s.phase === 'menu' ? 'main' : s.phase === 'finished' ? 'results' : s.paused ? 'pause' : null,
  )
  if (screen === 'main') return <MainMenu />
  if (screen === 'pause') return <PauseMenu />
  if (screen === 'results') return <Results />
  return null
}
