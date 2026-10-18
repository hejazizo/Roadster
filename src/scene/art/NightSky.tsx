import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BackSide,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import type { LevelArt } from '../artData'

// The night sky, drawn by a shader on a dome around the camera: a dark gradient with a warm glow
// over the nearest town, a faint Milky Way, stars that stay sharp at any resolution, and the
// moon where the moon light comes from. The same dome, with a lamp panel per floodlight tower,
// is rendered once into the environment map, so reflections match the sky.
const DOME_RADIUS = 900 // m, inside the camera's far plane
const ENVIRONMENT_INTENSITY = 1
const LAMP_PANEL_INTENSITY = 14
const LAMP_PANEL_SIZE: [number, number] = [6, 3] // m

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uMoon;
  uniform vec3 uTown;
  uniform vec3 uGround;
  uniform float uTime;
  uniform float uStars;
  varying vec3 vDirection;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x),
          mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
      mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x),
          mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y),
      u.z);
  }

  // One layer of stars: a random point in some cells of a grid wrapped round the sky.
  float stars(vec3 d, float scale, float density, float seed) {
    vec3 p = d * scale + seed;
    vec3 cell = floor(p);
    float h = hash13(cell);
    if (h > density) return 0.0;
    vec3 offset = hash33(cell) * 0.7 + 0.15;
    float dist = length(fract(p) - offset);
    // About 1.5 px across wherever it's drawn, so stars never shimmer or vanish.
    float px = length(fwidth(p)) * 0.9;
    float b = pow(clamp(hash13(cell + 7.0), 0.0, 1.0), 6.0) * 2.0 + 0.05;
    float twinkle = 0.8 + 0.2 * sin(uTime * (2.0 + h * 40.0) + h * 600.0);
    return b * twinkle * (1.0 - smoothstep(0.0, px + 0.03, dist));
  }

  void main() {
    vec3 d = normalize(vDirection);
    float h = d.y;
    // Clamped: pow() of a negative number is NaN, and the bloom would spread it over the frame.
    float up = clamp(h, 0.0, 1.0);

    vec3 zenith = vec3(0.0012, 0.0019, 0.0046);
    vec3 horizon = vec3(0.0085, 0.0105, 0.017);
    vec3 col = mix(zenith, horizon, pow(1.0 - up, 5.0));
    // Haze along the horizon, warm over the town.
    vec3 heading = normalize(vec3(d.x, 0.0, d.z) + 1e-5);
    float town = pow(max(dot(heading, uTown), 0.0), 4.0);
    col += vec3(0.032, 0.017, 0.007) * town * exp(-up * 16.0);
    col += vec3(0.006, 0.0055, 0.005) * exp(-up * 30.0);

    // Milky Way: a faint, patchy band across the sky.
    float band = dot(d, normalize(vec3(0.5, 0.35, 0.8)));
    float mw = exp(-band * band * 18.0) * (0.35 + 0.65 * noise3(d * 7.0)) * noise3(d * 2.5 + 3.0);
    col += vec3(0.0045, 0.005, 0.0075) * mw;

    // Moon: a disc with faint markings and a halo.
    float m = length(d - uMoon); // ≈ the angle from the moon, in radians
    col += vec3(0.010, 0.013, 0.018) * exp(-m * 9.0) + vec3(0.05, 0.055, 0.06) * exp(-m * 60.0);
    float moonWidth = fwidth(m) + 1e-4;
    float disc = 1.0 - smoothstep(0.0095 - moonWidth, 0.0095 + moonWidth, m);
    float maria = 0.82 + 0.18 * noise3(d * 900.0);
    col = mix(col, vec3(4.4, 4.5, 4.7) * maria, disc);

    // Stars fade near the horizon, round the moon and in the town's glow.
    float starFade = smoothstep(0.02, 0.3, h) * smoothstep(0.05, 0.25, m) * (1.0 - 0.7 * town);
    float s = stars(d, 260.0, 0.02 + 0.05 * mw, 0.0) + 0.45 * stars(d, 520.0, 0.025 + 0.04 * mw, 41.0);
    col += vec3(0.85, 0.9, 1.0) * s * starFade * uStars;

    // Below the horizon: dark ground, which the level's own far ground mostly covers.
    col = mix(col, uGround, 1.0 - smoothstep(-0.03, 0.0, h));
    gl_FragColor = vec4(col, 1.0);
  }
`

function skyMaterial(art: LevelArt, forEnvironment: boolean) {
  const [tx, tz] = art.townGlow
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uMoon: { value: new Vector3(...art.moon).normalize() },
      uTown: { value: new Vector3(tx, 0, tz).normalize() },
      // The environment sees the floodlit pad below the horizon, a little brighter.
      uGround: {
        value: forEnvironment ? new Vector3(0.03, 0.03, 0.03) : new Vector3(0.004, 0.005, 0.006),
      },
      uTime: { value: 0 },
      // Sub-pixel stars only add noise to the environment map.
      uStars: { value: forEnvironment ? 0 : 1 },
    },
    side: BackSide,
    depthWrite: false,
    fog: false,
  })
}

// The visible sky: follows the camera, drawn behind everything.
export function SkyDome({ art }: { art: LevelArt }) {
  const dome = useRef<Mesh>(null)
  const material = useMemo(() => skyMaterial(art, false), [art])
  useFrame(({ camera, clock }) => {
    const mesh = dome.current
    if (!mesh) return
    mesh.position.copy(camera.position)
    ;(mesh.material as ShaderMaterial).uniforms.uTime.value = clock.elapsedTime
  })
  return (
    <mesh ref={dome} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[DOME_RADIUS, 48, 24]} />
    </mesh>
  )
}

// The environment map: the sky, plus a bright panel where each floodlight tower's lamps are, so
// the car's paint and the half-loop's metal reflect them. Rendered once, straight into a PMREM.
export function NightEnvironment({ art }: { art: LevelArt }) {
  const get = useThree((s) => s.get)
  useEffect(() => {
    const { gl, scene } = get()
    const envScene = new Scene()
    const sky = new Mesh(new SphereGeometry(DOME_RADIUS, 48, 24), skyMaterial(art, true))
    envScene.add(sky)
    const panelGeometry = new PlaneGeometry(...LAMP_PANEL_SIZE)
    const panelMaterial = new MeshBasicMaterial({
      color: new Color(1, 0.96, 0.9).multiplyScalar(LAMP_PANEL_INTENSITY),
      side: DoubleSide,
    })
    for (const { mast, height } of art.floodlights) {
      const panel = new Mesh(panelGeometry, panelMaterial)
      panel.position.set(mast[0], height, mast[1])
      panel.lookAt(0, 0, 0)
      envScene.add(panel)
    }
    const pmrem = new PMREMGenerator(gl)
    const target = pmrem.fromScene(envScene, 0, 0.1, DOME_RADIUS + 50)
    pmrem.dispose()
    const previous = { map: scene.environment, intensity: scene.environmentIntensity }
    scene.environment = target.texture
    scene.environmentIntensity = ENVIRONMENT_INTENSITY
    return () => {
      scene.environment = previous.map
      scene.environmentIntensity = previous.intensity
      target.dispose()
      sky.geometry.dispose()
      ;(sky.material as ShaderMaterial).dispose()
      panelGeometry.dispose()
      panelMaterial.dispose()
    }
  }, [get, art])
  return null
}
