import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import {
  bindingSources,
  sourceLabel,
  type BindingRef,
  type ButtonAction,
  type Device,
} from '../config/bindings'
import { useInputStore } from '../state/inputStore'
import type { Medal } from '../state/stuntRun'
import { Glyph } from './glyphs'

// Small building blocks shared by the menus and the HUD (styles in theme.css). Menu
// controls never take DOM focus (no tab stop, no focus on click), so Enter and Space keep
// going to the input layer; `focused` draws the d-pad focus ring instead (menuNav.ts).

const noFocus = (e: { preventDefault: () => void }) => e.preventDefault()

const focusClass = (focused?: boolean) => (focused ? ' is-focused' : '')

// The keys or pad buttons bound to some actions, drawn as glyphs on the last-used device (or
// the one given); nothing when unbound.
export function KeyCap({ refs, device }: { refs: BindingRef[]; device?: Device }) {
  const lastDevice = useInputStore((s) => s.device)
  const sources = bindingSources(refs, device ?? lastDevice)
  if (sources.length === 0) return null
  return (
    <span className="ui-keys" title={sources.map(sourceLabel).join(' / ')}>
      {sources.map((source) => (
        <Glyph key={JSON.stringify(source)} source={source} />
      ))}
    </span>
  )
}

type MenuButtonProps = {
  label: string
  action?: ButtonAction // shown as the button's key hint
  onClick: () => void
  icon?: LucideIcon
  primary?: boolean
  focused?: boolean
  className?: string
}

export function MenuButton({
  label,
  action,
  onClick,
  icon: Icon,
  primary,
  focused,
  className,
}: MenuButtonProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={`menu-button${primary ? ' is-primary' : ''}${focusClass(focused)}${className ? ` ${className}` : ''}`}
      onMouseDown={noFocus}
      onClick={onClick}
    >
      {Icon && <Icon className="menu-button-icon" size={16} strokeWidth={1.75} aria-hidden />}
      <span className="menu-button-label">{label}</span>
      {action && <KeyCap refs={[action]} />}
    </button>
  )
}

type SegmentedProps<T extends string> = {
  label: string // for screen readers
  options: readonly { id: T; name: string }[]
  value: T
  onChange: (id: T) => void
  focused?: boolean
}

// A radio group drawn as segments; the keyboard and gamepad switch it with its own action,
// or with left / right while it has the focus ring.
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  focused,
}: SegmentedProps<T>) {
  return (
    <div className={`ui-segments${focusClass(focused)}`} role="radiogroup" aria-label={label}>
      {options.map(({ id, name }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={id === value}
          tabIndex={-1}
          className={`ui-segment${id === value ? ' is-selected' : ''}`}
          onMouseDown={noFocus}
          onClick={() => onChange(id)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

type ChoiceCardProps = {
  label: string // small heading, e.g. "Level"
  title: string
  description: string
  keys: BindingRef[] // the hotkey that cycles it
  count: number // choices, drawn as dots
  index: number
  onStep?: (dir: 1 | -1) => void // without one the card is fixed (a single choice)
  focused?: boolean
  children?: ReactNode // extra lines under the description (best, medal)
}

// A menu choice as a card: its name and a line about it, with ‹ › to step through the
// choices (left / right while focused, or its hotkey).
export function ChoiceCard({
  label,
  title,
  description,
  keys,
  count,
  index,
  onStep,
  focused,
  children,
}: ChoiceCardProps) {
  const arrow = (dir: 1 | -1, Icon: LucideIcon, name: string) =>
    onStep && (
      <button
        type="button"
        tabIndex={-1}
        className="ui-card-arrow"
        aria-label={`${name} ${label.toLowerCase()}`}
        onMouseDown={noFocus}
        onClick={() => onStep(dir)}
      >
        <Icon size={16} strokeWidth={2} aria-hidden />
      </button>
    )
  return (
    <section className={`ui-card${focusClass(focused)}`} aria-label={label}>
      <header className="ui-card-head">
        <span className="ui-label">{label}</span>
        {onStep && <KeyCap refs={keys} />}
      </header>
      <div className="ui-card-body">
        {arrow(-1, ChevronLeft, 'Previous')}
        <div className="ui-card-main">
          {/* Keyed so each change replays the entrance. */}
          <div key={title} className="ui-card-title">
            {title}
          </div>
          <div className="ui-card-description">{description}</div>
        </div>
        {arrow(1, ChevronRight, 'Next')}
      </div>
      <footer className="ui-card-foot">
        <div className="ui-card-extra">{children}</div>
        {count > 1 && (
          <span className="ui-card-dots" aria-hidden>
            {Array.from({ length: count }, (_, i) => (
              <span key={i} className={i === index ? 'is-current' : undefined} />
            ))}
          </span>
        )}
      </footer>
    </section>
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

// A centred dialog over a menu screen (settings, controls), with its own focus (menuNav.ts).
export function Sheet({
  title,
  aside,
  wide,
  children,
}: {
  title: string
  aside?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className="menu-overlay is-dim is-sheet ui-root">
      <div
        className={`menu-dialog ui-panel${wide ? ' is-xwide' : ''}`}
        role="dialog"
        aria-label={title}
      >
        <header className="menu-dialog-head">
          <h2 className="menu-heading">{title}</h2>
          {aside}
        </header>
        {children}
      </div>
    </div>
  )
}
