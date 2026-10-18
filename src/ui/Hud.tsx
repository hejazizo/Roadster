import { TUNING } from '../config/tuning'
import { useCarStore } from '../state/carStore'
import { useRaceStore } from '../state/raceStore'
import './Hud.css'
import RaceHud from './RaceHud'

const MS_TO_KMH = 3.6

// Each readout selects its own value so only the one that changed re-renders.
function Speed() {
  const kmh = useCarStore((s) => Math.round(s.speed * MS_TO_KMH))
  return (
    <div className="hud-speed">
      {kmh}
      <span className="hud-unit">km/h</span>
    </div>
  )
}

function FuelBar() {
  const fuel = useCarStore((s) => s.fuel)
  const draining = useCarStore((s) => s.boosting || s.gliding || s.suction > 0 || s.lifting)
  const fraction = Math.min(fuel / TUNING.car.fuel.max, 1)
  const className = ['hud-fuel', draining && 'is-draining', fuel <= 0 && 'is-empty']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={className}>
      <span className="hud-label">Fuel</span>
      <div className="hud-fuel-track">
        <div className="hud-fuel-fill" style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  )
}

// Suction, shown while the fans are engaged.
function FansMeter() {
  const fans = useCarStore((s) => s.fans)
  const suction = useCarStore((s) => s.suction)
  if (!fans && suction === 0) return null
  return (
    <div className="hud-fans">
      <span className="hud-label">Fans</span>
      <div className="hud-fuel-track">
        <div className="hud-fans-fill" style={{ width: `${suction * 100}%` }} />
      </div>
    </div>
  )
}

const HOLD_LABELS = { wall: 'Wall hold', ceiling: 'Ceiling hold' }

function Status() {
  const status = useCarStore((s) =>
    s.grounded
      ? s.drifting
        ? 'Drifting'
        : 'Grounded'
      : !s.airborne
        ? 'Overturned' // on its roof or side
        : s.gliding
          ? 'Gliding'
          : 'Airborne',
  )
  const hold = useCarStore((s) => s.hold)
  const lifting = useCarStore((s) => s.lifting)
  return (
    <div className="hud-statuses">
      <div className={`hud-status is-${status.toLowerCase()}`}>{status}</div>
      {hold !== 'none' && <div className={`hud-status is-${hold}`}>{HOLD_LABELS[hold]}</div>}
      {lifting && <div className="hud-status is-jets">Jets</div>}
    </div>
  )
}

// Height, vertical speed and roll turns, shown while the car is off the ground.
function AirReadout() {
  const airborne = useCarStore((s) => s.airborne)
  const height = useCarStore((s) => (Number.isFinite(s.height) ? s.height.toFixed(1) : '—'))
  const vertical = useCarStore((s) => s.verticalSpeed.toFixed(1))
  const turns = useCarStore((s) => Math.abs(s.rollTurns).toFixed(1))
  if (!airborne) return null
  const rising = !vertical.startsWith('-')
  return (
    <dl className="hud-air">
      <dt>Height</dt>
      <dd>
        {height}
        <span className="hud-unit">m</span>
      </dd>
      <dt>Vertical</dt>
      <dd>
        {rising ? '↑' : '↓'} {vertical.replace('-', '')}
        <span className="hud-unit">m/s</span>
      </dd>
      <dt>Roll</dt>
      <dd>
        {turns}
        <span className="hud-unit">turns</span>
      </dd>
    </dl>
  )
}

// Plain HTML overlay on top of the canvas, hidden behind the main menu.
export default function Hud() {
  const inMenu = useRaceStore((s) => s.phase === 'menu')
  if (inMenu) return null
  return (
    <div className="hud">
      <div className="hud-panel">
        <Status />
        <Speed />
        <FuelBar />
        <FansMeter />
        <AirReadout />
      </div>
      <RaceHud />
    </div>
  )
}
