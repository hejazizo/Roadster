import { useMemo } from 'react'
import { Object3D, SpotLight } from 'three'

// Head lights for night levels: one spot light (no shadow) from the nose, aimed a little down
// the road ahead. Visual only. Local axes as in docs/car-model-spec.md (nose towards +Z).
const POSITION: [number, number, number] = [0, 0.62, 2.05]
const AIM: [number, number, number] = [0, -0.4, 24]
const COLOR = '#f4f1ff'
const INTENSITY = 1800 // cd
const RANGE = 90 // m
const ANGLE = 0.5 // rad, half the beam's width
const PENUMBRA = 0.65

export default function Headlights() {
  const light = useMemo(() => {
    const spot = new SpotLight(COLOR, INTENSITY, RANGE, ANGLE, PENUMBRA, 2)
    spot.position.set(...POSITION)
    spot.target = new Object3D()
    spot.target.position.set(...AIM)
    return spot
  }, [])
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  )
}
