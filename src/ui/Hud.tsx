import { TUNING } from '../config/tuning'
import { useCarStore } from '../state/carStore'
import './Hud.css'

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
  const draining = useCarStore((s) => s.boosting || s.gliding)
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

function Status() {
  const status = useCarStore((s) => (s.grounded ? 'Grounded' : s.gliding ? 'Gliding' : 'Airborne'))
  return <div className={`hud-status is-${status.toLowerCase()}`}>{status}</div>
}

// Plain HTML overlay on top of the canvas.
export default function Hud() {
  return (
    <div className="hud">
      <div className="hud-panel">
        <Status />
        <Speed />
        <FuelBar />
      </div>
    </div>
  )
}
