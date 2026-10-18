import {
  DataTexture,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  Vector2,
  Vector4,
  type MeshStandardMaterialParameters,
} from 'three'
import type { Floodlight } from '../artData'

// The ground's night shading, added to a MeshStandardMaterial so it keeps the moon's shadow and
// the real spot lights: large-scale wear in world space, and the light pools of the floodlights
// that aren't real lights, added as emission (albedo × the pool's light).
const MAX_POOLS = 16
const POOL_RADIUS = 0.36 // × the throw from the mast to the aim point: the pool's half-width
const POOL_STRETCH = 1.7 // the pool's length along the throw over its width
const POOL_STRENGTH = 3.2 // light at the pool's centre, as a multiple of the albedo
const POOL_COLOR = '1.0, 0.96, 0.9' // slightly warm white

const shaderHead = /* glsl */ `
  uniform vec4 uPools[${MAX_POOLS}]; // xz centre, half-width, strength
  uniform vec2 uPoolDirs[${MAX_POOLS}]; // throw direction
  uniform float uWear; // how much the large-scale wear darkens and lightens
  varying vec3 vGroundWorld;
  float groundHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float groundNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(groundHash(i), groundHash(i + vec2(1.0, 0.0)), u.x),
      mix(groundHash(i + vec2(0.0, 1.0)), groundHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float groundFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * groundNoise(p);
      p = p * 2.03 + 17.0;
      a *= 0.5;
    }
    return v;
  }
  float poolLight(vec2 p) {
    float sum = 0.0;
    for (int i = 0; i < ${MAX_POOLS}; i++) {
      vec4 pool = uPools[i];
      if (pool.w <= 0.0) continue;
      vec2 d = p - pool.xy;
      vec2 dir = uPoolDirs[i];
      float along = dot(d, dir) / ${POOL_STRETCH.toFixed(2)};
      float across = dot(d, vec2(-dir.y, dir.x));
      sum += pool.w * exp(-1.4 * (along * along + across * across) / (pool.z * pool.z));
    }
    return sum;
  }
`

export type GroundUniforms = {
  uPools: { value: Vector4[] }
  uPoolDirs: { value: Vector2[] }
  uWear: { value: number }
}

// Pool uniforms for the floodlights that aren't real lights. `strength` scales the pools' light,
// so bright paint can take less of it and stay below the bloom threshold.
export function poolUniforms(
  floodlights: Floodlight[],
  wear: number,
  strength = 1,
): GroundUniforms {
  // Unused slots have no strength (and a non-zero radius, so nothing divides by zero).
  const pools = Array.from({ length: MAX_POOLS }, () => new Vector4(0, 0, 1, 0))
  const dirs = Array.from({ length: MAX_POOLS }, () => new Vector2(1, 0))
  floodlights
    .filter((light) => !light.spot)
    .slice(0, MAX_POOLS)
    .forEach(({ mast: [mx, mz], aim: [ax, , az] }, i) => {
      const throwDir = new Vector2(ax - mx, az - mz)
      const distance = throwDir.length()
      pools[i].set(ax, az, distance * POOL_RADIUS, POOL_STRENGTH * strength)
      dirs[i].copy(throwDir.normalize())
    })
  return { uPools: { value: pools }, uPoolDirs: { value: dirs }, uWear: { value: wear } }
}

// A MeshStandardMaterial with the night ground shading. Every such material compiles to the
// same program; only the uniforms differ.
export function nightGroundMaterial(
  parameters: MeshStandardMaterialParameters,
  uniforms: GroundUniforms,
) {
  const material = new MeshStandardMaterial(parameters)
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${shaderHead}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec2 groundXZ = vGroundWorld.xz;
        float wear = groundFbm(groundXZ * 0.045) * 0.7 + groundFbm(groundXZ * 0.31) * 0.3;
        diffuseColor.rgb *= 1.0 + uWear * (wear - 0.5) * 1.6;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3(${POOL_COLOR}) * poolLight(groundXZ);`,
      )
  }
  material.customProgramCacheKey = () => 'night-ground'
  return material
}

// Fine asphalt grain, tiled: a grey noise multiplied into the albedo (linear values).
export function grainTexture(size = 256) {
  const data = new Uint8Array(size * size * 4)
  let seed = 7
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < size * size; i++) {
    // Mostly mid grey with a few light stones and dark pits.
    const r = random()
    const v = r > 0.97 ? 255 : r < 0.04 ? 120 : 175 + random() * 60
    data.set([v, v, v, 255], i * 4)
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}
