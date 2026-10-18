import { button, folder, Leva, useControls } from 'leva'
import { TUNING } from '../config/tuning'

// Sections shown in the panel. Their values are read every physics step or frame, so
// editing them in place takes effect immediately. Structural values (gravity, chassis,
// wheel layout) are only read at startup and stay out of the panel.
const SECTIONS: [string, Record<string, unknown>][] = [
  ['Engine', TUNING.car.engine],
  ['Brake', TUNING.car.brake],
  ['Steering', TUNING.car.steering],
  ['Suspension', TUNING.car.suspension],
  ['Tires', TUNING.car.tires],
  ['Drift', TUNING.car.drift],
  ['Aero', TUNING.car.aero],
  ['Weight transfer', TUNING.car.weightTransfer],
  ['Fuel', TUNING.car.fuel],
  ['Boost', TUNING.car.boost],
  ['Hop', TUNING.car.hop],
  ['Glide', TUNING.car.glide],
  ['Air control', TUNING.car.airControl],
  ['Suction', TUNING.car.suction],
  ['Jets', TUNING.car.jets],
  ['Landing', TUNING.car.landing],
  ['Assists: Beginner', TUNING.assists.beginner],
  ['Assists: Pro', TUNING.assists.pro],
  ['Respawn', TUNING.car.respawn],
  ['Reveal run', TUNING.reveal],
  ['Chase cam', TUNING.camera.chase],
  ['Landing FX', TUNING.vfx.landing],
  ['Hit FX', TUNING.vfx.hit],
  ['Skid FX', TUNING.vfx.skid],
  ['Flame', TUNING.vfx.flame],
  ['Jets FX', TUNING.vfx.jets],
  ['Post', TUNING.vfx.post],
  ['Audio mix', TUNING.audio.mix],
  ['Motor sound', TUNING.audio.motor],
  ['Wind sound', TUNING.audio.wind],
  ['Fan sound', TUNING.audio.fan],
  ['Jet sound', TUNING.audio.jets],
  ['Skid sound', TUNING.audio.skid],
  ['Music', TUNING.audio.music],
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

// leva's look, matched to the overlay's tokens (ui/theme.css).
const THEME = {
  colors: {
    elevation1: '#0b1118',
    elevation2: '#121c25',
    elevation3: '#26333e',
    accent1: '#c0cbd3',
    accent2: '#f18d80',
    accent3: '#f5a296',
    highlight1: '#8d9eac',
    highlight2: '#c0cbd3',
    highlight3: '#edf1f4',
    vivid1: '#edc18f',
  },
  radii: { xs: '3px', sm: '4px', lg: '8px' },
  fonts: {
    mono: "'IBM Plex Mono', ui-monospace, monospace",
    sans: "'Satoshi', system-ui, sans-serif",
  },
}

// Live tuning panel. App lazy-loads it on the first tuning action (Backquote `) and
// toggles `open`; it stays mounted once loaded so edits and folder state survive.
export default function TuningPanel({ open }: { open: boolean }) {
  useControls({ ...schema, 'Log values': button(logValues) })
  return <Leva hidden={!open} theme={THEME} />
}
