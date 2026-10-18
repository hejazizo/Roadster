import { TUNING } from '../config/tuning'
import { getAudio, type AudioGraph } from './audio'
import { gainInto, midiToHz, noise, tone } from './synth'

// Procedural music: a four-bar synthwave loop in A minor (Am – F – C – G) played by a small
// step sequencer. Notes are scheduled a little ahead on the audio clock from a timer, the
// usual way to get steady timing out of a jittery main thread. The calm intensity (menus,
// results) is pad and arpeggio; the full one adds bass and drums during a run.

// MIDI notes per bar: the bass root and a three-note pad chord.
const BARS = [
  { root: 45, chord: [57, 60, 64] }, // Am
  { root: 41, chord: [57, 60, 65] }, // F
  { root: 48, chord: [55, 60, 64] }, // C
  { root: 43, chord: [55, 59, 62] }, // G
]
// Arpeggio over the chord (an octave up) plus its root another octave up; one per 16th.
const ARP = [0, 1, 2, 3, 2, 1, 2, 3]
const STEPS = 16 // 16ths per bar
const LOOKAHEAD = 0.12 // s of notes scheduled ahead
const TICK_MS = 25

type Layer = 'pad' | 'arp' | 'bass' | 'drums'
const LAYER_LEVELS: Record<Layer, number> = { pad: 0.1, arp: 0.05, bass: 0.2, drums: 0.45 }
const INTENSITIES = {
  calm: ['pad', 'arp'],
  full: ['pad', 'arp', 'bass', 'drums'],
} satisfies Record<string, Layer[]>
export type Intensity = keyof typeof INTENSITIES
const LAYER_FADE = 0.4 // s time constant when layers come and go

let music: { bus: GainNode; layers: Record<Layer, GainNode> } | null = null
let intensity: Intensity = 'calm'
let step = 0
let bar = 0
let nextTime = 0

export function setMusicIntensity(next: Intensity) {
  intensity = next
  const a = getAudio()
  if (!a || !music) return
  const on: Layer[] = INTENSITIES[next]
  for (const [layer, node] of Object.entries(music.layers) as [Layer, GainNode][]) {
    const level = on.includes(layer) ? LAYER_LEVELS[layer] : 0
    node.gain.setTargetAtTime(level, a.ctx.currentTime, LAYER_FADE)
  }
}

// Starts the loop once audio is running; later calls do nothing.
export function startMusic() {
  const a = getAudio()
  if (!a || music) return
  const bus = gainInto(a, a.music, TUNING.audio.mix.music)
  const layer = () => gainInto(a, bus, 0)
  music = { bus, layers: { pad: layer(), arp: layer(), bass: layer(), drums: layer() } }
  setMusicIntensity(intensity)
  nextTime = a.ctx.currentTime + 0.1
  setInterval(() => schedule(a), TICK_MS)
}

function schedule(a: AudioGraph) {
  if (!music || a.ctx.state !== 'running') return
  const now = a.ctx.currentTime
  music.bus.gain.setTargetAtTime(TUNING.audio.mix.music, now, 0.05)
  // After a stall (background tab), pick up from now instead of rushing to catch up.
  if (nextTime < now - 0.2) nextTime = now + 0.05
  while (nextTime < now + LOOKAHEAD) {
    const stepTime = 60 / TUNING.audio.music.tempo / 4
    playStep(a, music.layers, nextTime, stepTime)
    nextTime += stepTime
    step = (step + 1) % STEPS
    if (step === 0) bar = (bar + 1) % BARS.length
  }
}

function playStep(a: AudioGraph, layers: Record<Layer, GainNode>, at: number, stepTime: number) {
  const { root, chord } = BARS[bar]

  if (step === 0) {
    // Pad: two detuned saws per chord note, swelling in and fading across the bar.
    for (const n of chord) {
      for (const detune of [-8, 8]) {
        tone(a, layers.pad, {
          at,
          type: 'sawtooth',
          freq: midiToHz(n),
          detune,
          attack: 0.4,
          decay: stepTime * STEPS * 1.3,
          gain: 1,
          filter: { type: 'lowpass', freq: 1400 },
        })
      }
    }
  }

  const arpNotes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24]
  tone(a, layers.arp, {
    at,
    type: 'square',
    freq: midiToHz(arpNotes[ARP[step % ARP.length]]),
    decay: 0.14,
    gain: 1,
    filter: { type: 'lowpass', freq: 2200 },
  })

  if (step % 2 === 0) {
    tone(a, layers.bass, {
      at,
      type: 'sawtooth',
      freq: midiToHz(root),
      decay: 0.22,
      gain: 1,
      filter: { type: 'lowpass', freq: 700, freqEnd: 200, Q: 4 },
    })
  }

  // Four on the floor, snare on 2 and 4, open off-beat hats and quiet 16ths between.
  if (step % 4 === 0) tone(a, layers.drums, { at, freq: 150, freqEnd: 45, decay: 0.3, gain: 1 })
  if (step === 4 || step === 12) {
    noise(a, layers.drums, {
      at,
      decay: 0.18,
      gain: 0.5,
      filter: { type: 'bandpass', freq: 1800, Q: 0.7 },
    })
    tone(a, layers.drums, { at, type: 'triangle', freq: 200, freqEnd: 120, decay: 0.1, gain: 0.3 })
  }
  if (step % 2 === 1 || step % 4 === 2) {
    noise(a, layers.drums, {
      at,
      decay: step % 4 === 2 ? 0.07 : 0.03,
      gain: step % 4 === 2 ? 0.3 : 0.1,
      filter: { type: 'highpass', freq: 7000 },
    })
  }
}
