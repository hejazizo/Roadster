import type { AudioGraph } from './audio'

// Building blocks for short synthesized notes: an oscillator or a burst of filtered noise
// with an attack / exponential-decay envelope. The nodes stop themselves and are then
// garbage collected.

export const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12)

// Exponential ramps can't reach 0.
const SILENT = 0.0001

type Filter = {
  type: BiquadFilterType
  freq: number
  freqEnd?: number // swept exponentially to this over the note
  Q?: number
}

type Envelope = {
  at: number // context time the note starts
  attack?: number // s to the peak
  decay: number // s from the peak to silence
  gain: number // peak
}

export type ToneOptions = Envelope & {
  type?: OscillatorType
  freq: number // Hz
  freqEnd?: number // Hz, glided to exponentially over the note
  detune?: number // cents
  filter?: Filter
}

export type NoiseOptions = Envelope & { filter: Filter }

function envelope(a: AudioGraph, out: AudioNode, { at, attack = 0.005, decay, gain }: Envelope) {
  const env = a.ctx.createGain()
  env.gain.setValueAtTime(0, at)
  env.gain.linearRampToValueAtTime(gain, at + attack)
  env.gain.exponentialRampToValueAtTime(SILENT, at + attack + decay)
  env.connect(out)
  return { env, end: at + attack + decay + 0.02 }
}

function filtered(a: AudioGraph, out: AudioNode, f: Filter | undefined, at: number, end: number) {
  if (!f) return out
  const filter = a.ctx.createBiquadFilter()
  filter.type = f.type
  filter.Q.value = f.Q ?? 1
  filter.frequency.setValueAtTime(f.freq, at)
  if (f.freqEnd) filter.frequency.exponentialRampToValueAtTime(f.freqEnd, end)
  filter.connect(out)
  return filter
}

export function tone(a: AudioGraph, out: AudioNode, o: ToneOptions) {
  const { env, end } = envelope(a, out, o)
  const osc = a.ctx.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.detune.value = o.detune ?? 0
  osc.frequency.setValueAtTime(o.freq, o.at)
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, end)
  osc.connect(filtered(a, env, o.filter, o.at, end))
  osc.start(o.at)
  osc.stop(end)
}

export function noise(a: AudioGraph, out: AudioNode, o: NoiseOptions) {
  const { env, end } = envelope(a, out, o)
  const src = noiseSource(a)
  src.connect(filtered(a, env, o.filter, o.at, end))
  src.start(o.at, Math.random() * (a.noise.duration - 0.5))
  src.stop(end)
}

// A looping white-noise source starting at a random point, for continuous sounds.
export function noiseSource(a: AudioGraph) {
  const src = a.ctx.createBufferSource()
  src.buffer = a.noise
  src.loop = true
  return src
}

// A gain node into `out`; the usual way to give a sound its level.
export function gainInto(a: AudioGraph, out: AudioNode, gain: number) {
  const node = a.ctx.createGain()
  node.gain.value = gain
  node.connect(out)
  return node
}
