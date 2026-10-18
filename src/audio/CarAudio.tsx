import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { useEffect, useRef, type RefObject } from 'react'
import { MathUtils } from 'three'
import type { AbilityState } from '../car/abilities'
import type { CarTelemetry } from '../car/telemetry'
import { TUNING } from '../config/tuning'
import { useAudioStore } from '../state/audioStore'
import { getAudio, type AudioGraph } from './audio'
import { gainInto, noiseSource } from './synth'
import { sfx } from './sounds'

// Time constant (s) for the loops following the car, smoothing frame-to-frame steps.
const FOLLOW = 0.05
// The inverter whine sits this many times above the motor's fundamental.
const WHINE_RATIO = 8
const DETUNE_RATIO = 1.006

type Voices = {
  motorPitch: AudioParam[] // [saw, detuned saw]
  motorFilter: BiquadFilterNode
  motor: GainNode
  whinePitch: AudioParam
  whine: GainNode
  thrusterFilter: BiquadFilterNode
  thruster: GainNode
  windFilter: BiquadFilterNode
  wind: GainNode
  skid: GainNode
  stop: () => void
}

// The car's continuous sounds, all on the car bus (which fades out while paused):
// motor and inverter whine following the speed, thruster roar following the flames, wind
// growing with speed, and tyre squeal from sliding wheels.
function createVoices(a: AudioGraph): Voices {
  const { ctx, car } = a
  const sources: AudioScheduledSourceNode[] = []
  const osc = (type: OscillatorType, out: AudioNode) => {
    const o = ctx.createOscillator()
    o.type = type
    o.connect(out)
    sources.push(o)
    return o
  }
  const filter = (type: BiquadFilterType, freq: number, Q: number, out: AudioNode) => {
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = Q
    f.connect(out)
    return f
  }
  const noiseInto = (out: AudioNode) => {
    const src = noiseSource(a)
    src.connect(out)
    sources.push(src)
  }

  const motor = gainInto(a, car, 0)
  const motorFilter = filter('lowpass', 400, 2, motor)
  const saw = osc('sawtooth', motorFilter)
  const detuned = osc('sawtooth', motorFilter)

  const whine = gainInto(a, car, 0)
  const whineOsc = osc('sine', whine)

  // Thruster: band-passed roar plus a low rumble.
  const thruster = gainInto(a, car, 0)
  const thrusterFilter = filter('bandpass', 600, 0.8, thruster)
  noiseInto(thrusterFilter)
  noiseInto(filter('lowpass', 160, 1, thruster))

  const wind = gainInto(a, car, 0)
  const windFilter = filter('bandpass', 800, 0.6, wind)
  noiseInto(windFilter)

  // Tyre squeal: two narrow bands of noise.
  const skid = gainInto(a, car, 0)
  noiseInto(filter('bandpass', 1100, 12, skid))
  noiseInto(filter('bandpass', 2300, 14, skid))

  for (const s of sources) {
    if (s instanceof AudioBufferSourceNode) s.start(0, Math.random() * (a.noise.duration - 0.1))
    else s.start()
  }
  return {
    motorPitch: [saw.frequency, detuned.frequency],
    motorFilter,
    motor,
    whinePitch: whineOsc.frequency,
    whine,
    thrusterFilter,
    thruster,
    windFilter,
    wind,
    skid,
    stop: () => {
      for (const s of sources) s.stop()
      for (const g of [motor, whine, thruster, wind, skid]) g.disconnect()
    },
  }
}

type CarAudioProps = {
  body: RefObject<RapierRigidBody | null>
  telemetry: RefObject<CarTelemetry>
  thrust: RefObject<number> // 0–1, the smoothed flame size
  abilities: RefObject<AbilityState>
}

export default function CarAudio({ body, telemetry, thrust, abilities }: CarAudioProps) {
  const started = useAudioStore((s) => s.started)
  const voices = useRef<Voices | null>(null)
  // Last-seen state, to play one-shots on changes.
  const seen = useRef({
    boosting: false,
    hops: abilities.current.hops,
    landings: telemetry.current.landings,
    respawns: telemetry.current.respawns,
  })

  useEffect(() => {
    const a = getAudio()
    if (!started || !a) return
    const v = createVoices(a)
    voices.current = v
    return () => {
      voices.current = null
      v.stop()
    }
  }, [started])

  useFrame(() => {
    const t = telemetry.current
    const { boosting, hops } = abilities.current
    const s = seen.current
    if (boosting && !s.boosting) sfx.boostBurst()
    if (hops !== s.hops) sfx.hop()
    if (t.landings !== s.landings) sfx.landing(t.landingImpact)
    if (t.respawns !== s.respawns) sfx.respawn()
    s.boosting = boosting
    s.hops = hops
    s.landings = t.landings
    s.respawns = t.respawns

    const v = voices.current
    const a = getAudio()
    if (!v || !a) return
    const now = a.ctx.currentTime
    const set = (param: AudioParam, value: number) => param.setTargetAtTime(value, now, FOLLOW)
    const { mix, motor, wind, skid } = TUNING.audio

    // Motor: pitch with speed, louder and brighter under throttle.
    const speedFrac = MathUtils.clamp(Math.abs(t.speed) / motor.topSpeed, 0, 1)
    const pitch = MathUtils.lerp(motor.idlePitch, motor.topPitch, speedFrac)
    const load = Math.abs(t.throttle) * motor.load
    set(v.motorPitch[0], pitch)
    set(v.motorPitch[1], pitch * DETUNE_RATIO)
    set(v.motorFilter.frequency, pitch * (3 + 6 * load))
    const motorLevel = MathUtils.lerp(motor.idleLevel, 1, speedFrac) * (1 + load)
    set(v.motor.gain, (mix.motor * motorLevel) / (1 + motor.load))
    set(v.whinePitch, pitch * WHINE_RATIO)
    set(v.whine.gain, mix.whine * speedFrac * (0.5 + load))

    const power = thrust.current
    set(v.thruster.gain, mix.thruster * power)
    set(v.thrusterFilter.frequency, 300 + 900 * power)

    const vel = body.current?.linvel()
    const airSpeed = vel ? Math.hypot(vel.x, vel.y, vel.z) : 0
    const windFrac = MathUtils.clamp(airSpeed / wind.fullSpeed, 0, 1)
    set(v.wind.gain, mix.wind * windFrac * windFrac * (t.grounded ? 1 : wind.airborne))
    set(v.windFilter.frequency, 500 + 1500 * windFrac)

    let slide = 0
    for (const w of t.wheels) slide = Math.max(slide, w.skid)
    set(
      v.skid.gain,
      mix.skid * MathUtils.clamp(MathUtils.inverseLerp(skid.minSkid, 1, slide), 0, 1),
    )
  })

  return null
}
