import { create } from 'zustand'
import type { Device } from '../config/bindings'

export type InputState = {
  device: Device // last device used, for button hints
  gamepads: number // connected gamepads
}

// Written by the input layer (src/input/input.ts).
export const useInputStore = create<InputState>(() => ({
  device: 'keyboard',
  gamepads: 0,
}))
