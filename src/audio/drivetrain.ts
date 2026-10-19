import { MathUtils } from 'three'
import { drivetrainSampleUrl } from '../config/assets'
import { TUNING } from '../config/tuning'
import type { AudioGraph } from './audio'
import { DRIVETRAIN_SAMPLES, type DrivetrainLayer } from './drivetrainSamples'
import { gainInto } from './synth'

// The car's drivetrain, from looped recordings of real EVs (built by scripts/build-audio.ts,
// sources in assets/audio/LICENSE.txt). Motor speed picks a band, throttle crossfades from the
// off-load loop to the on-load one, and road rumble follows the wheels. The gear whine and the
// regen tone are synthesized, since no recording had them clean.

export type DrivetrainBuffers = Record<DrivetrainLayer, AudioBuffer>

// On-load loops at three speeds; off-load ones at the upper two (no recording had a clean
// low-speed coast, and a coasting EV is near silent there anyway).
const ON_BANDS = ['onLow', 'onMid', 'onHigh'] as const
const OFF_BANDS = ['offMid', 'offHigh'] as const

// Fetches and decodes every loop, once (the car remounts on a level change); null if any fails,
// and the synth motor stays.
let loading: Promise<DrivetrainBuffers | null> | null = null
export function loadDrivetrain(a: AudioGraph): Promise<DrivetrainBuffers | null> {
  loading ??= Promise.all(
    Object.entries(DRIVETRAIN_SAMPLES).map(async ([id, s]) => {
      const res = await fetch(drivetrainSampleUrl(s.file))
      if (!res.ok) throw new Error(`${s.file}: HTTP ${res.status}`)
      return [id, await a.ctx.decodeAudioData(await res.arrayBuffer())] as const
    }),
  ).then(
    (entries) => Object.fromEntries(entries) as DrivetrainBuffers,
    (err) => {
      console.warn('Drivetrain sound: the recordings failed to load; keeping the synth motor.', err)
      return null
    },
  )
  return loading
}

export type DrivetrainInput = {
  speed: number // m/s along the car's forward axis
  throttle: number // -1…1
  braking: boolean
  contact: number // 0–1, the fraction of wheels on the ground
  thrust: number // 0–1, the boost flame
  dt: number // s since the last update
}

type Loop = { rate: AudioParam; gain: GainNode; refSpeed: number }

// Time constant (s) for parameters following the car, as in CarAudio.
const FOLLOW = 0.05
// Above this many m/s over the wheels, the motor is still spun up from the air.
const SPUN_UP = 2

export type Drivetrain = ReturnType<typeof createDrivetrain>

// Equal-power weights for loops recorded at `speeds` (ascending): the two around `speed` share
// it by cos / sin, and past either end the end loop has it all.
function bandWeights(speed: number, speeds: number[]) {
  const w = speeds.map(() => 0)
  const last = speeds.length - 1
  if (speed <= speeds[0]) w[0] = 1
  else if (speed >= speeds[last]) w[last] = 1
  else {
    let i = 0
    while (speed > speeds[i + 1]) i++
    const x = (speed - speeds[i]) / (speeds[i + 1] - speeds[i])
    w[i] = Math.cos((x * Math.PI) / 2)
    w[i + 1] = Math.sin((x * Math.PI) / 2)
  }
  return w
}

