import { Environment } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef, type RefObject } from 'react'
import { Matrix4, Vector3, type DirectionalLight, type Object3D } from 'three'
import { ENVIRONMENT_URL } from '../config/assets'
import type { LevelArt } from './artData'
import { NightEnvironment } from './art/NightSky'

// The key light's position relative to the car; the light (and its shadow box) follows the car.
// By day it's the sun, in the same direction as the sky HDRI's sun. At night (a level with art)
// it's the moon, in the direction of the moon drawn in the night sky.
const SUN_OFFSET = new Vector3(10, 15, 8)
const SUN_INTENSITY = 2.2
const SUN_COLOR = '#ffffff'
const MOON_DISTANCE = 22 // m from the car, inside the shadow camera's near/far
const MOON_INTENSITY = 0.45
const MOON_COLOR = '#c3cdeb'
// The sky HDRI lights everything a little and gives the car its reflections.
const ENVIRONMENT_INTENSITY = 0.6

// The key light is the only shadow-casting light. Its shadow box is a square this many metres
// either side of the car, from `near` to `far` along the light, with biases against shadow acne.
const SHADOW_EXTENT = 15
const SHADOW_MAP_SIZE = 2048
const SHADOW_NEAR = 1
const SHADOW_FAR = 50
const SHADOW_BIAS = -0.0004
const SHADOW_NORMAL_BIAS = 0.03

const TEXEL = (2 * SHADOW_EXTENT) / SHADOW_MAP_SIZE
const snapped = new Vector3()

type LightsProps = {
  target: RefObject<Object3D | null>
  art?: LevelArt
}

export default function Lights({ target, art }: LightsProps) {
  const key = useRef<DirectionalLight>(null)
  const { offset, toLight, fromLight } = useMemo(() => {
    const offset = art
      ? new Vector3(...art.moon).normalize().multiplyScalar(MOON_DISTANCE)
      : SUN_OFFSET.clone()
    // The shadow camera's axes (it looks from the offset at the car, +Y up). Moving the light in
    // whole shadow-map texels along them keeps shadow edges from shimmering as the car moves.
    const toLight = new Matrix4().lookAt(offset, new Vector3(), new Vector3(0, 1, 0))
    const fromLight = toLight.clone().transpose() // rotation only, so the inverse is the transpose
    return { offset, toLight, fromLight }
  }, [art])

  useFrame(() => {
    const light = key.current
    const car = target.current
    if (!light || !car) return
    car.getWorldPosition(snapped).applyMatrix4(fromLight)
    snapped.x = Math.round(snapped.x / TEXEL) * TEXEL
    snapped.y = Math.round(snapped.y / TEXEL) * TEXEL
    light.target.position.copy(snapped.applyMatrix4(toLight))
    light.position.copy(light.target.position).add(offset)
    // The target isn't in the scene graph, so its matrix isn't updated automatically.
    light.target.updateMatrixWorld()
  })

  return (
    <>
      <directionalLight
        ref={key}
        position={offset}
        color={art ? MOON_COLOR : SUN_COLOR}
        intensity={art ? MOON_INTENSITY : SUN_INTENSITY}
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={SHADOW_NEAR}
        shadow-camera-far={SHADOW_FAR}
        shadow-bias={SHADOW_BIAS}
        shadow-normalBias={SHADOW_NORMAL_BIAS}
      />
      {/* Loads on its own, so the game never waits for the sky. */}
      <Suspense fallback={null}>
        {art ? (
          <NightEnvironment key="night" art={art} />
        ) : (
          <Environment
            key="day"
            files={ENVIRONMENT_URL}
            environmentIntensity={ENVIRONMENT_INTENSITY}
          />
        )}
      </Suspense>
    </>
  )
}
