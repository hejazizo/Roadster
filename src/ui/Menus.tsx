import { useEffect } from 'react'
import { sfx } from '../audio/sounds'
import { CAR_MODEL_CREDIT } from '../config/assets'
import { bindingLabel, type BindingRef, type ButtonAction } from '../config/bindings'
import { PAINTS } from '../config/paints'
import { onPress } from '../input/input'
import { LEVELS } from '../scene/levels'
import { ASSIST_MODES, useAssistStore } from '../state/assistStore'
import { useInputStore } from '../state/inputStore'
import { useLevelStore } from '../state/levelStore'
import { usePaintStore } from '../state/paintStore'
import { isRunning, useRaceStore, type RaceState } from '../state/raceStore'
import { formatTime } from './formatTime'
import './Menus.css'
import SoundSettings from './SoundSettings'

const play = () => {
  sfx.uiConfirm()
  useRaceStore.getState().restart()
}
const quit = () => {
  sfx.uiBack()
  useRaceStore.getState().quit()
}
const resume = () => {
  sfx.uiTick()
  useRaceStore.getState().setPaused(false)
}
// Silent: also called when the window loses focus.
const pause = () => useRaceStore.getState().setPaused(true)
// Paint and assist pickers: a tick, then the change.
const pick = (change: () => void) => {
  sfx.uiTick()
  change()
}

const CONTROLS: [BindingRef[], string][] = [
  [
    [
      ['throttle', 1],
      ['throttle', -1],
    ],
    'Drive, brake, reverse',
  ],
  [
    [
      ['steer', -1],
      ['steer', 1],
    ],
    'Steer',
  ],
  [['boost'], 'Boost'],
  [['hop'], 'Hop, hold to glide'],
  [['handbrake'], 'Handbrake'],
  [['reset'], 'Back to safe point'],
  [['restart'], 'Restart'],
  [['pause'], 'Pause'],
  [['mute'], 'Sound on / off'],
]

type Screen = 'main' | 'pause' | 'results' | null

const screenOf = (s: RaceState): Screen =>
  s.phase === 'menu' ? 'main' : s.phase === 'finished' ? 'results' : s.paused ? 'pause' : null

