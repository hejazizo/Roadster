import { bindingLabel, type ButtonAction } from '../config/bindings'
import { TUNING } from '../config/tuning'
import { useInputStore } from '../state/inputStore'
import { useRaceStore } from '../state/raceStore'
import { STUNT_STEPS } from '../state/stuntRun'
import { formatPoints } from './formatPoints'
import { formatTime } from './formatTime'

const GO_TIME = 0.8 // s "GO!" stays up after the start

function Timer() {
  const time = useRaceStore((s) => formatTime(s.finalTime ?? s.time))
  return <div className="race-time">{time}</div>
}

function RingCount() {
  const passed = useRaceStore((s) => s.nextRing)
  const total = useRaceStore((s) => s.ringCount)
  return (
    <div className="race-rings">
      <span className="hud-label">Rings</span> {passed} / {total}
    </div>
  )
}

// The reveal run's points so far (the time and no-contact bonuses come at the finish).
function Points() {
  const points = useRaceStore((s) => s.stunt.points)
  return (
    <div className="race-rings">
      <span className="hud-label">Points</span> {points}
    </div>
  )
}

// Short hints per step, with the keys (or pad buttons) the step needs.
const HINTS: ((key: (action: ButtonAction) => string) => string)[] = [
  (key) => `Boost (${key('boost')}) up the half-loop, fans (${key('fans')}) on`,
  () => `Stop under the top and hold ${TUNING.reveal.holdMin} s`,
  (key) => `Drive off the lip, roll upright: ${key('airRoll')} + steer`,
  (key) => `Brake the fall with the jets (${key('lift')})`,
  (key) => `Lift off (${key('lift')}) before the fleet and roll over it`,
  () => 'Through the finish gate',
]

const HOLD_STEP = 1

// Objective banner: the step under way and a hint, with a bar while holding inverted.
function Objective() {
  const step = useRaceStore((s) => s.stunt.step)
  const hold = useRaceStore((s) =>
    s.stunt.step === HOLD_STEP ? Math.min(s.stunt.holdTime / TUNING.reveal.holdMin, 1) : null,
  )
  const device = useInputStore((s) => s.device)
  if (step >= STUNT_STEPS.length) return null
  const key = (action: ButtonAction) => bindingLabel([action], device)
  return (
    <div className="race-objective">
      <div className="race-objective-step">
        <span className="hud-label">
          Step {step + 1} / {STUNT_STEPS.length}
        </span>{' '}
        {STUNT_STEPS[step]}
      </div>
      <div className="race-objective-hint">{HINTS[step](key)}</div>
      {hold !== null && (
        <div className="hud-fuel-track race-objective-hold">
          <div className="hud-fans-fill" style={{ width: `${hold * 100}%` }} />
        </div>
      )}
    </div>
  )
}

// Feedback for each step, bonus and penalty; each fades out on its own (Hud.css).
function Popups() {
  const popups = useRaceStore((s) => s.popups)
  return (
    <div className="race-popups">
      {popups.map(({ id, label, points, kind }) => (
        <div key={id} className={`race-popup is-${kind}`}>
          {label}
          {points !== 0 && <span className="race-popup-points"> {formatPoints(points)}</span>}
        </div>
      ))}
    </div>
  )
}

// Big centre countdown and "GO!"; selects a string so it re-renders only on change. The
// menu, pause and results screens are in Menus.tsx.
function Message() {
  const message = useRaceStore((s) => {
    if (s.phase === 'countdown') return String(Math.ceil(s.countdown))
    if (s.phase === 'racing' && s.time < GO_TIME) return 'GO!'
    return null
  })
  if (!message) return null
  return (
    <div className="race-message">
      <div className="race-message-main">{message}</div>
    </div>
  )
}

export default function RaceHud() {
  const reveal = useRaceStore((s) => s.mode === 'reveal')
  // Popups stay out from behind the results screen.
  const racing = useRaceStore((s) => s.phase === 'racing')
  return (
    <>
      <div className="race-panel">
        <Timer />
        {reveal ? <Points /> : <RingCount />}
        {reveal && <Objective />}
      </div>
      {reveal && racing && <Popups />}
      <Message />
    </>
  )
}
