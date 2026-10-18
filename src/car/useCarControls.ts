import { useEffect, useRef } from 'react'
import { isTypingTarget } from '../ui/isTypingTarget'

export type CarControls = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  handbrake: boolean
  boost: boolean
  hop: boolean
  reset: boolean
}

const KEY_MAP: Record<string, keyof CarControls> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyE: 'handbrake',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  Space: 'hop',
  KeyR: 'reset',
}

const released = (): CarControls => ({
  forward: false,
  backward: false,
  left: false,
  right: false,
  handbrake: false,
  boost: false,
  hop: false,
  reset: false,
})

// Keyboard state for the car, kept in a ref so reading it never re-renders.
// Temporary until the input layer in M8.
export function useCarControls() {
  const controls = useRef<CarControls>(released())

  useEffect(() => {
    const set = (pressed: boolean) => (e: KeyboardEvent) => {
      const action = KEY_MAP[e.code]
      // Ignore presses while typing in a text field; releases still go through.
      if (!action || (pressed && isTypingTarget(e))) return
      e.preventDefault()
      controls.current[action] = pressed
    }
    const onKeyDown = set(true)
    const onKeyUp = set(false)
    const onBlur = () => {
      controls.current = released()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return controls
}
