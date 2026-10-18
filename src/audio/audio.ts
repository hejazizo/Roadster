import { useAudioStore } from '../state/audioStore'

// The audio graph. Everything is synthesized with the Web Audio API; there are no sound
// files. Browsers only let a page start audio from a user gesture, so the context is
// created by `startAudio`, which runs inside a click or key press (src/audio/gameAudio.ts).
//
//   music layers → music → muffle (low-pass) ─┐
//   car loops → car ─┐                        ├→ master → limiter → speakers
//   one-shots ───────┴→ sfx ──────────────────┘
export type AudioGraph = {
  ctx: AudioContext
  master: GainNode
  music: GainNode // player music volume
  muffle: BiquadFilterNode // closes while paused
  sfx: GainNode // player effects volume
  car: GainNode // the car's continuous sounds; fades out while paused
  noise: AudioBuffer // 2 s of white noise, shared by every noise source
}

// Fade time constant (s) for volume and pause changes; short enough to feel instant
// without clicks.
const FADE = 0.03
// Music while paused: low-passed at this cutoff (Hz) and turned down to this gain.
const PAUSED_MUFFLE = 600
const PAUSED_MUSIC = 0.5
const OPEN_MUFFLE = 20000

let graph: AudioGraph | null = null
// Music gain from pausing, on top of the player's music volume.
let pauseMusic = 1

// Null until audio has started.
export const getAudio = (): AudioGraph | null => graph

// The graph for one-shots: null before the start and while the tab is hidden (the context
// is suspended then), so sounds aren't queued up to play all at once on return. A context
// that's still starting up is fine; its sounds play as soon as it runs.
export const liveAudio = (): AudioGraph | null => (document.hidden ? null : graph)

// Sliders are linear; squaring them makes the low end usable.
const curve = (v: number) => v * v

function applyVolumes() {
  if (!graph) return
  const { master, music, sfx, muted } = useAudioStore.getState()
  const t = graph.ctx.currentTime
  graph.master.gain.setTargetAtTime(muted ? 0 : curve(master), t, FADE)
  graph.music.gain.setTargetAtTime(curve(music) * pauseMusic, t, FADE)
  graph.sfx.gain.setTargetAtTime(curve(sfx), t, FADE)
}

// The game froze or resumed: silence the car and muffle the music.
export function setAudioPaused(paused: boolean) {
  pauseMusic = paused ? PAUSED_MUSIC : 1
  if (!graph) return
  const t = graph.ctx.currentTime
  graph.car.gain.setTargetAtTime(paused ? 0 : 1, t, FADE)
  graph.muffle.frequency.setTargetAtTime(paused ? PAUSED_MUFFLE : OPEN_MUFFLE, t, FADE * 3)
  applyVolumes()
}

const onVisibilityChange = () => {
  if (!graph) return
  if (document.hidden) void graph.ctx.suspend()
  else void graph.ctx.resume()
}

function createNoise(ctx: AudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

// Creates the context on the first call, and resumes it if the browser suspended it; call it
// from inside a user gesture. Returns whether audio has started. Some key presses (Esc)
// don't count as a gesture, so it waits for one that does rather than make a context the
// browser would refuse to start.
export function startAudio(): boolean {
  if (graph) {
    if (graph.ctx.state === 'suspended' && !document.hidden) void graph.ctx.resume()
    return true
  }
  if (navigator.userActivation && !navigator.userActivation.isActive) return false

  const ctx = new AudioContext({ latencyHint: 'interactive' })
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -6
  limiter.knee.value = 6
  limiter.ratio.value = 12
  limiter.attack.value = 0.003
  limiter.release.value = 0.15
  limiter.connect(ctx.destination)

  const master = ctx.createGain()
  master.connect(limiter)
  const muffle = ctx.createBiquadFilter()
  muffle.type = 'lowpass'
  muffle.frequency.value = OPEN_MUFFLE
  muffle.connect(master)
  const music = ctx.createGain()
  music.connect(muffle)
  const sfx = ctx.createGain()
  sfx.connect(master)
  const car = ctx.createGain()
  car.connect(sfx)

  // Start silent and fade in, so nothing clicks.
  for (const bus of [master, music, sfx]) bus.gain.value = 0
  graph = { ctx, master, music, muffle, sfx, car, noise: createNoise(ctx) }
  applyVolumes()
  useAudioStore.subscribe(applyVolumes)
  document.addEventListener('visibilitychange', onVisibilityChange)
  useAudioStore.setState({ started: true })
  return true
}
