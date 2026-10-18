// m:ss.cc
export function formatTime(seconds: number) {
  const cs = Math.floor(seconds * 100)
  const m = Math.floor(cs / 6000)
  const s = Math.floor(cs / 100) % 60
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}
