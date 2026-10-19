import { useCarStore } from '../state/carStore'
import { useRaceStore } from '../state/raceStore'
import { Stat } from './components'
import './Hud.css'
import RaceHud from './RaceHud'
import Speedometer from './Speedometer'

// The car's roll as seen from behind, against a level horizon (+ left side up, so the
// silhouette turns clockwise).
function Attitude() {
  const degrees = useCarStore((s) => Math.round((s.roll * 180) / Math.PI))
  return (
    <svg className="hud-attitude" viewBox="0 0 56 56" aria-label={`Roll ${degrees}°`} role="img">
      <circle cx={28} cy={28} r={26} className="hud-attitude-ring" />
      <line x1={6} y1={28} x2={50} y2={28} className="hud-attitude-horizon" />
      <g transform={`rotate(${degrees} 28 28)`}>
        {/* Rear view: body, cabin and wheels; the top mark shows which way is up. */}
        <path d="M14 31 H42 V26 Q42 24 40 24 H16 Q14 24 14 26 Z" className="hud-attitude-car" />
        <path d="M19 24 L22 19 H34 L37 24 Z" className="hud-attitude-car is-cabin" />
        <rect x={15} y={31} width={5} height={4} rx={1} className="hud-attitude-car" />
        <rect x={36} y={31} width={5} height={4} rx={1} className="hud-attitude-car" />
        <path d="M28 8 L25 13 H31 Z" className="hud-attitude-up" />
      </g>
    </svg>
  )
}

// Height, vertical speed and roll turns beside the gauge, slid out of view on the ground.
function AirReadout() {
  const airborne = useCarStore((s) => s.airborne)
  const height = useCarStore((s) => (Number.isFinite(s.height) ? s.height.toFixed(1) : '—'))
  const vertical = useCarStore((s) => s.verticalSpeed.toFixed(1))
  const turns = useCarStore((s) => Math.abs(s.rollTurns).toFixed(1))
  const rising = !vertical.startsWith('-')
  return (
    <div className={`hud-air${airborne ? ' is-shown' : ''}`} aria-hidden={!airborne}>
      <Attitude />
      <div className="hud-air-stats">
        <Stat label="Height" value={height} unit="m" />
        <Stat
          label="Vertical"
          value={`${rising ? '↑' : '↓'}${vertical.replace('-', '')}`}
          unit="m/s"
        />
        <Stat label="Roll" value={turns} unit="turns" />
      </div>
    </div>
  )
}

// Plain HTML overlay on top of the canvas, hidden behind the main menu.
export default function Hud() {
  const inMenu = useRaceStore((s) => s.phase === 'menu')
  if (inMenu) return null
  return (
    <div className="hud ui-root">
      <div className="hud-dash">
        <AirReadout />
        <Speedometer />
      </div>
      <RaceHud />
    </div>
  )
}
