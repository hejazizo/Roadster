import { useRaceStore } from '../state/raceStore'

const GO_TIME = 0.8 // s "GO!" stays up after the start

// m:ss.cc
function formatTime(seconds: number) {
  const cs = Math.floor(seconds * 100)
  const m = Math.floor(cs / 6000)
  const s = Math.floor(cs / 100) % 60
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}

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

// Big centre message for the current phase; selects a string so it re-renders only on change.
function Message() {
  const message = useRaceStore((s) => {
    switch (s.phase) {
      case 'ready':
        return 'Press Enter to start'
      case 'countdown':
        return String(Math.ceil(s.countdown))
      case 'racing':
        return s.time < GO_TIME ? 'GO!' : null
      case 'finished':
        return `Finished · ${formatTime(s.finalTime ?? 0)}`
    }
  })
  const finished = useRaceStore((s) => s.phase === 'finished')
  if (!message) return null
  return (
    <div className="race-message">
      <div className="race-message-main">{message}</div>
      {finished && <div className="race-message-hint">Enter to restart</div>}
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
