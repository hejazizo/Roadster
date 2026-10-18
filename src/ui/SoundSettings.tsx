import { Volume2, VolumeX } from 'lucide-react'
import type { CSSProperties } from 'react'
import { sfx } from '../audio/sounds'
import { useAudioStore, type Bus } from '../state/audioStore'
import { KeyCap, Section } from './components'

const SLIDERS: [Bus, string][] = [
  ['master', 'Master'],
  ['music', 'Music'],
  ['sfx', 'Effects'],
]

const toggleMute = () => useAudioStore.getState().toggleMute()

// Like the paint swatches, the controls take no tab stop and let go of focus once used, so
// Enter, Space and Esc keep going to the menu's actions.
function VolumeSlider({ bus, label }: { bus: Bus; label: string }) {
  const percent = useAudioStore((s) => Math.round(s[bus] * 100))
  const release = (e: { currentTarget: HTMLInputElement }) => {
    e.currentTarget.blur()
    sfx.uiTick()
  }
  return (
    <label className="menu-slider">
      <span className="menu-slider-name">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        tabIndex={-1}
        value={percent}
        style={{ '--fill': `${percent}%` } as CSSProperties}
        onChange={(e) => useAudioStore.getState().setVolume(bus, Number(e.target.value) / 100)}
        onPointerUp={release}
        onPointerCancel={release}
      />
      <span className="menu-slider-value ui-mono">{percent}</span>
    </label>
  )
}

// Volume sliders and mute, on the main and pause menus.
export default function SoundSettings() {
  const started = useAudioStore((s) => s.started)
  const muted = useAudioStore((s) => s.muted)
  const Icon = muted ? VolumeX : Volume2
  return (
    <Section
      title="Sound"
      aside={
        <button
          type="button"
          tabIndex={-1}
          className={muted ? 'menu-mute is-muted' : 'menu-mute'}
          aria-pressed={muted}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMute}
        >
          <Icon size={14} strokeWidth={1.75} aria-hidden />
          {muted ? 'Muted' : 'On'}
          <KeyCap refs={['mute']} />
        </button>
      }
    >
      <div className={muted ? 'menu-sliders is-muted' : 'menu-sliders'}>
        {SLIDERS.map(([bus, label]) => (
          <VolumeSlider key={bus} bus={bus} label={label} />
        ))}
      </div>
      {!started && <div className="menu-hint">Click or press a key to turn sound on</div>}
    </Section>
  )
}
