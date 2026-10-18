import { LogOut, Play, RotateCcw, type LucideIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { sfx } from '../audio/sounds'
import { CAR_MODEL_CREDIT } from '../config/assets'
import type { BindingRef, ButtonAction } from '../config/bindings'
import { PAINTS } from '../config/paints'
import { onPress } from '../input/input'
import { LEVELS } from '../scene/levels'
import { ASSIST_MODES, useAssistStore } from '../state/assistStore'
import { useInputStore } from '../state/inputStore'
import { useLevel, useLevelStore } from '../state/levelStore'
import { RUN_MODES, useModeStore, useRunMode } from '../state/modeStore'
import { usePaintStore } from '../state/paintStore'
import { isRunning, useRaceStore, type RaceState } from '../state/raceStore'
import { medalFor } from '../state/stuntRun'
import { KeyCap, MedalChip, Section, Segmented } from './components'
import { formatPoints } from './formatPoints'
import { formatTime } from './formatTime'
import './Menus.css'
import SoundSettings from './SoundSettings'

const play = () => {
  sfx.uiConfirm()
  useRaceStore.getState().restart(useAssistStore.getState().mode)
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
  [['fans'], 'Fans: stick to walls'],
  [['lift'], 'Jets: lift off, brake a fall'],
  [['airRoll'], 'In the air: hold and steer to roll'],
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
        } else if (screen === 'main' && action === 'mode' && hasStunts()) {
          pick(() => useModeStore.getState().cycleMode())
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
    const offAssists = useAssistStore.subscribe(({ mode }) =>
      useRaceStore.getState().noteAssist(mode),
    )
    const onVisibilityChange = () => {
      if (document.hidden) pause()
    }

    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      offPress()
      offGamepads()
      offAssists()
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}

// The chosen level offers the reveal run.
const hasStunts = () => {
  const { levelId } = useLevelStore.getState()
  return LEVELS.some(({ level }) => level.id === levelId && level.stunts)
}

const useLevelName = () => {
  const levelId = useLevelStore((s) => s.levelId)
  return LEVELS.find(({ level }) => level.id === levelId)?.name
}

type MenuButtonProps = {
  label: string
  action: ButtonAction // shown as the button's key hint
  onClick: () => void
  icon?: LucideIcon
  primary?: boolean
}

function MenuButton({ label, action, onClick, icon: Icon, primary }: MenuButtonProps) {
  return (
    <button
      type="button"
      className={primary ? 'menu-button is-primary' : 'menu-button'}
      onClick={onClick}
    >
      {Icon && <Icon className="menu-button-icon" size={16} strokeWidth={1.75} aria-hidden />}
      <span className="menu-button-label">{label}</span>
      <KeyCap refs={[action]} />
    </button>
  )
}

// One setting: its name (and current value), the key that changes it, the control and a hint.
function Field({
  label,
  value,
  keys,
  hint,
  children,
}: {
  label: string
  value?: string
  keys: BindingRef[]
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="menu-field">
      <div className="menu-field-head">
        <span className="ui-label">
          {label}
          {value && <span className="menu-field-value"> {value}</span>}
        </span>
        <KeyCap refs={keys} />
      </div>
      {children}
      {hint && <div className="menu-hint">{hint}</div>}
    </div>
  )
}

// Paint swatches. They never take focus (no tab stop, no focus on click), so Enter and Space
// keep going to the menu's actions; the keyboard and gamepad cycle paints with prev / next.
function PaintPicker() {
  const paintId = usePaintStore((s) => s.paintId)
  const current = PAINTS.find((p) => p.id === paintId) ?? PAINTS[0]
  return (
    <Field label="Paint" value={current.name} keys={['prev', 'next']}>
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
    </Field>
  )
}

function AssistPicker() {
  const mode = useAssistStore((s) => s.mode)
  return (
    <Field
      label="Assists"
      keys={['assists']}
      hint={
        mode === 'beginner'
          ? 'Steadier drifts, steering and landings'
          : 'Light help: catch your own slides'
      }
    >
      <Segmented
        label="Assists"
        options={ASSIST_MODES}
        value={mode}
        onChange={(id) => pick(() => useAssistStore.getState().setMode(id))}
      />
    </Field>
  )
}

function LevelPicker() {
  const levelId = useLevelStore((s) => s.levelId)
  return (
    <Field label="Level" keys={['level']}>
      <Segmented
        label="Level"
        options={LEVELS.map(({ level: { id }, name }) => ({ id, name }))}
        value={levelId}
        onChange={(id) => pick(() => useLevelStore.getState().setLevel(id))}
      />
    </Field>
  )
}

// Run mode, on a level that has a reveal run.
function ModePicker() {
  const mode = useRunMode()
  const stunts = useLevel().stunts
  if (!stunts) return null
  return (
    <Field
      label="Mode"
      keys={['mode']}
      hint={
        mode === 'reveal'
          ? 'Half-loop, inverted hold, drop, fleet jump: scored'
          : 'Every ring in order, against the clock'
      }
    >
      <Segmented
        label="Mode"
        options={RUN_MODES}
        value={mode}
        onChange={(id) => pick(() => useModeStore.getState().setMode(id))}
      />
    </Field>
  )
}

// The saved best for the chosen level, mode and (for the reveal run) assist mode.
function BestLine() {
  const mode = useRunMode()
  const assist = useAssistStore((s) => s.mode)
  const bestTime = useRaceStore((s) => s.bestTime)
  const bestScore = useRaceStore((s) => s.bestScores[assist])
  const reveal = mode === 'reveal'
  const best = reveal ? bestScore : bestTime
  return (
    <div className="menu-best">
      <span className="ui-label">{reveal ? 'Best score' : 'Best time'}</span>
      {best === null ? (
        <span className="menu-best-empty">None yet</span>
      ) : (
        <span className="menu-best-value">
          {reveal && <MedalChip medal={medalFor(best, assist)} />}
          <span className="ui-mono">
            {reveal ? best.toLocaleString('en-US') : formatTime(best)}
          </span>
        </span>
      )}
    </div>
  )
}

function ControlsCard() {
  const device = useInputStore((s) => s.device)
  return (
    <aside className="menu-controls ui-panel">
      <div className="menu-section-head">
        <h3 className="menu-section-title">Controls</h3>
        <span className="ui-label">{device === 'gamepad' ? 'Gamepad' : 'Keyboard'}</span>
      </div>
      <dl className="menu-controls-list">
        {CONTROLS.map(([refs, description]) => (
          <div key={description}>
            <dt>
              <KeyCap refs={refs} />
            </dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}

function MainMenu() {
  const mode = useRunMode()
  return (
    <div className="menu-main ui-root">
      <aside className="menu-sidebar">
        <header className="menu-brand">
          <h1 className="menu-wordmark">Roadster</h1>
          <div className="menu-tagline">{RUN_MODES.find((m) => m.id === mode)?.name}</div>
        </header>
        <div className="menu-sidebar-body">
          <Section title="Run">
            <LevelPicker />
            <ModePicker />
            <BestLine />
          </Section>
          <Section title="Car">
            <PaintPicker />
            <AssistPicker />
          </Section>
          <SoundSettings />
        </div>
        <footer className="menu-sidebar-foot">
          <MenuButton primary icon={Play} label="Play" action="confirm" onClick={play} />
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
        </footer>
      </aside>
      <ControlsCard />
    </div>
  )
}

function PauseMenu() {
  const levelName = useLevelName()
  return (
    <div className="menu-overlay is-dim ui-root">
      <div className="menu-dialog ui-panel">
        <header className="menu-dialog-head">
          <h2 className="menu-heading">Paused</h2>
          <span className="ui-label">{levelName}</span>
        </header>
        <div className="menu-buttons">
          <MenuButton primary icon={Play} label="Resume" action="pause" onClick={resume} />
          <MenuButton icon={RotateCcw} label="Restart" action="confirm" onClick={play} />
          <MenuButton icon={LogOut} label="Quit to menu" action="back" onClick={quit} />
        </div>
        <div className="menu-dialog-settings">
          <AssistPicker />
          <SoundSettings />
        </div>
      </div>
    </div>
  )
}

function ResultButtons() {
  return (
    <div className="menu-buttons">
      <MenuButton primary icon={RotateCcw} label="Retry" action="confirm" onClick={play} />
      <MenuButton icon={LogOut} label="Menu" action="back" onClick={quit} />
    </div>
  )
}

// The reveal run's results: the score, its medal and the breakdown.
function StuntResults() {
  const score = useRaceStore((s) => s.score)
  const assist = useRaceStore((s) => s.assist)
  const best = useRaceStore((s) => s.bestScores[s.assist])
  const newBest = useRaceStore((s) => s.newBest)
  if (!score) return null
  return (
    <div className="menu-overlay ui-root">
      <div className="menu-dialog is-wide ui-panel">
        <header className="menu-dialog-head">
          <h2 className="menu-heading">Reveal run</h2>
          <span className="ui-label">
            Scored as {ASSIST_MODES.find((m) => m.id === assist)?.name}
          </span>
        </header>
        <div className="menu-result">
          <div className="menu-result-value ui-mono">{score.total.toLocaleString('en-US')}</div>
          <div className="menu-result-meta">
            <MedalChip medal={score.medal} />
            {newBest ? (
              <span className="ui-chip is-new">New best</span>
            ) : (
              best !== null && (
                <span className="ui-label">
                  Best <span className="ui-mono">{best.toLocaleString('en-US')}</span>
                </span>
              )
            )}
          </div>
        </div>
        <table className="menu-breakdown">
          <tbody>
            {score.lines.map(({ label, detail, points }) => (
              <tr
                key={label}
                className={points < 0 ? 'is-penalty' : points === 0 ? 'is-zero' : undefined}
              >
                <th>{label}</th>
                <td className="ui-mono">{detail}</td>
                <td className="ui-mono">{formatPoints(points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ResultButtons />
      </div>
    </div>
  )
}

function TimeResults() {
  const finalTime = useRaceStore((s) => s.finalTime ?? 0)
  const bestTime = useRaceStore((s) => s.bestTime)
  const newBest = useRaceStore((s) => s.newBest)
  const levelName = useLevelName()
  return (
    <div className="menu-overlay ui-root">
      <div className="menu-dialog ui-panel">
        <header className="menu-dialog-head">
          <h2 className="menu-heading">Finished</h2>
          <span className="ui-label">{levelName}</span>
        </header>
        <div className="menu-result">
          <div className="menu-result-value ui-mono">{formatTime(finalTime)}</div>
          <div className="menu-result-meta">
            {newBest ? (
              <span className="ui-chip is-new">New best</span>
            ) : (
              bestTime !== null && (
                <span className="ui-label">
                  Best <span className="ui-mono">{formatTime(bestTime)}</span>
                </span>
              )
            )}
          </div>
        </div>
        <ResultButtons />
      </div>
    </div>
  )
}

function Results() {
  const reveal = useRaceStore((s) => s.mode === 'reveal')
  return reveal ? <StuntResults /> : <TimeResults />
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
