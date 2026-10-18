import { Effect, EffectAttribute } from 'postprocessing'
import { Uniform } from 'three'

const SAMPLES = 8

const fragmentShader = /* glsl */ `
  uniform float strength;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 fromCentre = uv - 0.5;
    // The middle of the screen, where the car is, stays sharp.
    float s = strength * smoothstep(0.15, 0.7, length(fromCentre));
    if (s < 1e-4) {
      outputColor = inputColor;
      return;
    }
    vec4 sum = inputColor;
    for (int i = 1; i < ${SAMPLES}; i++) {
      float t = float(i) / float(${SAMPLES - 1});
      sum += texture2D(inputBuffer, uv - fromCentre * s * t * 0.08);
    }
    outputColor = sum / float(${SAMPLES});
  }
`

// A light motion blur for speed: streaks the edges of the screen away from the centre.
// Cheaper than a per-pixel velocity buffer, and the car in the middle stays crisp.
export class SpeedBlurEffect extends Effect {
  constructor() {
    super('SpeedBlurEffect', fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([['strength', new Uniform(0)]]),
    })
  }

  // 0 is off; 1 smears the screen corners by about 4% of its size.
  get strength(): number {
    return this.uniforms.get('strength')!.value
  }

  set strength(value: number) {
    this.uniforms.get('strength')!.value = value
  }
}
