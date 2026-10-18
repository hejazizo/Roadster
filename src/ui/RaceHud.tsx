import { useRaceStore } from '../state/raceStore'
import { formatTime } from './formatTime'

const GO_TIME = 0.8 // s "GO!" stays up after the start

function Timer() {
  const time = useRaceStore((s) => formatTime(s.finalTime ?? s.time))
  return <div className="race-time">{time}</div>
}

function RingCount() {
  const passed = useRaceStore((s) => s.nextRing)
  const total = useRaceStore((s) => s.ringCount)
  return (
    <div className="race-rings">
      <span className="hud-label">Rings</span> {passed} / {total}
    </div>
  )
}

// Big centre countdown and "GO!"; selects a string so it re-renders only on change. The
// menu, pause and results screens are in Menus.tsx.
function Message() {
  const message = useRaceStore((s) => {
    if (s.phase === 'countdown') return String(Math.ceil(s.countdown))
    if (s.phase === 'racing' && s.time < GO_TIME) return 'GO!'
    return null
  })
  if (!message) return null
  return (
    <div className="race-message">
      <div className="race-message-main">{message}</div>
    </div>
  )
}

export default function RaceHud() {
  return (
    <>
      <div className="race-panel">
        <Timer />
        <RingCount />
      </div>
      <Message />
    </>
  )
}