export function createDrivetrain(a: AudioGraph, buffers: DrivetrainBuffers) {
  const { ctx } = a
  const sources: AudioScheduledSourceNode[] = []

  // Everything fades in from silence over `fadeIn`, as the synth motor fades out.
  const out = gainInto(a, a.car, 0)
  out.gain.setValueAtTime(0, ctx.currentTime)
  out.gain.linearRampToValueAtTime(1, ctx.currentTime + TUNING.audio.drivetrain.fadeIn)
  const bright = ctx.createBiquadFilter()
  bright.type = 'lowpass'
  bright.Q.value = 0.7
  bright.connect(out)

  const loops: Partial<Record<DrivetrainLayer, Loop>> = {}
  const loop = (id: DrivetrainLayer, into: AudioNode): Loop => {
    const s = DRIVETRAIN_SAMPLES[id]
    const src = ctx.createBufferSource()
    src.buffer = buffers[id]
    src.loop = true
    src.loopStart = s.loopStart
    src.loopEnd = s.loopEnd
    const gain = gainInto(a, into, 0)
    src.connect(gain)
    sources.push(src)
    // Start each loop somewhere inside it, so layers cut from one recording don't line up.
    src.start(0, s.loopStart + Math.random() * (s.loopEnd - s.loopStart))
    return (loops[id] = { rate: src.playbackRate, gain, refSpeed: s.refSpeed })
  }

  const on = ON_BANDS.map((id) => loop(id, bright))
  const off = OFF_BANDS.map((id) => loop(id, bright))
  const rumble = loop('rumble', out)
  const surge = loop('surge', out)

  // Gear whine: a sine at the reduction gear's mesh frequency.
  const whine = gainInto(a, out, 0)
  const whineOsc = ctx.createOscillator()
  whineOsc.connect(whine)
  // Regen: the inverter's tone, a pair of detuned triangles through a band-pass.
  const regen = gainInto(a, out, 0)
  const regenFilter = ctx.createBiquadFilter()
  regenFilter.type = 'bandpass'
  regenFilter.Q.value = 4
  regenFilter.connect(regen)
  const regenOsc = [ctx.createOscillator(), ctx.createOscillator()]
  regenOsc[1].detune.value = 9
  for (const o of regenOsc) {
    o.type = 'triangle'
    o.connect(regenFilter)
  }
  for (const o of [whineOsc, ...regenOsc]) {
    o.start()
    sources.push(o)
  }

  // Motor speed, in road m/s: the wheels' speed on the ground, free to spin up in the air.
  let motorSpeed = 0
  let load = 0

  return {
    // For debugging: the motor's state and each loop's current gain and playback rate.
    get state() {
      const layers = Object.entries(loops).map(([id, l]) => [
        id,
        { gain: l.gain.gain.value, rate: l.rate.value },
      ])
      return { motorSpeed, load, layers: Object.fromEntries(layers) }
    },

    update(input: DrivetrainInput) {
      const { mix, drivetrain: d } = TUNING.audio
      const now = ctx.currentTime
      const set = (param: AudioParam, value: number) => param.setTargetAtTime(value, now, FOLLOW)
      const { dt } = input
      const wheel = Math.abs(input.speed)
      const grounded = input.contact > 0

      // Throttle in the direction of travel (reverse counts too; against it is braking). In
      // the air the wheels spin freely, so any throttle loads the motor.
      const forward = input.speed > -TUNING.car.stopSpeed
      const drive = grounded
        ? Math.max(0, forward ? input.throttle : -input.throttle)
        : Math.abs(input.throttle)
      load += (drive - load) * (1 - Math.exp(-dt / d.loadFollow))

      if (grounded) {
        // Back on the wheels: a spun-up motor drops to their speed, otherwise it follows them.
        if (motorSpeed > wheel + SPUN_UP) {
          motorSpeed += (wheel - motorSpeed) * (1 - Math.exp(-dt / d.landingDrop))
        } else motorSpeed = wheel
      } else {
        // Unloaded wheels: the motor spins up with throttle and settles back without it.
        const target = Math.max(wheel, drive * d.airRevSpeed)
        motorSpeed += (target - motorSpeed) * (1 - Math.exp(-dt / d.airRevRate))
      }

      const levelFrac = MathUtils.clamp(motorSpeed / d.levelSpeed, 0, 1)
      const level =
        (mix.drivetrain * MathUtils.lerp(d.idleLevel, 1, levelFrac) * (1 + d.loadLevel * load)) /
        (1 + d.loadLevel)

      // Equal-power crossfades: between neighbouring bands by speed, off-load to on-load by load.
      const onWeights = bandWeights(motorSpeed, [d.lowSpeed, d.midSpeed, d.highSpeed])
      const offWeights = bandWeights(motorSpeed, [d.midSpeed, d.highSpeed])
      const onMix = Math.sin((load * Math.PI) / 2)
      const offMix = Math.cos((load * Math.PI) / 2)
      const rate = (l: Loop, k = 1) =>
        MathUtils.clamp((motorSpeed / l.refSpeed) * k, d.minRate, d.maxRate)
      on.forEach((l, i) => {
        set(l.gain.gain, level * onWeights[i] * onMix)
        set(l.rate, rate(l))
      })
      off.forEach((l, i) => {
        set(l.gain.gain, level * offWeights[i] * offMix)
        set(l.rate, rate(l))
      })
      set(bright.frequency, d.darkCutoff * (d.brightCutoff / d.darkCutoff) ** load)

      // Road and tyre noise: the wheels on the ground, quiet in the air.
      const roadFrac = MathUtils.clamp(wheel / d.highSpeed, 0, 1)
      set(rumble.gain.gain, mix.rumble * input.contact * Math.sqrt(roadFrac))
      set(rumble.rate, MathUtils.clamp(wheel / rumble.refSpeed, d.rumbleMinRate, d.rumbleMaxRate))

      set(surge.gain.gain, mix.surge * input.thrust)
      set(surge.rate, rate(surge, d.surgeRate))

      // Regen: braking, or lifting off at speed on the ground.
      const lifting = grounded && drive < 0.05 && wheel > d.regenMinSpeed
      const regenAmount = input.braking ? 1 : lifting ? d.regenLift : 0
      const regenFreq = d.regenOrder * Math.max(motorSpeed, 1)
      set(regen.gain, mix.regen * regenAmount * levelFrac)
      for (const o of regenOsc) set(o.frequency, regenFreq)
      set(regenFilter.frequency, regenFreq)

      set(whineOsc.frequency, d.gearOrder * Math.max(motorSpeed, 1))
      set(whine.gain, mix.gearWhine * levelFrac * (0.3 + 0.7 * Math.max(load, regenAmount)))
    },

    stop() {
      for (const s of sources) s.stop()
      out.disconnect()
    },
  }
}
