import { MeshStandardMaterial } from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';

/**
 * Optional saturation trim, around perceptual luma so hue and relative brightness
 * are preserved. Measured against the source art, the Meshy base colour texture is
 * already faithful, so the stage runs at 1.0 (no boost) and this is only a knob for
 * per-scene taste.
 */
export function boostSaturation(material: MeshStandardMaterial, amount: number) {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.saturationAmount = { value: amount };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float saturationAmount;')
      .replace(
        '#include <map_fragment>',
        ['#include <map_fragment>',
         'vec3 stageLuma = vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));',
         'diffuseColor.rgb = clamp(mix(stageLuma, diffuseColor.rgb, saturationAmount), 0.0, 1.0);'].join('\n'),
      );
  };
  material.needsUpdate = true;
}