// Menu actions: pause toggles a run (or leaves the results), confirm and back pick the
// screen's buttons, and restart works during a run. Leaving the tab or window, or
// unplugging a gamepad, pauses a run.
function useMenuInput() {
  useEffect(() => {
    const offPress = onPress((action) => {
      const race = useRaceStore.getState()
      const screen = screenOf(race)
      if (action === 'pause') {
        if (isRunning(race.phase)) {
          sfx.uiTick()
          race.setPaused(!race.paused)
        } else if (screen === 'results') quit()
      } else if (screen) {
        if (action === 'confirm') play()
        else if (action === 'back' && screen !== 'main') quit()
        else if (screen === 'main' && (action === 'prev' || action === 'next')) {
          pick(() => usePaintStore.getState().cyclePaint(action === 'next' ? 1 : -1))
        } else if (screen === 'main' && action === 'level') {
          pick(() => useLevelStore.getState().cycleLevel())
        } else if (screen !== 'results' && action === 'assists') {
          pick(() => useAssistStore.getState().cycleMode())
        }
      } else if (action === 'restart') {
        play()
      }
    })
    const offGamepads = useInputStore.subscribe((s, prev) => {
      if (s.gamepads < prev.gamepads) pause()
    })
    const onVisibilityChange = () => {
      if (document.hidden) pause()
    }

    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      offPress()
      offGamepads()
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}

type MenuButtonProps = {
  label: string
  action: ButtonAction // shown as the button's key hint
  onClick: () => void
  primary?: boolean
}

function MenuButton({ label, action, onClick, primary }: MenuButtonProps) {
  const device = useInputStore((s) => s.device)
  return (
    <button
      type="button"
      className={primary ? 'menu-button is-primary' : 'menu-button'}
      onClick={onClick}
    >
      {label}
      <kbd className="menu-key">{bindingLabel([action], device)}</kbd>
    </button>
  )
}

// Paint swatches. They never take focus (no tab stop, no focus on click), so Enter and Space
// keep going to the menu's actions; the keyboard and gamepad cycle paints with prev / next.
function PaintPicker() {
  const paintId = usePaintStore((s) => s.paintId)
  const device = useInputStore((s) => s.device)
  const current = PAINTS.find((p) => p.id === paintId) ?? PAINTS[0]
  return (
    <div className="menu-paint">
      <div className="menu-paint-label">
        <span>
          <span className="hud-label">Paint</span> {current.name}
        </span>
        <kbd className="menu-key">{bindingLabel(['prev', 'next'], device)}</kbd>
      </div>
      <div className="menu-swatches" role="radiogroup" aria-label="Paint">
        {PAINTS.map((paint) => (
          <button
            key={paint.id}
            type="button"
            role="radio"
            aria-checked={paint.id === paintId}
            aria-label={paint.name}
            title={paint.name}
            tabIndex={-1}
            className={`menu-swatch${paint.id === paintId ? ' is-selected' : ''}`}
            style={{ background: paint.color }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(() => usePaintStore.getState().setPaint(paint.id))}
          />
        ))}
      </div>
    </div>
  )
}

// Assist mode, a segmented pair that never takes focus, like the paint swatches; the
// keyboard and gamepad switch it with the assists action.
function AssistPicker() {
  const mode = useAssistStore((s) => s.mode)
  const device = useInputStore((s) => s.device)
  return (
    <div className="menu-assists">
      <div className="menu-paint-label">
        <span className="hud-label">Assists</span>
        <kbd className="menu-key">{bindingLabel(['assists'], device)}</kbd>
      </div>
      <div className="menu-segments" role="radiogroup" aria-label="Assists">
        {ASSIST_MODES.map(({ id, name }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={id === mode}
            tabIndex={-1}
            className={`menu-segment${id === mode ? ' is-selected' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(() => useAssistStore.getState().setMode(id))}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="menu-assists-hint">
        {mode === 'beginner'
          ? 'Steadier drifts, steering and landings'
          : 'Light help: catch your own slides'}
      </div>
    </div>
  )
}

// Level choice on the main menu, a segmented pair like the assists.
function LevelPicker() {
  const levelId = useLevelStore((s) => s.levelId)
  const device = useInputStore((s) => s.device)
  return (
    <div className="menu-assists">
      <div className="menu-paint-label">
        <span className="hud-label">Level</span>
        <kbd className="menu-key">{bindingLabel(['level'], device)}</kbd>
      </div>
      <div className="menu-segments" role="radiogroup" aria-label="Level">
        {LEVELS.map(({ level: { id }, name }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={id === levelId}
            tabIndex={-1}
            className={`menu-segment${id === levelId ? ' is-selected' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(() => useLevelStore.getState().setLevel(id))}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

function MainMenu() {
  const bestTime = useRaceStore((s) => s.bestTime)
  const device = useInputStore((s) => s.device)
  return (
    <div className="menu">
      <div className="menu-card">
        <h1 className="menu-title">Roadster</h1>
        <div className="menu-subtitle">Ring time trial</div>
        <LevelPicker />
        <div className="menu-best">
          {bestTime === null ? (
            'No best time yet'
          ) : (
            <>
              <span className="hud-label">Best</span> {formatTime(bestTime)}
            </>
          )}
        </div>
        <PaintPicker />
        <AssistPicker />
        <div className="menu-buttons">
          <MenuButton primary label="Play" action="confirm" onClick={play} />
        </div>
        <SoundSettings />
        <dl className="menu-controls">
          {CONTROLS.map(([refs, description]) => {
            // Actions without a binding on this device (mute on a gamepad) are left out.
            const label = bindingLabel(refs, device)
            return (
              label && (
                <div key={description}>
                  <dt>{label}</dt>
                  <dd>{description}</dd>
                </div>
              )
            )
          })}
        </dl>
        <p className="menu-credit">
          Car model by {CAR_MODEL_CREDIT.author} on{' '}
          <a href={CAR_MODEL_CREDIT.source} target="_blank" rel="noreferrer">
            {CAR_MODEL_CREDIT.site}
          </a>
          ,{' '}
          <a href={CAR_MODEL_CREDIT.licenseUrl} target="_blank" rel="noreferrer">
            {CAR_MODEL_CREDIT.license}
          </a>
          , modified
        </p>
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
          <MenuButton primary label="Resume" action="pause" onClick={resume} />
          <MenuButton label="Restart" action="confirm" onClick={play} />
          <MenuButton label="Quit" action="back" onClick={quit} />
        </div>
        <AssistPicker />
        <SoundSettings />
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
          <MenuButton primary label="Retry" action="confirm" onClick={play} />
          <MenuButton label="Menu" action="back" onClick={quit} />
        </div>
      </div>
    </div>
  )
}

// Main menu, pause menu and results screen over the canvas. Each screen unmounts when its
// buttons are used, so no button keeps focus (Space would click it again).
export default function Menus() {
  useMenuInput()
  const screen = useRaceStore(screenOf)
  if (screen === 'main') return <MainMenu />
  if (screen === 'pause') return <PauseMenu />
  if (screen === 'results') return <Results />
  return null
}
