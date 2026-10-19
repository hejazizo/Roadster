import { Gamepad2, LogOut, Play, RotateCcw, Settings } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { sfx } from '../audio/sounds'
import { CAR_MODEL_CREDIT } from '../config/assets'
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
import { ChoiceCard, KeyCap, MedalChip, MenuButton, Segmented } from './components'
import ControlsSheet from './ControlsSheet'
import { formatPoints } from './formatPoints'
import { formatTime } from './formatTime'
import { isSheetOpen, useMenuNav } from './menuNav'
import './Menus.css'
import { useCountUp } from './motion'
import SettingsSheet from './SoundSettings'

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
// Pickers: a tick, then the change.
const pick = (change: () => void) => {
  sfx.uiTick()
  change()
}

const stepPaint = (dir: 1 | -1) => pick(() => usePaintStore.getState().cyclePaint(dir))
const stepAssists = () => pick(() => useAssistStore.getState().cycleMode())
const stepMode = () => pick(() => useModeStore.getState().cycleMode())

const MODE_DESCRIPTIONS = {
  rings: 'Every ring in order, against the clock',
  reveal: 'Half-loop, inverted hold, drop, fleet jump: scored',
}

const ASSIST_HINTS = {
  beginner: 'Steadier drifts, steering and landings',
  pro: 'Light help: catch your own slides',
}

type Screen = 'main' | 'pause' | 'results' | null
type SheetId = 'settings' | 'controls' | null

const screenOf = (s: RaceState): Screen =>
  s.phase === 'menu' ? 'main' : s.phase === 'finished' ? 'results' : s.paused ? 'pause' : null

