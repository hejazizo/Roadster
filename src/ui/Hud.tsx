import type { CSSProperties } from 'react'
import { TUNING } from '../config/tuning'
import { useCarStore } from '../state/carStore'
import { useRaceStore } from '../state/raceStore'
import { Meter, Stat } from './components'
import './Hud.css'
import RaceHud from './RaceHud'

const MS_TO_KMH = 3.6

// Each readout selects its own value so only the one that changed re-renders.
function Speed() {
  const kmh = useCarStore((s) => Math.round(s.speed * MS_TO_KMH))
  return (
    <div className="hud-speed">
      <span className="hud-speed-value ui-mono">{kmh}</span>
      <span className="ui-unit">km/h</span>
    </div>
  )
}

function FuelMeter() {
  const percent = useCarStore((s) => Math.round(Math.min(s.fuel / TUNING.car.fuel.max, 1) * 100))
  const draining = useCarStore((s) => s.boosting || s.gliding || s.suction > 0 || s.lifting)
  const color = percent <= 0 ? 'var(--ui-danger)' : draining ? 'var(--ui-warn)' : 'var(--ui-fuel)'
  return <Meter label="Fuel" fraction={percent / 100} value={`${percent}%`} color={color} />
}

// Suction, shown while the fans are engaged.
function FansMeter() {
  const fans = useCarStore((s) => s.fans)
  const suction = useCarStore((s) => s.suction)
  if (!fans && suction === 0) return null
  return (
    <Meter
      label="Fans"
      fraction={suction}
      value={`${Math.round(suction * 100)}%`}
      color="var(--ui-violet)"
    />
  )
}

const HOLD_LABELS = { wall: 'Wall hold', ceiling: 'Ceiling hold' }

const STATUS_COLORS: Record<string, string> = {
  grounded: 'var(--ui-ok)',
  drifting: 'var(--ui-violet)',
  airborne: 'var(--ui-warn)',
  gliding: 'var(--ui-fuel)',
  overturned: 'var(--ui-text-faint)',
  hold: 'var(--ui-accent)',
  jets: 'var(--ui-text)',
}

function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <span className="hud-status">
      <span className="ui-dot" style={{ '--dot-color': color } as CSSProperties} />
      {label}
    </span>
  )
}

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
      <StatusChip label={status} color={STATUS_COLORS[status.toLowerCase()]} />
      {hold !== 'none' && <StatusChip label={HOLD_LABELS[hold]} color={STATUS_COLORS.hold} />}
      {lifting && <StatusChip label="Jets" color={STATUS_COLORS.jets} />}
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
    <div className="hud-air">
      <Stat label="Height" value={height} unit="m" />
      <Stat
        label="Vertical"
        value={`${rising ? '↑' : '↓'}${vertical.replace('-', '')}`}
        unit="m/s"
      />
      <Stat label="Roll" value={turns} unit="turns" />
    </div>
  )
}

// Plain HTML overlay on top of the canvas, hidden behind the main menu.
export default function Hud() {
  const inMenu = useRaceStore((s) => s.phase === 'menu')
  if (inMenu) return null
  return (
    <div className="hud ui-root">
      <div className="hud-panel ui-panel">
        <Status />
        <Speed />
        <div className="hud-meters">
          <FuelMeter />
          <FansMeter />
        </div>
        <AirReadout />
      </div>
      <RaceHud />
    </div>
  )
}
