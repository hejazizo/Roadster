import { sfx } from '../audio/sounds'
import { bindingLabel } from '../config/bindings'
import { useAudioStore, type Bus } from '../state/audioStore'
import { useInputStore } from '../state/inputStore'

const SLIDERS: [Bus, string][] = [
  ['master', 'Master'],
  ['music', 'Music'],
  ['sfx', 'Effects'],
]

const toggleMute = () => useAudioStore.getState().toggleMute()

// Like the paint swatches, the controls take no tab stop and let go of focus once used, so
// Enter, Space and Esc keep going to the menu's actions.
function VolumeSlider({ bus, label }: { bus: Bus; label: string }) {
  const value = useAudioStore((s) => s[bus])
  const release = (e: { currentTarget: HTMLInputElement }) => {
    e.currentTarget.blur()
    sfx.uiTick()
  }
  return (
    <label className="menu-slider">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        tabIndex={-1}
        value={Math.round(value * 100)}
        onChange={(e) => useAudioStore.getState().setVolume(bus, Number(e.target.value) / 100)}
        onPointerUp={release}
        onPointerCancel={release}
      />
    </label>
  )
}

// Volume sliders and mute, on the main and pause menus.
export default function SoundSettings() {
  const started = useAudioStore((s) => s.started)
  const muted = useAudioStore((s) => s.muted)
  const device = useInputStore((s) => s.device)
  const muteKey = bindingLabel(['mute'], device)
  return (
    <div className="menu-sound">
      <div className="menu-sound-label">
        <span className="hud-label">Sound</span>
        {!started && <span className="menu-sound-hint">Click or press a key to turn it on</span>}
        <button
          type="button"
          tabIndex={-1}
          className={muted ? 'menu-mute is-muted' : 'menu-mute'}
          aria-pressed={muted}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMute}
        >
          {muted ? 'Muted' : 'On'}
          {muteKey && <kbd className="menu-key">{muteKey}</kbd>}
        </button>
      </div>
      {SLIDERS.map(([bus, label]) => (
        <VolumeSlider key={bus} bus={bus} label={label} />
      ))}
    </div>
  )
}
