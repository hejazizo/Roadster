import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerDownLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { sourceLabel, type BindingSource } from '../config/bindings'

// Key caps and gamepad buttons drawn as icons (styles in theme.css, `.ui-key` and
// `.ui-glyph`). Pad buttons follow the W3C "standard" mapping, drawn with Xbox names.

const ARROWS: Record<string, typeof ArrowUp> = {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
}

const WIDE_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'Enter', 'Escape', 'Backquote'])

function Key({ code }: { code: string }) {
  const Arrow = ARROWS[code]
  const label = sourceLabel({ key: code })
  let content: ReactNode = label
  if (Arrow) content = <Arrow size={14} strokeWidth={2} aria-hidden />
  else if (code === 'Enter')
    content = (
      <>
        Enter
        <CornerDownLeft size={13} strokeWidth={2} aria-hidden />
      </>
    )
  return (
    <kbd className={WIDE_KEYS.has(code) ? 'ui-key is-wide' : 'ui-key'} title={label}>
      {content}
    </kbd>
  )
}

const GLYPH_HEIGHT = 26 // px, as tall as a key cap

const FACE = ['A', 'B', 'X', 'Y']
// Where each face button sits in the diamond (A bottom, B right, X left, Y top).
const FACE_DOTS: [number, number][] = [
  [12, 19],
  [19, 12],
  [5, 12],
  [12, 5],
]

// A label in the middle of a glyph.
const Text = ({ x, children }: { x: number; children: ReactNode }) => (
  <text x={x} y={12.5} className="ui-glyph-text" textAnchor="middle" dominantBaseline="middle">
    {children}
  </text>
)

function padShape(button: number): { width: number; shape: ReactNode } {
  if (button <= 3) {
    return {
      width: 24,
      shape: (
        <>
          <circle cx={12} cy={12} r={10.5} className="ui-glyph-line" />
          {FACE_DOTS.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={1}
              className={i === button ? 'ui-glyph-fill' : 'ui-glyph-fill is-faint'}
            />
          ))}
          <Text x={12}>{FACE[button]}</Text>
        </>
      ),
    }
  }
  if (button <= 7) {
    // Bumpers are flat bars, triggers taller with a rounded top.
    const trigger = button >= 6
    const label = ['LB', 'RB', 'LT', 'RT'][button - 4]
    return {
      width: 32,
      shape: (
        <>
          <path
            className="ui-glyph-line"
            d={
              trigger
                ? 'M3 21.5 V9 Q3 2.5 10 2.5 H22 Q29 2.5 29 9 V21.5 Z'
                : 'M2 18.5 V9.5 Q2 5.5 7 5.5 H25 Q30 5.5 30 9.5 V18.5 Z'
            }
          />
          <Text x={16}>{label}</Text>
        </>
      ),
    }
  }
  if (button === 8 || button === 9) {
    return {
      width: 24,
      shape: (
        <>
          <circle cx={12} cy={12} r={10.5} className="ui-glyph-line" />
          {button === 8 ? (
            // View: two overlapping windows.
            <>
              <rect x={6.5} y={7} width={7} height={6} rx={1} className="ui-glyph-line" />
              <rect x={10.5} y={11} width={7} height={6} rx={1} className="ui-glyph-line" />
            </>
          ) : (
            // Menu: three lines.
            <path d="M7.5 8.5 H16.5 M7.5 12 H16.5 M7.5 15.5 H16.5" className="ui-glyph-line" />
          )}
        </>
      ),
    }
  }
  if (button === 10 || button === 11) {
    return {
      width: 24,
      shape: (
        <>
          <circle cx={12} cy={12} r={10.5} className="ui-glyph-line" />
          <circle cx={12} cy={12} r={6.5} className="ui-glyph-line is-faint" />
          <Text x={12}>{button === 10 ? 'L' : 'R'}</Text>
        </>
      ),
    }
  }
  if (button >= 12 && button <= 15) {
    // D-pad: the cross, with the bound arm filled.
    const arms: Record<number, string> = {
      12: 'M9 2 H15 V9 L12 11 L9 9 Z',
      13: 'M9 22 H15 V15 L12 13 L9 15 Z',
      14: 'M2 9 V15 H9 L11 12 L9 9 Z',
      15: 'M22 9 V15 H15 L13 12 L15 9 Z',
    }
    return {
      width: 24,
      shape: (
        <>
          <path
            className="ui-glyph-line is-faint"
            d="M9 2 H15 V9 H22 V15 H15 V22 H9 V15 H2 V9 H9 Z"
          />
          <path className="ui-glyph-fill" d={arms[button]} />
        </>
      ),
    }
  }
  return { width: 24, shape: <Text x={12}>{button}</Text> }
}

function Stick({ stick }: { stick: number }) {
  return (
    <>
      <circle cx={12} cy={12} r={10.5} className="ui-glyph-line" />
      <circle cx={12} cy={12} r={6} className="ui-glyph-fill is-faint" />
      <Text x={12}>{stick < 2 ? 'L' : 'R'}</Text>
    </>
  )
}

// One binding as an icon: a key cap, a pad button or a stick.
export function Glyph({ source }: { source: BindingSource }) {
  if ('key' in source) return <Key code={source.key} />
  const { width, shape } =
    'button' in source
      ? padShape(source.button)
      : { width: 24, shape: <Stick stick={source.stick} /> }
  return (
    <svg
      className="ui-glyph"
      viewBox={`0 0 ${width} 24`}
      width={width * (GLYPH_HEIGHT / 24)}
      height={GLYPH_HEIGHT}
      role="img"
      aria-label={sourceLabel(source)}
    >
      <title>{sourceLabel(source)}</title>
      {shape}
    </svg>
  )
}
