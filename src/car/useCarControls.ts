import { useCallback, useEffect, useRef } from 'react'
import { axis, held, onPress } from '../input/input'
import { useRaceStore } from '../state/raceStore'

export type CarControls = {
  throttle: number // -1 brake / reverse … 1 drive
  steer: number // -1 left … 1 right
  pitch: number // air control: -1 nose up … 1 nose down
  boost: boolean
  hop: boolean // held: glide
  hopPressed: boolean // pressed since the last step: hop
  handbrake: boolean
  fans: boolean
  reset: boolean // pressed since the last step
}

export const released = (): CarControls => ({
  throttle: 0,
  steer: 0,
  pitch: 0,
  boost: false,
  hop: false,
  hopPressed: false,
  handbrake: false,
  fans: false,
  reset: false,
})

// The car's view of the input layer. Presses are latched until the next physics step
// reads them, so a tap shorter than one step still counts. Returns a function to call
// once per step, which takes the latched presses. Presses on the pause menu are dropped,
// since physics doesn't step while paused and they'd otherwise fire on resume.
export function useCarControls() {
  const latched = useRef({ hop: false, reset: false })

  useEffect(
    () =>
      onPress((action) => {
        if (useRaceStore.getState().paused) return
        if (action === 'hop' || action === 'reset') latched.current[action] = true
      }),
    [],
  )

  return useCallback((): CarControls => {
    const { hop, reset } = latched.current
    latched.current = { hop: false, reset: false }
    return {
      throttle: axis('throttle'),
      steer: axis('steer'),
      pitch: axis('pitch'),
      boost: held('boost'),
      hop: held('hop'),
      hopPressed: hop,
      handbrake: held('handbrake'),
      fans: held('fans'),
      reset,
    }
  }, [])
}
