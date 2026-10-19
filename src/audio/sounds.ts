import { TUNING } from '../config/tuning'
import { liveAudio, type AudioGraph } from './audio'
import { midiToHz, noise, tone } from './synth'

const { mix } = TUNING.audio

// Plays a one-shot on the effects bus, or does nothing before audio has started.
function play(sound: (a: AudioGraph, out: AudioNode, now: number) => void) {
  const a = liveAudio()
  if (a) sound(a, a.sfx, a.ctx.currentTime)
}

// Landing on the wheels: the front axle bottoms out, then the rear a beat later and softer.
const LANDING_AXLES = [
  { delay: 0, level: 1 },
  { delay: 0.075, level: 0.7 },
]
// Body panel resonances (Hz) in a landing's clunk; inharmonic, so they ring as sheet metal.
const PANEL_MODES = [830, 1370, 2240]

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

  // Jets firing: a sharp burst of hiss over a soft low whump.
  jetBurst: () =>
    play((a, out, at) => {
      const level = mix.oneShots
      noise(a, out, {
        at,
        attack: 0.005,
        decay: 0.35,
        gain: 0.45 * level,
        filter: { type: 'highpass', freq: 5000, freqEnd: 2500 },
      })
      tone(a, out, { at, freq: 70, freqEnd: 40, decay: 0.2, gain: 0.4 * level })
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

  // A heavy car coming down, louder and longer with the impact (0–1). On the wheels: the
  // suspension bottoms out front then rear, each a dull thud with almost no pitch drop (a
  // falling pitch reads as a bouncing ball), over a clunk of body panels and a short rattle.
  // On the roof or side (`bad`): one heavier body hit with more metal in it.
  landing: (impact: number, bad = false) =>
    play((a, out, at) => {
      const k = (0.35 + 0.65 * impact) * mix.oneShots
      const axles = bad ? [{ delay: 0, level: 1 }] : LANDING_AXLES
      for (const { delay, level } of axles) {
        const t = at + delay
        noise(a, out, {
          at: t,
          attack: 0.003,
          decay: 0.1 + 0.12 * impact,
          gain: 2.5 * k * level,
          filter: { type: 'lowpass', freq: 260, freqEnd: 140, Q: 0.8 },
        })
        tone(a, out, {
          at: t,
          freq: 62,
          freqEnd: 54,
          attack: 0.004,
          decay: 0.09 + 0.09 * impact,
          gain: 0.8 * k * level,
        })
      }
      // Body clunk: a knock of mid noise and a few short inharmonic panel modes.
      const metal = bad ? 1.6 : 1
      noise(a, out, {
        at,
        attack: 0.002,
        decay: bad ? 0.16 : 0.08,
        gain: 0.6 * k * metal,
        filter: { type: 'bandpass', freq: 480, Q: 1.4 },
      })
      PANEL_MODES.forEach((freq, i) => {
        tone(a, out, {
          at: at + 0.003 * i,
          type: 'triangle',
          freq,
          attack: 0.001,
          decay: 0.04 + 0.02 * i,
          gain: 0.05 * k * metal * (0.4 + impact),
        })
      })
      // Rattle: a few small clicks dying away as the body settles.
      for (let i = 0; i < 4; i++) {
        noise(a, out, {
          at: at + 0.035 + 0.04 * i + Math.random() * 0.015,
          attack: 0.001,
          decay: 0.018,
          gain: 0.25 * k * (1 - i / 4) * (0.3 + impact),
          filter: { type: 'bandpass', freq: 2200 + Math.random() * 2400, Q: 3 },
        })
      }
    }),

  // Clipping a parked car: a dull body thud with a metallic clank on top, louder with impact.
  hit: (impact: number) =>
    play((a, out, at) => {
      const k = (0.4 + 0.6 * impact) * mix.oneShots
      tone(a, out, { at, freq: 90, freqEnd: 45, decay: 0.2, gain: 0.7 * k })
      tone(a, out, { at, freq: 620, freqEnd: 480, decay: 0.12, gain: 0.18 * k, type: 'square' })
      noise(a, out, {
        at,
        decay: 0.16 + 0.1 * impact,
        gain: 0.55 * k,
        filter: { type: 'bandpass', freq: 1800, freqEnd: 700 },
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

  // Reveal-run step done: the ring chime with a third between, climbing with each step.
  stunt: (step: number) =>
    play((a, out, at) => {
      const note = 72 + PENTATONIC[(step * 2) % PENTATONIC.length]
      const level = mix.race
      ;[note, note + 4, note + 7].forEach((n, i) => {
        const t = at + i * 0.06
        tone(a, out, { at: t, type: 'triangle', freq: midiToHz(n), decay: 0.4, gain: 0.26 * level })
        tone(a, out, { at: t, freq: midiToHz(n + 12), decay: 0.22, gain: 0.08 * level })
      })
    }),

  // Reveal-run penalty (off the loop, a bad landing): a low falling pair.
  stuntFail: () =>
    play((a, out, at) => {
      const level = mix.race
      ;[58, 53].forEach((n, i) => {
        tone(a, out, {
          at: at + i * 0.14,
          type: 'square',
          freq: midiToHz(n),
          decay: 0.3,
          gain: 0.16 * level,
          filter: { type: 'lowpass', freq: 1800 },
        })
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
