// Default bindings from game actions to devices. Game code asks the input layer
// (src/input/input.ts) for actions and never reads keys or gamepads itself.
// Keys are `KeyboardEvent.code` values; gamepad indices follow the W3C "standard" mapping.

export type AxisAction = 'throttle' | 'steer' | 'pitch'
export type ButtonAction =
  | 'boost'
  | 'hop'
  | 'handbrake'
  | 'fans' // held: underbody suction
  | 'lift' // held: cold-gas jets push along the car's up
  | 'airRoll' // held in the air: steer rolls the car
  | 'reset'
  | 'pause'
  | 'restart' // during a run
  | 'confirm' // on a menu screen
  | 'back' // on a menu screen
  | 'prev' // previous option on a menu screen (paint)
  | 'next' // next option on a menu screen
  | 'up' // move the menu focus up
  | 'down' // move the menu focus down
  | 'assists' // switch assist mode on the main and pause menus
  | 'mode' // switch run mode (time trial / reveal run) on the main menu
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

// One direction of a stick axis, held past TUNING.input.navThreshold (menu navigation).
export type PadStickSource = { axis: number; sign: 1 | -1 }

export type ButtonBinding = {
  keys: string[]
  pad: number[] // button indices
  stick?: PadStickSource[]
}

// Standard-mapping gamepad buttons (Xbox names).
const A = 0
const B = 1
const X = 2
const Y = 3
const LB = 4
const RB = 5
const LT = 6
const RT = 7
const VIEW = 8
const MENU = 9
const DPAD_UP = 12
const DPAD_DOWN = 13
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
    hop: { keys: ['KeyG'], pad: [RB] },
    handbrake: { keys: ['KeyE'], pad: [X] },
    fans: { keys: ['KeyF'], pad: [LB] },
    // The jets are the Proving Ground's main move, so they get the easiest key and button.
    lift: { keys: ['Space'], pad: [A] },
    // The handbrake's button: it does nothing in the air.
    airRoll: { keys: ['KeyE'], pad: [X] },
    reset: { keys: ['KeyR'], pad: [Y] },
    pause: { keys: ['Escape'], pad: [MENU] },
    restart: { keys: ['Enter'], pad: [VIEW] },
    confirm: { keys: ['Enter'], pad: [A] },
    back: { keys: ['KeyQ'], pad: [B] },
    prev: { keys: ['ArrowLeft', 'KeyA'], pad: [DPAD_LEFT], stick: [{ axis: 0, sign: -1 }] },
    next: { keys: ['ArrowRight', 'KeyD'], pad: [DPAD_RIGHT], stick: [{ axis: 0, sign: 1 }] },
    // The stick's Y axis is negative when pushed forward.
    up: { keys: ['ArrowUp', 'KeyW'], pad: [DPAD_UP], stick: [{ axis: 1, sign: -1 }] },
    down: { keys: ['ArrowDown', 'KeyS'], pad: [DPAD_DOWN], stick: [{ axis: 1, sign: 1 }] },
    assists: { keys: ['KeyT'], pad: [Y] },
    // The fans' button, which does nothing on a menu.
    mode: { keys: ['KeyN'], pad: [LB] },
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

// What a binding is on a device, for drawing it: a key, a pad button or a stick.
export type BindingSource = { key: string } | { button: number } | { stick: number }

function refSource(ref: BindingRef, device: Device): BindingSource | undefined {
  if (typeof ref === 'string') {
    const { keys, pad } = BINDINGS.buttons[ref]
    if (device === 'keyboard') return keys[0] === undefined ? undefined : { key: keys[0] }
    return pad[0] === undefined ? undefined : { button: pad[0] }
  }
  const [action, dir] = ref
  const { keys, pad } = BINDINGS.axes[action]
  if (device === 'keyboard') {
    const key = (dir > 0 ? keys.positive : keys.negative)[0]
    return key === undefined ? undefined : { key }
  }
  // A stick covers both directions; a trigger only its own.
  const source = pad.find((s) => 'stick' in s || s.sign === dir)
  if (!source) return undefined
  return 'stick' in source ? { stick: source.stick } : { button: source.button }
}

export function sourceLabel(source: BindingSource): string {
  if ('key' in source) return keyLabel(source.key)
  if ('button' in source) return padButtonLabel(source.button)
  return PAD_STICK_LABELS[source.stick] ?? `Stick ${source.stick}`
}

const sourceId = (source: BindingSource) =>
  'key' in source
    ? `k${keyLabel(source.key)}`
    : 'button' in source
      ? `b${source.button}`
      : `s${Math.floor(source.stick / 2)}`

// The first binding of each ref on a device, without repeats (W / S on the keyboard, but
// one "Left stick" for steering both ways).
export function bindingSources(refs: BindingRef[], device: Device): BindingSource[] {
  const seen = new Set<string>()
  const sources: BindingSource[] = []
  for (const ref of refs) {
    const source = refSource(ref, device)
    if (!source || seen.has(sourceId(source))) continue
    seen.add(sourceId(source))
    sources.push(source)
  }
  return sources
}

// Display label for the first binding of each ref on a device, e.g. "W / S" or "RT / LT".
export function bindingLabel(refs: BindingRef[], device: Device): string {
  return bindingSources(refs, device).map(sourceLabel).join(' / ')
}
