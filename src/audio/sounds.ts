import { TUNING } from '../config/tuning'
import { liveAudio, type AudioGraph } from './audio'
import { midiToHz, noise, tone } from './synth'

const { mix } = TUNING.audio

// Plays a one-shot on the effects bus, or does nothing before audio has started.
function play(sound: (a: AudioGraph, out: AudioNode, now: number) => void) {
  const a = liveAudio()
  if (a) sound(a, a.sfx, a.ctx.currentTime)
}

// Major pentatonic steps, so successive rings climb a tune.
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]

// One-shot sound effects. Each reads its mix level when played.
export const sfx = {
  // Thruster ignition: a rising whoosh over a low thump.
  boostBurst: () =>
    play((a, out, at) => {
      const level = mix.oneShots
      noise(a, out, {
        at,
        attack: 0.02,
        decay: 0.45,
        gain: 0.6 * level,
        filter: { type: 'bandpass', freq: 400, freqEnd: 2500, Q: 1.2 },
      })
      tone(a, out, { at, freq: 90, freqEnd: 45, decay: 0.25, gain: 0.7 * level })
    }),

  // An upward pop with a puff of air.
  hop: () =>
    play((a, out, at) => {
      const level = mix.oneShots
      tone(a, out, {
        at,
        type: 'triangle',
        freq: 180,
        freqEnd: 520,
        decay: 0.14,
        gain: 0.35 * level,
      })
      noise(a, out, {
        at,
        decay: 0.12,
        gain: 0.2 * level,
        filter: { type: 'highpass', freq: 1500 },
      })
    }),

  // A thump that grows deeper, longer and louder with the impact (0–1).
  landing: (impact: number) =>
    play((a, out, at) => {
      const k = (0.35 + 0.65 * impact) * mix.oneShots
      tone(a, out, { at, freq: 110, freqEnd: 38, decay: 0.25 + 0.25 * impact, gain: 0.9 * k })
      noise(a, out, {
        at,
        decay: 0.18 + 0.2 * impact,
        gain: 0.5 * k,
        filter: { type: 'lowpass', freq: 900, freqEnd: 200 },
      })
    }),

  // Back at the safe point: a soft falling swish.
  respawn: () =>
    play((a, out, at) => {
      const level = mix.oneShots
      noise(a, out, {
        at,
        attack: 0.2,
        decay: 0.3,
        gain: 0.3 * level,
        filter: { type: 'bandpass', freq: 3000, freqEnd: 300, Q: 2 },
      })
      tone(a, out, { at, freq: 900, freqEnd: 300, attack: 0.15, decay: 0.3, gain: 0.1 * level })
    }),

  // Countdown beep for 3, 2, 1.
  countdown: () =>
    play((a, out, at) => {
      tone(a, out, {
        at,
        type: 'square',
        freq: 660,
        decay: 0.18,
        gain: 0.25 * mix.race,
        filter: { type: 'lowpass', freq: 3000 },
      })
    }),

  // Start: an octave up and longer.
  go: () =>
    play((a, out, at) => {
      tone(a, out, {
        at,
        type: 'square',
        freq: 1320,
        decay: 0.55,
        gain: 0.3 * mix.race,
        filter: { type: 'lowpass', freq: 4000 },
      })
    }),

  // Ring passed: a bright note and its fifth, climbing with each ring.
  ring: (index: number) =>
    play((a, out, at) => {
      const note = 72 + PENTATONIC[index % PENTATONIC.length]
      const level = mix.race
      ;[note, note + 7].forEach((n, i) => {
        const t = at + i * 0.07
        tone(a, out, { at: t, type: 'triangle', freq: midiToHz(n), decay: 0.35, gain: 0.3 * level })
        tone(a, out, { at: t, freq: midiToHz(n + 12), decay: 0.2, gain: 0.1 * level })
      })
    }),

  // Finish: a rising arpeggio, carried on higher with a sparkle for a new best.
  finish: (newBest: boolean) =>
    play((a, out, at) => {
      const level = mix.race
      const notes = newBest ? [72, 76, 79, 84, 88, 91, 96] : [72, 76, 79, 84]
      notes.forEach((n, i) => {
        const last = i === notes.length - 1
        tone(a, out, {
          at: at + i * 0.09,
          type: 'triangle',
          freq: midiToHz(n),
          decay: last ? 1.2 : 0.4,
          gain: 0.28 * level,
        })
      })
      if (newBest) {
        noise(a, out, {
          at: at + notes.length * 0.09,
          attack: 0.05,
          decay: 0.8,
          gain: 0.12 * level,
          filter: { type: 'highpass', freq: 6000 },
        })
      }
    }),

  uiConfirm: () =>
    play((a, out, at) => {
      tone(a, out, {
        at,
        type: 'triangle',
        freq: 660,
        freqEnd: 990,
        decay: 0.09,
        gain: 0.5 * mix.ui,
      })
    }),

  uiBack: () =>
    play((a, out, at) => {
      tone(a, out, {
        at,
        type: 'triangle',
        freq: 660,
        freqEnd: 440,
        decay: 0.09,
        gain: 0.5 * mix.ui,
      })
    }),

  // Paint change, pause toggle, slider release.
  uiTick: () =>
    play((a, out, at) => {
      tone(a, out, { at, freq: 1200, decay: 0.04, gain: 0.4 * mix.ui })
    }),
}
