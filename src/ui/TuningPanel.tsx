import { button, folder, Leva, useControls } from 'leva'
import { useEffect, useState } from 'react'
import { TUNING } from '../config/tuning'
import { onPress } from '../input/input'

// Sections shown in the panel. Their values are read every physics step or frame, so
// editing them in place takes effect immediately. Structural values (gravity, chassis,
// wheel layout, spawn) are only read at startup and stay out of the panel.
const SECTIONS: [string, Record<string, unknown>][] = [
  ['Engine', TUNING.car.engine],
  ['Brake', TUNING.car.brake],
  ['Steering', TUNING.car.steering],
  ['Suspension', TUNING.car.suspension],
  ['Tires', TUNING.car.tires],
  ['Fuel', TUNING.car.fuel],
  ['Boost', TUNING.car.boost],
  ['Hop', TUNING.car.hop],
  ['Glide', TUNING.car.glide],
  ['Air control', TUNING.car.airControl],
  ['Respawn', TUNING.car.respawn],
  ['Chase cam', TUNING.camera.chase],
  ['Input', TUNING.input],
]

// Keys are prefixed with the folder because leva needs them unique across folders.
const schema = Object.fromEntries(
  SECTIONS.map(([name, section]) => [
    name,
    folder(
      Object.fromEntries(
        Object.entries(section)
          .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
          .map(([key, value]) => [
            `${name}_${key}`,
            {
              value,
              min: 0,
              max: value > 0 ? value * 3 : 1,
              label: key,
              onChange: (v: number) => {
                section[key] = v
              },
            },
          ]),
      ),
      { collapsed: true },
    ),
  ]),
)

// Log the current values so tuned numbers can be copied back into tuning.ts.
const logValues = () => console.log(JSON.stringify(TUNING, null, 2))

// Live tuning panel, hidden until the tuning action (Backquote `) toggles it.
export default function TuningPanel() {
  const [open, setOpen] = useState(false)

  useControls({ ...schema, 'Log values': button(logValues) })

  useEffect(
    () =>
      onPress((action) => {
        if (action === 'tuning') setOpen((current) => !current)
      }),
    [],
  )

  return <Leva hidden={!open} />
}
