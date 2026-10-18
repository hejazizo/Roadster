import { useEffect } from 'react'
import {
  BINDINGS,
  type AxisAction,
  type ButtonAction,
  type Device,
  type PadAxisSource,
} from '../config/bindings'
import { TUNING } from '../config/tuning'
import { useInputStore } from '../state/inputStore'
import { isTypingTarget } from './isTypingTarget'

// The input layer: keyboard and gamepads mapped to the actions in BINDINGS. Everything
// else reads input through `axis`, `held` and `onPress`, never from devices directly.
// Bindings are looked up on every read, so they can be changed at runtime.

const AXIS_ACTIONS = Object.keys(BINDINGS.axes) as AxisAction[]
const BUTTON_ACTIONS = Object.keys(BINDINGS.buttons) as ButtonAction[]

const keysDown = new Set<string>()
// Gamepad state from the last poll, merged across all connected pads.
const padAxes: Record<AxisAction, number> = { throttle: 0, steer: 0, pitch: 0 }
let padButtons = new Set<ButtonAction>()

type PressListener = (action: ButtonAction) => void
const listeners = new Set<PressListener>()

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

// -1…1, keyboard and gamepad added together.
export function axis(action: AxisAction): number {
  const { positive, negative } = BINDINGS.axes[action].keys
  const keys =
    Number(positive.some((k) => keysDown.has(k))) - Number(negative.some((k) => keysDown.has(k)))
  return clamp(keys + padAxes[action], -1, 1)
}

export function held(action: ButtonAction): boolean {
  return BINDINGS.buttons[action].keys.some((k) => keysDown.has(k)) || padButtons.has(action)
}

// Calls `listener` once per press (not on key repeat). Returns an unsubscribe function.
export function onPress(listener: PressListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const emit = (action: ButtonAction) => listeners.forEach((listener) => listener(action))

const setDevice = (device: Device) => {
  if (useInputStore.getState().device !== device) useInputStore.setState({ device })
}

const isBoundKey = (code: string) =>
  BUTTON_ACTIONS.some((a) => BINDINGS.buttons[a].keys.includes(code)) ||
  AXIS_ACTIONS.some((a) => {
    const { positive, negative } = BINDINGS.axes[a].keys
    return positive.includes(code) || negative.includes(code)
  })

function onKeyDown(e: KeyboardEvent) {
  // Ignore presses while typing in a text field; releases still go through.
  if (!isBoundKey(e.code) || isTypingTarget(e)) return
  // Enter or Space on a focused button is left to the button's own click.
  if (e.target instanceof HTMLButtonElement && (e.code === 'Enter' || e.code === 'Space')) return
  e.preventDefault()
  setDevice('keyboard')
  keysDown.add(e.code)
  if (e.repeat) return
  for (const action of BUTTON_ACTIONS) {
    if (BINDINGS.buttons[action].keys.includes(e.code)) emit(action)
  }
}

function onKeyUp(e: KeyboardEvent) {
  keysDown.delete(e.code)
}

function onBlur() {
  keysDown.clear()
}

// Stick axis with a radial deadzone, rescaled so it still reaches 1.
function stickValue(pad: Gamepad, index: number) {
  const { stickDeadzone } = TUNING.input
  const base = index - (index % 2)
  const magnitude = Math.hypot(pad.axes[base] ?? 0, pad.axes[base + 1] ?? 0)
  if (magnitude <= stickDeadzone) return 0
  const scaled = Math.min(1, (magnitude - stickDeadzone) / (1 - stickDeadzone))
  return ((pad.axes[index] ?? 0) / magnitude) * scaled
}

// Analog button (trigger) travel with a deadzone at rest, 0…1.
function triggerValue(pad: Gamepad, index: number) {
  const { triggerDeadzone } = TUNING.input
  const value = pad.buttons[index]?.value ?? 0
  return value <= triggerDeadzone ? 0 : (value - triggerDeadzone) / (1 - triggerDeadzone)
}

const sourceValue = (pad: Gamepad, source: PadAxisSource) =>
  source.sign *
  ('stick' in source ? stickValue(pad, source.stick) : triggerValue(pad, source.button))

// Read every connected gamepad and fire presses on rising edges.
function pollGamepads() {
  const pads = (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p?.connected)
  if (useInputStore.getState().gamepads !== pads.length) {
    useInputStore.setState({ gamepads: pads.length })
  }

  const { buttonThreshold } = TUNING.input
  const buttons = new Set<ButtonAction>()
  let active = false
  for (const action of AXIS_ACTIONS) {
    let value = 0
    for (const pad of pads) {
      for (const source of BINDINGS.axes[action].pad) value += sourceValue(pad, source)
    }
    padAxes[action] = clamp(value, -1, 1)
    if (value !== 0) active = true
  }
  for (const action of BUTTON_ACTIONS) {
    const down = pads.some((pad) =>
      BINDINGS.buttons[action].pad.some((i) => (pad.buttons[i]?.value ?? 0) > buttonThreshold),
    )
    if (down) buttons.add(action)
  }
  if (buttons.size > 0) active = true
  if (active) setDevice('gamepad')

  const previous = padButtons
  padButtons = buttons
  for (const action of buttons) if (!previous.has(action)) emit(action)
}

// Installs the keyboard listeners and the gamepad poll loop. Mount once, in App. The poll
// runs on its own animation frame loop so menus get input while physics is paused.
export function useInputDevices() {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    let frame = requestAnimationFrame(function poll() {
      pollGamepads()
      frame = requestAnimationFrame(poll)
    })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      cancelAnimationFrame(frame)
      keysDown.clear()
      padButtons = new Set()
      for (const action of AXIS_ACTIONS) padAxes[action] = 0
    }
  }, [])
}
