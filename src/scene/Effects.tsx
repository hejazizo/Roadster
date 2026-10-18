import { useFrame } from '@react-three/fiber'
import {
  Bloom,
  EffectComposer,
  ToneMapping,
  Vignette,
  wrapEffect,
} from '@react-three/postprocessing'
import { ToneMappingMode, type BloomEffect, type VignetteEffect } from 'postprocessing'
import { useRef } from 'react'
import { MathUtils } from 'three'
import { TUNING } from '../config/tuning'
import { useCarStore } from '../state/carStore'
import { useRaceStore } from '../state/raceStore'
import { SpeedBlurEffect } from '../vfx/SpeedBlurEffect'

const VIGNETTE_OFFSET = 0.35
const BLUR_DAMPING = 4 // 1/s, how quickly the speed blur follows the speed
const BOOST_BLUR = 1.5 // blur multiplier while boosting

const SpeedBlur = wrapEffect(SpeedBlurEffect)

// Post-processing: bloom on HDR emissives (flames, lights, the next ring), a speed blur, a
// vignette, then tone mapping. The scene renders to a half-float target, so tone mapping
// has to happen here, at the end, rather than in the renderer.
export default function Effects() {
  const bloom = useRef<BloomEffect>(null)
  const vignette = useRef<VignetteEffect>(null)
  const speedBlur = useRef<SpeedBlurEffect>(null)

  // Read per frame so live tuning applies.
  useFrame((_, dt) => {
    const post = TUNING.vfx.post
    if (bloom.current) {
      bloom.current.intensity = post.bloomIntensity
      bloom.current.luminanceMaterial.threshold = post.bloomThreshold
    }
    if (vignette.current) vignette.current.darkness = post.vignette
    if (useRaceStore.getState().paused) return
    const { speed, boosting } = useCarStore.getState()
    const t = MathUtils.clamp(
      (speed - post.blurStartSpeed) / (post.blurFullSpeed - post.blurStartSpeed),
      0,
      1,
    )
    const target = t * post.blurStrength * (boosting ? BOOST_BLUR : 1)
    const blur = speedBlur.current
    if (blur) blur.strength = MathUtils.damp(blur.strength, target, BLUR_DAMPING, dt)
  })

  return (
    <EffectComposer multisampling={4}>
      <Bloom ref={bloom} mipmapBlur luminanceSmoothing={0.2} />
      <SpeedBlur ref={speedBlur} />
      <Vignette ref={vignette} offset={VIGNETTE_OFFSET} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  )
}
