import { NeutralToneMapping, OrthographicCamera, PerspectiveCamera, Vector2, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LUTPass } from 'three/addons/postprocessing/LUTPass.js';
import { BokehShader } from 'three/addons/shaders/BokehShader.js';
import { ScenePass, SANITIZE, warmLut } from './postCommon';
import { STAGE_QUALITY, type StageQuality } from './stageQuality';

export type StageCamera = PerspectiveCamera | OrthographicCamera;

export interface StagePost {
  composer: EffectComposer;
  quality: StageQuality;
  setQuality(q: StageQuality): void;
  setSize(w: number, h: number): void;
  setCamera(camera: StageCamera): void;
  setScale(scale: number): void;
  setFocus(distance: number | null): void;
  render(): void;
  describe(): { quality: StageQuality; gtao: boolean; bloom: boolean; dof: boolean; taa: boolean };
  dispose(): void;
}

export function createStagePost(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: StageCamera,
  quality: StageQuality
): StagePost {
  const composer = new EffectComposer(renderer);
  const render = new ScenePass(scene, camera);
  const depth = render.target.depthTexture!;

  // GTAO - 环境光遮蔽，增强立体感
  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.setGBuffer(depth, undefined);
  gtao.updateGtaoMaterial({
    radius: 0.35,
    distanceExponent: 1.2,
    thickness: 1.2,
    scale: 0.45,
    samples: 12
  });
  gtao.updatePdMaterial({
    lumaPhi: 10,
    depthPhi: 2,
    normalPhi: 3,
    radius: 6,
    rings: 2,
    samples: 16
  });
  // 半分辨率GTAO以提升性能
  const gtaoSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => gtaoSize(
    Math.max(1, Math.round(w / 2)),
    Math.max(1, Math.round(h / 2))
  );

  // Bloom - 增强光照氛围
  const bloom = new UnrealBloomPass(
    new Vector2(512, 512),
    0.055,  // strength
    0.35,   // radius
    1.3     // threshold
  );

  // DOF - 景深效果
  const bokehPass = new ShaderPass(BokehShader);
  bokehPass.uniforms['focus'].value = 12.0;
  bokehPass.uniforms['aperture'].value = 0.00006;
  bokehPass.uniforms['maxblur'].value = 0.004;
  bokehPass.uniforms['aspect'].value = 1.0;
  bokehPass.uniforms['nearClip'].value = camera instanceof PerspectiveCamera ? camera.near : 0.1;
  bokehPass.uniforms['farClip'].value = camera instanceof PerspectiveCamera ? camera.far : 100;
  // 使用共享深度纹理
  bokehPass.uniforms['tDepth'].value = depth;

  // TAA/SMAA - 抗锯齿
  const taaPass = new TAARenderPass(scene, camera);
  taaPass.sampleLevel = 2;
  const smaaPass = new SMAAPass();

  // LUT色调映射 - 暖色调
  const lut = new LUTPass({ lut: warmLut(), intensity: 1 });
  
  // Output pass
  const output = new OutputPass();

  // Sanitize pass - 清理无效值
  const sanitize = new ShaderPass(SANITIZE, 'tNone');
  sanitize.uniforms.tDiffuse.value = render.target.texture;

  // 添加所有pass
  for (const pass of [render, sanitize, gtao, bloom, bokehPass, output, lut]) {
    composer.addPass(pass);
  }
  // TAA和SMAA二选一，根据质量设置
  composer.addPass(taaPass);
  composer.addPass(smaaPass);

  let focus: number | null = null;

  // 设置渲染器色调映射
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.18;

  const post: StagePost = {
    composer,
    quality,
    setQuality(q) {
      post.quality = q;
      const config = STAGE_QUALITY[q];
      
      // GTAO: Ultra/High启用
      gtao.enabled = config.ao;
      
      // Bloom: Medium及以上启用
      bloom.enabled = config.bloom;
      
      // DOF: Ultra/High启用
      bokehPass.enabled = config.dof && focus !== null;
      
      // TAA for Ultra/High, SMAA for Medium/Low
      taaPass.enabled = q === 'ultra' || q === 'high';
      smaaPass.enabled = q === 'medium' || q === 'low';
      
      // 阴影
      renderer.shadowMap.enabled = config.shadow > 0;
    },
    setSize(w, h) {
      composer.setSize(w, h);
      bokehPass.uniforms['aspect'].value = w / h;
    },
    setCamera(cam: StageCamera) {
      // Update camera references for passes that need it
      render.camera = cam;
      gtao.camera = cam;
      taaPass.camera = cam;
      
      // Update camera-dependent uniforms
      bokehPass.uniforms['nearClip'].value = cam instanceof PerspectiveCamera ? cam.near : 0.1;
      bokehPass.uniforms['farClip'].value = cam instanceof PerspectiveCamera ? cam.far : 100;
    },
    setScale(scale: number) {
      // Scale affects GTAO radius - larger scenes need larger AO radius
      const baseRadius = 0.35;
      const scaledRadius = baseRadius * Math.min(2, Math.max(0.5, scale / 10));
      gtao.updateGtaoMaterial({
        radius: scaledRadius,
        distanceExponent: 1.2,
        thickness: 1.2,
        scale: 0.45,
        samples: 12
      });
    },
    setFocus(d) {
      focus = d;
      const config = STAGE_QUALITY[post.quality];
      bokehPass.enabled = config.dof && d !== null;
      if (d !== null) {
        bokehPass.uniforms['focus'].value = d;
      }
    },
    render() {
      composer.render();
    },
    describe() {
      const config = STAGE_QUALITY[post.quality];
      return {
        quality: post.quality,
        gtao: gtao.enabled,
        bloom: bloom.enabled,
        dof: bokehPass.enabled,
        taa: taaPass.enabled
      };
    },
    dispose() {
      composer.dispose();
      render.dispose();
      sanitize.dispose();
      gtao.dispose();
      bloom.dispose();
      output.dispose();
      lut.material.dispose();
      (lut.material.uniforms.lut.value as any)?.dispose();
      smaaPass.dispose();
    }
  };

  post.setQuality(quality);
  return post;
}
