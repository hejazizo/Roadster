import type { CSSProperties, ReactNode } from 'react'
import { bindingLabel, type BindingRef } from '../config/bindings'
import { useInputStore } from '../state/inputStore'
import type { Medal } from '../state/stuntRun'

// Small building blocks shared by the menus and the HUD (styles in theme.css).

// The keys or pad buttons bound to some actions on the last-used device, one cap each;
// nothing when unbound.
export function KeyCap({ refs }: { refs: BindingRef[] }) {
  const device = useInputStore((s) => s.device)
  const label = bindingLabel(refs, device)
  if (!label) return null
  return (
    <span className="ui-keys">
      {label.split(' / ').map((part) => (
        <kbd key={part} className="ui-key">
          {part}
        </kbd>
      ))}
    </span>
  )
}

type SegmentedProps<T extends string> = {
  label: string // for screen readers
  options: readonly { id: T; name: string }[]
  value: T
  onChange: (id: T) => void
}

// A radio group drawn as segments. Like every menu control it never takes focus (no tab
// stop, no focus on click), so Enter and Space keep going to the menu's actions; the keyboard
// and gamepad switch it with its own action.
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="ui-segments" role="radiogroup" aria-label={label}>
      {options.map(({ id, name }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={id === value}
          tabIndex={-1}
          className={`ui-segment${id === value ? ' is-selected' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(id)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

type MeterProps = {
  label: string
  fraction: number // 0–1
  value?: ReactNode // shown on the right of the label
  color?: string // CSS colour of the fill
  className?: string
}

export function Meter({ label, fraction, value, color, className }: MeterProps) {
  const style = color ? ({ '--meter-color': color } as CSSProperties) : undefined
  return (
    <div className={className ? `ui-meter ${className}` : 'ui-meter'} style={style}>
      <div className="ui-meter-head">
        <span className="ui-label">{label}</span>
        {value !== undefined && <span className="ui-meter-value ui-mono">{value}</span>}
      </div>
      <div className="ui-meter-track">
        <div
          className="ui-meter-fill"
          style={{ width: `${Math.min(Math.max(fraction, 0), 1) * 100}%` }}
        />
      </div>
    </div>
  )
}

type StatProps = { label: string; value: ReactNode; unit?: string }

export function Stat({ label, value, unit }: StatProps) {
  return (
    <div className="ui-stat">
      <span className="ui-label">{label}</span>
      <span className="ui-stat-value ui-mono">
        {value}
        {unit && <span className="ui-unit">{unit}</span>}
      </span>
    </div>
  )
}

const MEDAL_NAMES = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }

export function MedalChip({ medal }: { medal: Medal }) {
  if (!medal) return null
  return <span className={`ui-chip is-${medal}`}>{MEDAL_NAMES[medal]}</span>
}

// A titled group on the menus (styles in Menus.css).
export function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="menu-section">
      <div className="menu-section-head">
        <h3 className="menu-section-title">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
