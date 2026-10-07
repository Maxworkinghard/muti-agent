import { DirectionalLight, HemisphereLight, Scene, WebGLRenderer } from 'three';
import { STAGE_QUALITY } from '../rendering/stageQuality';

/** 光照参数：见 STAGE_TUNING，各场景可在 stageTuningFor 里覆盖 */
export interface StageLightingTuning { hemi: number; groundColor: number; key: number; fill: number }

/**
 * 房间光照：半球光给足天空 irradiance，再加一点方向光做明暗，让烘焙配色的房间读起来是三维的。
 * Tuned by measuring the lit render against an unlit pass of the same texture
 * (see frontend/public/models/README.md). A hemisphere light near full sky
 * irradiance plus a light key reproduces the baked colours with only a little
 * directional falloff to keep the room readable as 3D.
 */
export function setupStageLighting(world: Scene, renderer: WebGLRenderer, tuning: StageLightingTuning) {
  world.add(new HemisphereLight(0xffffff, tuning.groundColor, tuning.hemi));
  const sun = new DirectionalLight(0xfff3e2, tuning.key);
  sun.position.set(-2, 4, 3);
  if (renderer.shadowMap.enabled) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(STAGE_QUALITY['medium'].shadow || 2048, STAGE_QUALITY['medium'].shadow || 2048);
    Object.assign(sun.shadow.camera, { left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: 1, far: 8 });
    sun.shadow.bias = -0.00006;
    sun.shadow.normalBias = 0.002;
  }
  world.add(sun);
  const bounce = new DirectionalLight(0xdfe7ff, tuning.fill);
  bounce.position.set(3, 2, -3);
  world.add(bounce);
  return { sun, bounce };
}
