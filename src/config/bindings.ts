// Default bindings from game actions to devices. Game code asks the input layer
// (src/input/input.ts) for actions and never reads keys or gamepads itself.
// Keys are `KeyboardEvent.code` values; gamepad indices follow the W3C "standard" mapping.

export type AxisAction = 'throttle' | 'steer' | 'pitch'
export type ButtonAction =
  | 'boost'
  | 'hop'
  | 'handbrake'
  | 'reset'
  | 'pause'
  | 'restart' // during a run
  | 'confirm' // on a menu screen
  | 'back' // on a menu screen
  | 'prev' // previous option on a menu screen (paint)
  | 'next' // next option on a menu screen
  | 'assists' // switch assist mode on the main and pause menus
  | 'level' // switch level on the main menu
  | 'mute' // sound on / off
  | 'camera' // debug orbit cam
  | 'tuning' // debug tuning panel

export type Device = 'keyboard' | 'gamepad'

// A gamepad source for an axis: a stick axis, or an analog button (trigger) as a half axis.
export type PadAxisSource = { stick: number; sign: 1 | -1 } | { button: number; sign: 1 | -1 }

export type AxisBinding = {
  keys: { positive: string[]; negative: string[] }
  pad: PadAxisSource[]
}

export type ButtonBinding = {
  keys: string[]
  pad: number[] // button indices
}

// Standard-mapping gamepad buttons (Xbox names).
const A = 0
const B = 1
const X = 2
const Y = 3
const RB = 5
const LT = 6
const RT = 7
const VIEW = 8
const MENU = 9
const DPAD_LEFT = 14
const DPAD_RIGHT = 15

export const BINDINGS: {
  axes: Record<AxisAction, AxisBinding>
  buttons: Record<ButtonAction, ButtonBinding>
} = {
  axes: {
    // -1 brakes / reverses, 1 drives.
    throttle: {
      keys: { positive: ['KeyW', 'ArrowUp'], negative: ['KeyS', 'ArrowDown'] },
      pad: [
        { button: RT, sign: 1 },
        { button: LT, sign: -1 },
      ],
    },
    // -1 left, 1 right.
    steer: {
      keys: { positive: ['KeyD', 'ArrowRight'], negative: ['KeyA', 'ArrowLeft'] },
      pad: [{ stick: 0, sign: 1 }],
    },
    // Air control: -1 nose up, 1 nose down. The stick's Y axis is negative when pushed forward.
    pitch: {
      keys: { positive: ['KeyW', 'ArrowUp'], negative: ['KeyS', 'ArrowDown'] },
      pad: [{ stick: 1, sign: -1 }],
    },
  },
  buttons: {
    boost: { keys: ['ShiftLeft', 'ShiftRight'], pad: [B] },
    hop: { keys: ['Space'], pad: [A] },
    handbrake: { keys: ['KeyE'], pad: [X] },
    reset: { keys: ['KeyR'], pad: [Y] },
    pause: { keys: ['Escape'], pad: [MENU] },
    restart: { keys: ['Enter'], pad: [VIEW] },
    confirm: { keys: ['Enter'], pad: [A] },
    back: { keys: ['KeyQ'], pad: [B] },
    prev: { keys: ['ArrowLeft', 'KeyA'], pad: [DPAD_LEFT] },
    next: { keys: ['ArrowRight', 'KeyD'], pad: [DPAD_RIGHT] },
    assists: { keys: ['KeyT'], pad: [Y] },
    level: { keys: ['KeyL'], pad: [RB] },
    mute: { keys: ['KeyM'], pad: [] },
    camera: { keys: ['KeyC'], pad: [] },
    tuning: { keys: ['Backquote'], pad: [] },
  },
}

const KEY_LABELS: Record<string, string> = {
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  Escape: 'Esc',
  Backquote: '`',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

// prettier-ignore
const PAD_BUTTON_LABELS = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D-pad ↑', 'D-pad ↓',
  'D-pad ←', 'D-pad →',
]
const PAD_STICK_LABELS = ['Left stick', 'Left stick', 'Right stick', 'Right stick']

const keyLabel = (code: string) => KEY_LABELS[code] ?? code.replace(/^(Key|Digit)/, '')
const padButtonLabel = (index: number) => PAD_BUTTON_LABELS[index] ?? `Button ${index}`

// A button, or one direction of an axis.
export type BindingRef = ButtonAction | [AxisAction, 1 | -1]

function refLabel(ref: BindingRef, device: Device): string | undefined {
  if (typeof ref === 'string') {
    const { keys, pad } = BINDINGS.buttons[ref]
    if (device === 'keyboard') return keys[0] && keyLabel(keys[0])
    return pad[0] === undefined ? undefined : padButtonLabel(pad[0])
  }
  const [action, dir] = ref
  const { keys, pad } = BINDINGS.axes[action]
  if (device === 'keyboard') {
    const key = (dir > 0 ? keys.positive : keys.negative)[0]
    return key && keyLabel(key)
  }
  // A stick covers both directions; a trigger only its own.
  const source = pad.find((s) => 'stick' in s || s.sign === dir)
  if (!source) return undefined
  return 'stick' in source ? PAD_STICK_LABELS[source.stick] : padButtonLabel(source.button)
}

// Display label for the first binding of each ref on a device, e.g. "W / S" or "RT / LT".
export function bindingLabel(refs: BindingRef[], device: Device): string {
  const labels = refs.map((ref) => refLabel(ref, device)).filter((l) => l !== undefined)
  return [...new Set(labels)].join(' / ')
}
