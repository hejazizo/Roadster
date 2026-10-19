import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { bindingSources, type BindingRef, type Device } from '../config/bindings'
import { useInputStore } from '../state/inputStore'
import { KeyCap, MenuButton, Segmented, Sheet } from './components'
import { useMenuNav } from './menuNav'

// The controls reference, as a sheet over the main or pause menu: actions in four groups,
// drawn for the keyboard or the gamepad.

type Control = [BindingRef[], string]

const GROUPS: { title: string; controls: Control[] }[] = [
  {
    title: 'Drive',
    controls: [
      [
        [
          ['throttle', 1],
          ['throttle', -1],
        ],
        'Drive, brake, reverse',
      ],
      [
        [
          ['steer', -1],
          ['steer', 1],
        ],
        'Steer',
      ],
      [['boost'], 'Boost'],
      [['handbrake'], 'Handbrake, drift'],
    ],
  },
  {
    title: 'Air',
    controls: [
      [['lift'], 'Jets: lift off, brake a fall'],
      [['hop'], 'Hop, hold to glide'],
      [
        [
          ['pitch', 1],
          ['pitch', -1],
        ],
        'Pitch: nose down, up',
      ],
    ],
  },
  {
    title: 'Stunts',
    controls: [
      [['fans'], 'Fans: stick to walls'],
      [['airRoll'], 'In the air: hold and steer to roll'],
      [['reset'], 'Back to safe point'],
    ],
  },
  {
    title: 'Race',
    controls: [
      [['restart'], 'Restart'],
      [['pause'], 'Pause'],
      [['mute'], 'Sound on / off'],
    ],
  },
]

const DEVICES: { id: Device; name: string }[] = [
  { id: 'keyboard', name: 'Keyboard' },
  { id: 'gamepad', name: 'Gamepad' },
]

// Follows the last-used device, until the switch is flipped by hand.
function useShownDevice() {
  const lastDevice = useInputStore((s) => s.device)
  const [picked, setPicked] = useState<{ device: Device; from: Device } | null>(null)
  // A pick holds only while the last-used device stays the one it was made on.
  const device = picked && picked.from === lastDevice ? picked.device : lastDevice
  const pick = (next: Device) => setPicked({ device: next, from: lastDevice })
  return [device, pick] as const
}

export default function ControlsSheet({ onClose }: { onClose: () => void }) {
  const [device, setDevice] = useShownDevice()
  const toggle = () => setDevice(device === 'keyboard' ? 'gamepad' : 'keyboard')
  const nav = useMenuNav(
    [
      { id: 'device', activate: toggle, adjust: toggle },
      { id: 'back', activate: onClose },
    ],
    'back',
    { onClose },
  )
  return (
    <Sheet
      title="Controls"
      wide
      aside={
        <Segmented
          label="Device"
          options={DEVICES}
          value={device}
          onChange={setDevice}
          focused={nav.isFocused('device')}
        />
      }
    >
      <div className="menu-controls-grid">
        {GROUPS.map(({ title, controls }) => (
          <section key={title} className="menu-controls-group">
            <h3 className="menu-section-title">{title}</h3>
            <dl className="menu-controls-list">
              {controls.map(([refs, description]) => (
                <div key={description}>
                  <dt>
                    {bindingSources(refs, device).length > 0 ? (
                      <KeyCap refs={refs} device={device} />
                    ) : (
                      <span className="menu-unbound">Not bound</span>
                    )}
                  </dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
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
