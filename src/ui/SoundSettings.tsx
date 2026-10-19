import { ArrowLeft, Volume2, VolumeX } from 'lucide-react'
import type { CSSProperties } from 'react'
import { sfx } from '../audio/sounds'
import { useAudioStore, type Bus } from '../state/audioStore'
import { KeyCap, MenuButton, Sheet } from './components'
import { useMenuNav } from './menuNav'

const SLIDERS: [Bus, string][] = [
  ['master', 'Master'],
  ['music', 'Music'],
  ['sfx', 'Effects'],
]

const VOLUME_STEP = 0.1 // per left / right press

const toggleMute = () => useAudioStore.getState().toggleMute()

const stepVolume = (bus: Bus, dir: 1 | -1) => {
  const audio = useAudioStore.getState()
  const next = Math.round((audio[bus] + dir * VOLUME_STEP) * 10) / 10
  audio.setVolume(bus, Math.min(Math.max(next, 0), 1))
  sfx.uiTick()
}

// Like every menu control, the slider takes no tab stop and lets go of focus once used, so
// Enter, Space and Esc keep going to the menu's actions; left / right step it when focused.
function VolumeSlider({ bus, label, focused }: { bus: Bus; label: string; focused: boolean }) {
  const percent = useAudioStore((s) => Math.round(s[bus] * 100))
  const release = (e: { currentTarget: HTMLInputElement }) => {
    e.currentTarget.blur()
    sfx.uiTick()
  }
  return (
    <label className={`menu-slider${focused ? ' is-focused' : ''}`}>
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

// Sound settings as a sheet over the main or pause menu: mute and the three volumes.
export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const started = useAudioStore((s) => s.started)
  const muted = useAudioStore((s) => s.muted)
  const nav = useMenuNav(
    [
      { id: 'mute', activate: toggleMute },
      ...SLIDERS.map(([bus]) => ({ id: bus, adjust: (dir: 1 | -1) => stepVolume(bus, dir) })),
      { id: 'back', activate: onClose },
    ],
    'back',
    { onClose },
  )
  const Icon = muted ? VolumeX : Volume2
  return (
    <Sheet title="Settings" aside={<span className="ui-label">Sound</span>}>
      <button
        type="button"
        tabIndex={-1}
        className={`menu-mute${muted ? ' is-muted' : ''}${nav.isFocused('mute') ? ' is-focused' : ''}`}
        aria-pressed={muted}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggleMute}
      >
        <Icon size={16} strokeWidth={1.75} aria-hidden />
        <span className="menu-mute-label">{muted ? 'Sound off' : 'Sound on'}</span>
        <KeyCap refs={['mute']} />
      </button>
      <div className={muted ? 'menu-sliders is-muted' : 'menu-sliders'}>
        {SLIDERS.map(([bus, label]) => (
          <VolumeSlider key={bus} bus={bus} label={label} focused={nav.isFocused(bus)} />
        ))}
      </div>
      {!started && <div className="menu-hint">Click or press a key to turn sound on</div>}
      <MenuButton
        icon={ArrowLeft}
        label="Back"
        action="back"
        onClick={onClose}
        focused={nav.isFocused('back')}
      />
    </Sheet>
  )
}
