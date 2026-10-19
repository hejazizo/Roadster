import { Fuel } from 'lucide-react'
import { useEffect, useRef, type CSSProperties } from 'react'
import { TUNING } from '../config/tuning'
import { useCarStore } from '../state/carStore'

// The round speed gauge, bottom-right (styles in Hud.css): a 270° arc from 0 to the car's
// top speed with a boost zone at the end, the fuel as a thin outer arc and the fans' suction
// as an inner one. Arcs and digits are driven from an animation frame loop that eases
// towards the car's state, so the gauge never jumps and React doesn't re-render per frame.

const MS_TO_KMH = 3.6
const SIZE = 216
const C = SIZE / 2
const START = 135 // degrees, clockwise from +x (bottom-left); the arc sweeps 270°
const SWEEP = 270
const R_SPEED = 80
const R_FUEL = 96
const R_FANS = 46
const R_TICK = 69
const R_LABEL = 57
const EASE_RATE = 10 // 1/s, how quickly the shown values catch up
const TICK_STEP = 10 // km/h
const LABEL_STEP = 40 // km/h

// The scale's top: boost top speed, rounded up to the next 20 km/h.
const scaleMax = () => Math.ceil((TUNING.car.boost.maxSpeed * MS_TO_KMH) / 20) * 20

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

function polar(r: number, fraction: number) {
  const a = ((START + SWEEP * fraction) * Math.PI) / 180
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}

// An arc of radius r from one fraction of the sweep to another.
function arcPath(r: number, from = 0, to = 1) {
  const [x0, y0] = polar(r, from)
  const [x1, y1] = polar(r, to)
  const large = SWEEP * (to - from) > 180 ? 1 : 0
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

function Scale({ max }: { max: number }) {
  const boostFrom = (TUNING.car.engine.maxSpeed * MS_TO_KMH) / max
  const ticks = []
  for (let v = 0; v <= max; v += TICK_STEP) {
    const f = v / max
    const major = v % LABEL_STEP === 0
    const [x0, y0] = polar(R_TICK - (major ? 6 : 3), f)
    const [x1, y1] = polar(R_TICK, f)
    ticks.push(
      <line
        key={v}
        x1={x0}
        y1={y0}
        x2={x1}
        y2={y1}
        className={`gauge-tick${major ? ' is-major' : ''}${f >= boostFrom ? ' is-boost' : ''}`}
      />,
    )
    if (major) {
      const [lx, ly] = polar(R_LABEL, f)
      ticks.push(
        <text
          key={`l${v}`}
          x={lx}
          y={ly}
          className="gauge-label"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {v}
        </text>,
      )
    }
  }
  return (
    <>
      <path d={arcPath(R_TICK + 3, boostFrom, 1)} className="gauge-boost-zone" />
      {ticks}
    </>
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

// Grounded, Drifting, Airborne, Gliding or Overturned, then a hold and the jets.
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
  const extra = [hold !== 'none' && HOLD_LABELS[hold], lifting && 'Jets'].filter(Boolean)
  return (
    <div className="gauge-status">
      <span
        className="gauge-status-main"
        style={{ '--status-color': STATUS_COLORS[status.toLowerCase()] } as CSSProperties}
      >
        {status}
      </span>
      {extra.length > 0 && <span className="gauge-status-extra">{extra.join(' · ')}</span>}
    </div>
  )
}

export default function Speedometer() {
  const speedArc = useRef<SVGPathElement>(null)
  const fuelArc = useRef<SVGPathElement>(null)
  const fansArc = useRef<SVGPathElement>(null)
  const digits = useRef<HTMLSpanElement>(null)
  const fuelPercent = useRef<HTMLSpanElement>(null)
  const boosting = useCarStore((s) => s.boosting)
  const fans = useCarStore((s) => s.fans || s.suction > 0)
  const fuelState = useCarStore((s) =>
    s.fuel <= 0
      ? 'is-empty'
      : s.boosting || s.gliding || s.suction > 0 || s.lifting
        ? 'is-draining'
        : '',
  )
  const max = scaleMax()

  useEffect(() => {
    const start = useCarStore.getState()
    const shown = {
      speed: start.speed * MS_TO_KMH,
      fuel: start.fuel / TUNING.car.fuel.max,
      suction: start.suction,
    }
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const car = useCarStore.getState()
      const k = 1 - Math.exp(-EASE_RATE * dt)
      shown.speed += (car.speed * MS_TO_KMH - shown.speed) * k
      shown.fuel += (clamp01(car.fuel / TUNING.car.fuel.max) - shown.fuel) * k
      shown.suction += (car.suction - shown.suction) * k
      speedArc.current?.style.setProperty(
        'stroke-dashoffset',
        String(1 - clamp01(shown.speed / scaleMax())),
      )
      fuelArc.current?.style.setProperty('stroke-dashoffset', String(1 - clamp01(shown.fuel)))
      fansArc.current?.style.setProperty('stroke-dashoffset', String(1 - clamp01(shown.suction)))
      if (digits.current) digits.current.textContent = String(Math.round(shown.speed))
      if (fuelPercent.current) {
        // The real value, not the eased one, so an empty tank reads 0 at once.
        fuelPercent.current.textContent = `${Math.round(clamp01(car.fuel / TUNING.car.fuel.max) * 100)}%`
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className={`gauge${boosting ? ' is-boosting' : ''}${fans ? ' has-fans' : ''}`}>
      <svg className="gauge-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <path d={arcPath(R_FUEL)} className="gauge-track is-thin" />
        <path
          ref={fuelArc}
          d={arcPath(R_FUEL)}
          pathLength={1}
          className={`gauge-fuel ${fuelState}`}
        />
        <path d={arcPath(R_SPEED)} className="gauge-track" />
        <Scale max={max} />
        <path ref={speedArc} d={arcPath(R_SPEED)} pathLength={1} className="gauge-speed" />
        <path d={arcPath(R_FANS)} className="gauge-track is-thin gauge-fans-track" />
        <path ref={fansArc} d={arcPath(R_FANS)} pathLength={1} className="gauge-fans" />
      </svg>
      <div className="gauge-center">
        <span ref={digits} className="gauge-digits ui-mono">
          0
        </span>
        <span className="gauge-unit">km/h</span>
      </div>
      <div className={`gauge-fuel-readout ${fuelState}`}>
        <Fuel size="1em" strokeWidth={2} aria-label="Fuel" />
        <span ref={fuelPercent} className="ui-mono">
          100%
        </span>
      </div>
      <Status />
    </div>
  )
}
