import type { CSSProperties, ReactNode } from 'react'
import type { ButtonAction } from '../config/bindings'
import { TUNING } from '../config/tuning'
import { useRaceStore } from '../state/raceStore'
import { STUNT_STEPS } from '../state/stuntRun'
import { KeyCap, Meter } from './components'
import { formatPoints } from './formatPoints'
import { formatTime } from './formatTime'
import { useCountUp } from './motion'

const GO_TIME = 0.8 // s "Go" stays up after the start

function Timer() {
  const time = useRaceStore((s) => formatTime(s.finalTime ?? s.time))
  return <div className="race-time ui-mono">{time}</div>
}

// A counter beside the timer; `pulse` changes replay its pop.
function Counter({
  label,
  pulse,
  children,
}: {
  label: string
  pulse: number
  children: ReactNode
}) {
  return (
    <div className="race-counter">
      <span className="ui-label">{label}</span>
      <span key={pulse} className="race-counter-value ui-mono">
        {children}
      </span>
    </div>
  )
}

function RingCount() {
  const passed = useRaceStore((s) => s.nextRing)
  const total = useRaceStore((s) => s.ringCount)
  return (
    <Counter label="Rings" pulse={passed}>
      {passed}
      <span className="race-counter-total"> / {total}</span>
    </Counter>
  )
}

// The reveal run's points so far (the time and no-contact bonuses come at the finish),
// counting towards each new total.
function Points() {
  const points = useRaceStore((s) => s.stunt.points)
  const shown = useCountUp(points, 450)
  return (
    <Counter label="Points" pulse={points}>
      {Math.round(shown).toLocaleString('en-US')}
    </Counter>
  )
}

// Short hints per step, with the keys (or pad buttons) the step needs as caps.
const key = (action: ButtonAction) => <KeyCap refs={[action]} />
const HINTS: (() => ReactNode)[] = [
  () => (
    <>
      Boost {key('boost')} up the half-loop with the fans {key('fans')} on
    </>
  ),
  () => <>Stop under the top and hold {TUNING.reveal.holdMin} s</>,
  () => <>Drive off the lip, roll upright with {key('airRoll')} + steer</>,
  () => <>Brake the fall with the jets {key('lift')}</>,
  () => <>Lift off {key('lift')} before the fleet and roll over it</>,
  () => <>Through the finish gate</>,
]

const HOLD_STEP = 1

// The six steps as a track: done (green, with a pop), failed (coral), current (pulsing, or
// filling with the inverted hold), still to come.
function StepTrack({ hold }: { hold: number | null }) {
  const step = useRaceStore((s) => s.stunt.step)
  const outcomes = useRaceStore((s) => s.stunt.outcomes)
  return (
    <ol
      className="race-steps"
      style={hold === null ? undefined : ({ '--hold': hold } as CSSProperties)}
    >
      {STUNT_STEPS.map((name, i) => {
        const state =
          i === step
            ? 'is-current'
            : outcomes[i] === 'failed'
              ? 'is-failed'
              : outcomes[i] !== 'pending'
                ? 'is-done'
                : ''
        return (
          <li
            key={name}
            className={`race-step ${state}${i === step && hold !== null ? ' is-holding' : ''}`}
          >
            <span className="race-step-bar" />
            <span className="race-step-name">{name}</span>
          </li>
        )
      })}
    </ol>
  )
}

// Objective: the step track, the step under way with a hint, and a bar while holding inverted.
function Objective() {
  const step = useRaceStore((s) => s.stunt.step)
  const hold = useRaceStore((s) =>
    s.stunt.step === HOLD_STEP ? Math.min(s.stunt.holdTime / TUNING.reveal.holdMin, 1) : null,
  )
  const holdTime = useRaceStore((s) => s.stunt.holdTime.toFixed(1))
  const done = step >= STUNT_STEPS.length
  return (
    <div className="race-objective">
      <StepTrack hold={hold} />
      {!done && (
        // Keyed so each new step slides in.
        <div key={step} className="race-objective-body">
          <div className="race-objective-step">
            <span className="ui-label">
              Step {step + 1} of {STUNT_STEPS.length}
            </span>
            <span className="race-objective-name">{STUNT_STEPS[step]}</span>
          </div>
          <div className="race-objective-hint">{HINTS[step]()}</div>
          {hold !== null && (
            <Meter
              className="race-objective-hold"
              label="Inverted hold"
              fraction={hold}
              value={`${holdTime} / ${TUNING.reveal.holdMin.toFixed(1)} s`}
              color={hold >= 1 ? 'var(--ui-ok)' : 'var(--ui-accent)'}
            />
          )}
        </div>
      )}
    </div>
  )
}

// Feedback for each step, bonus and penalty; each slides in and fades out on its own
// (Hud.css).
function Popups() {
  const popups = useRaceStore((s) => s.popups)
  return (
    <div className="race-popups">
      {popups.map(({ id, label, points, kind }) => (
        <div key={id} className={`race-popup is-${kind}`}>
          <span className="ui-dot" />
          {label}
          {points !== 0 && (
            <span className="race-popup-points ui-mono">{formatPoints(points)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// Big centre countdown and "Go"; selects a string so it re-renders only on change. The
// menu, pause and results screens are in Menus.tsx.
function Message() {
  const message = useRaceStore((s) => {
    if (s.phase === 'countdown') return String(Math.ceil(s.countdown))
    if (s.phase === 'racing' && s.time < GO_TIME) return 'Go'
    return null
  })
  if (!message) return null
  const go = message === 'Go'
  return (
    <div className="race-message">
      {/* Keyed so each number replays the entrance and its ring. */}
      <div key={message} className={`race-message-main${go ? ' is-go' : ''}`}>
        {!go && (
          <svg className="race-message-ring" viewBox="0 0 100 100" aria-hidden>
            <circle cx={50} cy={50} r={46} pathLength={1} />
          </svg>
        )}
        {message}
      </div>
    </div>
  )
}

export default function RaceHud() {
  const reveal = useRaceStore((s) => s.mode === 'reveal')
  // Popups stay out from behind the results screen.
  const racing = useRaceStore((s) => s.phase === 'racing')
  return (
    <>
      <div className="race-top">
        <div className="race-head">
          <Timer />
          <span className="race-head-rule" />
          {reveal ? <Points /> : <RingCount />}
        </div>
        {reveal && <Objective />}
        {reveal && racing && <Popups />}
      </div>
      <Message />
    </>
  )
}