// Screen hotkeys: pause toggles a run (or leaves the results), back quits the pause and
// results screens, the mode and assist keys switch them, and restart works during a run. Confirm, left / right and up / down go to each screen's focus (menuNav.ts), and a
// sheet takes them all while it's open. Leaving the tab or window, or unplugging a gamepad,
// pauses a run.
function useMenuInput() {
  useEffect(() => {
    const offPress = onPress((action) => {
      if (isSheetOpen()) return
      const race = useRaceStore.getState()
      const screen = screenOf(race)
      if (action === 'pause') {
        if (isRunning(race.phase)) {
          sfx.uiTick()
          race.setPaused(!race.paused)
        } else if (screen === 'results') quit()
      } else if (screen) {
        if (action === 'back' && screen !== 'main') quit()
        else if (screen === 'main' && action === 'mode' && hasStunts()) stepMode()
        else if (screen !== 'results' && action === 'assists') stepAssists()
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

const useLevelEntry = () => {
  const levelId = useLevelStore((s) => s.levelId)
  return LEVELS.find(({ level }) => level.id === levelId) ?? LEVELS[0]
}

// A sheet over a screen, opened from its buttons.
function useSheet() {
  const [sheet, setSheet] = useState<SheetId>(null)
  const open = (id: SheetId) => () => {
    sfx.uiTick()
    setSheet(id)
  }
  const close = () => {
    sfx.uiBack()
    setSheet(null)
  }
  const element =
    sheet === 'settings' ? (
      <SettingsSheet onClose={close} />
    ) : sheet === 'controls' ? (
      <ControlsSheet onClose={close} />
    ) : null
  return { open, element }
}

// Paint swatches. Like every menu control they never take focus; the keyboard and gamepad
// cycle paints with left / right.
function PaintPicker({ focused }: { focused: boolean }) {
  const paintId = usePaintStore((s) => s.paintId)
  const current = PAINTS.find((p) => p.id === paintId) ?? PAINTS[0]
  return (
    <div className="menu-field">
      <div className="menu-field-head">
        <span className="ui-label">
          Paint <span className="menu-field-value">{current.name}</span>
        </span>
        <KeyCap refs={['prev', 'next']} />
      </div>
      <div
        className={`menu-swatches${focused ? ' is-focused' : ''}`}
        role="radiogroup"
        aria-label="Paint"
      >
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

function AssistPicker({ focused }: { focused: boolean }) {
  const mode = useAssistStore((s) => s.mode)
  return (
    <div className="menu-field">
      <div className="menu-field-head">
        <span className="ui-label">Assists</span>
        <KeyCap refs={['assists']} />
      </div>
      <Segmented
        label="Assists"
        options={ASSIST_MODES}
        value={mode}
        onChange={(id) => pick(() => useAssistStore.getState().setMode(id))}
        focused={focused}
      />
      <div className="menu-hint">{ASSIST_HINTS[mode]}</div>
    </div>
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
    <>
      <span className="ui-label">Best</span>
      {best === null ? (
        <span className="menu-best-empty">None yet</span>
      ) : (
        <>
          <span className="menu-best-value ui-mono">
            {reveal ? best.toLocaleString('en-US') : formatTime(best)}
          </span>
          {reveal && <MedalChip medal={medalFor(best, assist)} />}
        </>
      )}
    </>
  )
}

function MainMenu() {
  const mode = useRunMode()
  const stunts = !!useLevel().stunts
  const level = useLevelEntry()
  const sheet = useSheet()
  const nav = useMenuNav(
    [
      ...(stunts ? [{ id: 'mode', activate: stepMode, adjust: stepMode }] : []),
      { id: 'play', activate: play },
      { id: 'paint', adjust: stepPaint },
      { id: 'assists', activate: stepAssists, adjust: stepAssists },
      { id: 'settings', activate: sheet.open('settings') },
      { id: 'controls', activate: sheet.open('controls') },
    ],
    'play',
    { fallbackAdjust: stepPaint },
  )
  const modeIndex = RUN_MODES.findIndex((m) => m.id === mode)
  return (
    <div className="menu-main ui-root">
      <header className="menu-topbar">
        <div className="menu-brand">
          <h1 className="menu-wordmark">Roadster</h1>
          <div className="menu-tagline">
            <span className="menu-tagline-level">{level.name}</span> · {level.description}
          </div>
        </div>
        <div className="menu-topbar-buttons">
          <MenuButton
            icon={Settings}
            label="Settings"
            onClick={sheet.open('settings')}
            focused={nav.isFocused('settings')}
            className="is-compact"
          />
          <MenuButton
            icon={Gamepad2}
            label="Controls"
            onClick={sheet.open('controls')}
            focused={nav.isFocused('controls')}
            className="is-compact"
          />
        </div>
      </header>
      <div className="menu-bottom">
        <div className="menu-run">
          <div className="menu-cards">
            <ChoiceCard
              label="Mode"
              title={RUN_MODES[modeIndex].name}
              description={MODE_DESCRIPTIONS[mode]}
              keys={['mode']}
              count={stunts ? RUN_MODES.length : 1}
              index={modeIndex}
              onStep={stunts ? stepMode : undefined}
              focused={nav.isFocused('mode')}
            >
              <BestLine />
            </ChoiceCard>
          </div>
          <MenuButton
            primary
            icon={Play}
            label="Play"
            action="confirm"
            onClick={play}
            focused={nav.isFocused('play')}
            className="menu-play"
          />
        </div>
        <section className="menu-car ui-panel" aria-label="Car">
          <PaintPicker focused={nav.isFocused('paint')} />
          <AssistPicker focused={nav.isFocused('assists')} />
        </section>
      </div>
      <p className="menu-credit">
        Car model by {CAR_MODEL_CREDIT.author} on{' '}
        <a href={CAR_MODEL_CREDIT.source} target="_blank" rel="noreferrer" tabIndex={-1}>
          {CAR_MODEL_CREDIT.site}
        </a>
        ,{' '}
        <a href={CAR_MODEL_CREDIT.licenseUrl} target="_blank" rel="noreferrer" tabIndex={-1}>
          {CAR_MODEL_CREDIT.license}
        </a>
        , modified
      </p>
      {sheet.element}
    </div>
  )
}

function PauseMenu() {
  const levelName = useLevelEntry().name
  const assist = useAssistStore((s) => s.mode)
  const sheet = useSheet()
  const nav = useMenuNav(
    [
      { id: 'resume', activate: resume },
      { id: 'restart', activate: play },
      { id: 'assists', activate: stepAssists, adjust: stepAssists },
      { id: 'settings', activate: sheet.open('settings') },
      { id: 'controls', activate: sheet.open('controls') },
      { id: 'quit', activate: quit },
    ],
    'restart',
  )
  return (
    <div className="menu-overlay is-dim ui-root">
      <div className="menu-dialog ui-panel">
        <header className="menu-dialog-head">
          <h2 className="menu-heading">Paused</h2>
          <span className="ui-label">{levelName}</span>
        </header>
        <div className="menu-buttons">
          <MenuButton
            primary
            icon={Play}
            label="Resume"
            action="pause"
            onClick={resume}
            focused={nav.isFocused('resume')}
          />
          <MenuButton
            icon={RotateCcw}
            label="Restart"
            action="confirm"
            onClick={play}
            focused={nav.isFocused('restart')}
          />
        </div>
        <div className="menu-field">
          <div className="menu-field-head">
            <span className="ui-label">Assists</span>
            <KeyCap refs={['assists']} />
          </div>
          <Segmented
            label="Assists"
            options={ASSIST_MODES}
            value={assist}
            onChange={(id) => pick(() => useAssistStore.getState().setMode(id))}
            focused={nav.isFocused('assists')}
          />
        </div>
        <div className="menu-buttons is-row">
          <MenuButton
            icon={Settings}
            label="Settings"
            onClick={sheet.open('settings')}
            focused={nav.isFocused('settings')}
          />
          <MenuButton
            icon={Gamepad2}
            label="Controls"
            onClick={sheet.open('controls')}
            focused={nav.isFocused('controls')}
          />
        </div>
        <MenuButton
          icon={LogOut}
          label="Quit to menu"
          action="back"
          onClick={quit}
          focused={nav.isFocused('quit')}
        />
      </div>
      {sheet.element}
    </div>
  )
}

function ResultButtons() {
  const nav = useMenuNav(
    [
      { id: 'retry', activate: play },
      { id: 'menu', activate: quit },
    ],
    'retry',
  )
  return (
    <div className="menu-buttons is-row">
      <MenuButton
        primary
        icon={RotateCcw}
        label="Retry"
        action="confirm"
        onClick={play}
        focused={nav.isFocused('retry')}
      />
      <MenuButton
        icon={LogOut}
        label="Menu"
        action="back"
        onClick={quit}
        focused={nav.isFocused('menu')}
      />
    </div>
  )
}

// Results timing (ms): the big number counts up, then the breakdown lines come in one by
// one, then the medal and "New best".
const COUNT_MS = 900
const LINE_START = 250
const LINE_STEP = 90

const delay = (ms: number) => ({ '--delay': `${ms}ms` }) as CSSProperties

// The reveal run's results: the score, its medal and the breakdown.
function StuntResults() {
  const score = useRaceStore((s) => s.score)
  const assist = useRaceStore((s) => s.assist)
  const best = useRaceStore((s) => s.bestScores[s.assist])
  const newBest = useRaceStore((s) => s.newBest)
  const shown = useCountUp(score?.total ?? 0, COUNT_MS, { delay: 150 })
  if (!score) return null
  const metaDelay = Math.max(COUNT_MS + 150, LINE_START + LINE_STEP * score.lines.length)
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
          <div className="menu-result-value ui-mono">
            {Math.round(shown).toLocaleString('en-US')}
          </div>
          <div className="menu-result-meta is-reveal" style={delay(metaDelay)}>
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
            {score.lines.map(({ label, detail, points }, i) => (
              <tr
                key={label}
                className={points < 0 ? 'is-penalty' : points === 0 ? 'is-zero' : undefined}
                style={delay(LINE_START + LINE_STEP * i)}
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
  const levelName = useLevelEntry().name
  const shown = useCountUp(finalTime, COUNT_MS, { delay: 150 })
  return (
    <div className="menu-overlay ui-root">
      <div className="menu-dialog ui-panel">
        <header className="menu-dialog-head">
          <h2 className="menu-heading">Finished</h2>
          <span className="ui-label">{levelName}</span>
        </header>
        <div className="menu-result">
          <div className="menu-result-value ui-mono">{formatTime(shown)}</div>
          <div className="menu-result-meta is-reveal" style={delay(COUNT_MS + 150)}>
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

// Main menu, pause menu and results screen over the canvas. Nothing in them takes DOM
// focus, so Enter and Space always reach the input layer.
export default function Menus() {
  useMenuInput()
  const screen = useRaceStore(screenOf)
  if (screen === 'main') return <MainMenu />
  if (screen === 'pause') return <PauseMenu />
  if (screen === 'results') return <Results />
  return null
}
