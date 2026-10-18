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
  const draining = useCarStore((s) => s.boosting || s.gliding || s.suction > 0)
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
    s.grounded ? (s.drifting ? 'Drifting' : 'Grounded') : s.gliding ? 'Gliding' : 'Airborne',
  )
  const hold = useCarStore((s) => s.hold)
  return (
    <div className="hud-statuses">
      <div className={`hud-status is-${status.toLowerCase()}`}>{status}</div>
      {hold !== 'none' && <div className={`hud-status is-${hold}`}>{HOLD_LABELS[hold]}</div>}
    </div>
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
      </div>
      <RaceHud />
    </div>
  )
}
