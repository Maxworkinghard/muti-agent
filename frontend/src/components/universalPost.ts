import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { LUTPass } from 'three/examples/jsm/postprocessing/LUTPass.js';

/**
 * 统一的高质量后处理系统 - 适用于所有3D舞台
 * 支持质量档位：ultra（超高）、high（高）、medium（中）、low（低）
 */

export type QualityLevel = 'ultra' | 'high' | 'medium' | 'low';

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  ultra: '超高（4K）',
  high: '高（2K）',
  medium: '中（1080p）',
  low: '低（720p）',
};

export interface QualitySettings {
  pixelRatio: number;
  shadowMapSize: number;
  anisotropy: number;
  enableGTAO: boolean;
  enableBloom: boolean;
  enableDOF: boolean;
  enableVolumetric: boolean;
  gtaoSamples: number;
  bloomStrength: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  ultra: {
    pixelRatio: 3,
    shadowMapSize: 8192,
    anisotropy: 16,
    enableGTAO: true,
    enableBloom: true,
    enableDOF: true,
    enableVolumetric: true,
    gtaoSamples: 16,
    bloomStrength: 0.065,
  },
  high: {
    pixelRatio: 2.5,
    shadowMapSize: 4096,
    anisotropy: 16,
    enableGTAO: true,
    enableBloom: true,
    enableDOF: true,
    enableVolumetric: false,
    gtaoSamples: 12,
    bloomStrength: 0.055,
  },
  medium: {
    pixelRatio: 2,
    shadowMapSize: 2048,
    anisotropy: 8,
    enableGTAO: false,
    enableBloom: true,
    enableDOF: false,
    enableVolumetric: false,
    gtaoSamples: 8,
    bloomStrength: 0.045,
  },
  low: {
    pixelRatio: 1,
    shadowMapSize: 1024,
    anisotropy: 4,
    enableGTAO: false,
    enableBloom: false,
    enableDOF: false,
    enableVolumetric: false,
    gtaoSamples: 4,
    bloomStrength: 0,
  },
};

/** 场景只画一遍，后处理共享深度纹理 */
class ScenePass extends Pass {
  target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(1, 1),
  });

  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {
    super();
    this.needsSwap = false;
    this.target.texture.name = 'universal.scene';
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  setSize(w: number, h: number) {
    this.target.setSize(w, h);
  }

  dispose() {
    this.target.depthTexture?.dispose();
    this.target.dispose();
  }
}

/** 清理无效像素值，防止后处理扩散 */
const SANITIZE_SHADER = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = min(c, vec4(64.0));
    }
  `,
};

/**
 * 调色LUT：明快暖调，提升中间调饱和度
 * 适合室内场景，保持天空的冷色调
 */
export function createWarmLUT(size = 32) {
  const data = new Uint8Array(size * size * size * 4);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        let R = r / (size - 1);
        let G = g / (size - 1);
        let B = b / (size - 1);

        const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        const blue = clamp((B - Math.max(R, G)) * 3);
        const warm = 1 - 0.7 * blue;

        // 中间调暖化
        const bell = l * (1 - l) * 4;
        R += 0.02 * bell * warm;
        G += 0.008 * bell * warm;
        B += (-0.016 * bell - 0.008 * l) * warm;

        // S曲线对比度
        const curve = (x: number) => clamp(x + 0.03 * (x - 0.42) * (1 - Math.abs(2 * x - 1)));
        R = curve(R);
        G = curve(G);
        B = curve(B);

        // 饱和度提升
        const m = (R + G + B) / 3;
        R = clamp(m + (R - m) * 1.1);
        G = clamp(m + (G - m) * 1.1);
        B = clamp(m + (B - m) * 1.1);

        data.set([R * 255, G * 255, B * 255, 255].map(Math.round), ((b * size + g) * size + r) * 4);
      }
    }
  }

  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  return texture;
}

export interface UniversalPostProcessor {
  composer: EffectComposer;
  outline: OutlinePass;
  quality: QualityLevel;
  setQuality(level: QualityLevel): void;
  setSize(width: number, height: number): void;
  setFocus(distance: number | null): void;
  render(): void;
  dispose(): void;
}

export function createUniversalPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  initialQuality: QualityLevel = 'high'
): UniversalPostProcessor {
  const composer = new EffectComposer(renderer);
  const scenePass = new ScenePass(scene, camera);
  const depth = scenePass.target.depthTexture!;

  // GTAO环境光遮蔽
  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.setGBuffer(depth, undefined);
  gtao.updateGtaoMaterial({
    radius: 0.35,
    distanceExponent: 1.2,
    thickness: 1.2,
    scale: 0.45,
    samples: QUALITY_PRESETS.high.gtaoSamples,
  });
  gtao.updatePdMaterial({
    lumaPhi: 10,
    depthPhi: 2,
    normalPhi: 3,
    radius: 6,
    rings: 2,
    samples: 16,
  });

  // 遮蔽算半分辨率：性能优化
  const gtaoOriginalSetSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => gtaoOriginalSetSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));

  // 景深
  const bokeh = new BokehPass(scene, camera, {
    focus: 12,
    aperture: 0.00006,
    maxblur: 0.0045,
  });
  bokeh.materialBokeh.defines.DEPTH_PACKING = 0;
  bokeh.materialBokeh.needsUpdate = true;
  (bokeh.uniforms as Record<string, THREE.IUniform>).tDepth.value = depth;

  // 重写bokeh.render以使用共享深度
  bokeh.render = (r, writeBuffer, readBuffer) => {
    const u = bokeh.uniforms as Record<string, THREE.IUniform>;
    u.tColor.value = readBuffer.texture;
    u.nearClip.value = camera.near;
    u.farClip.value = camera.far;
    r.setRenderTarget(bokeh.renderToScreen ? null : writeBuffer);
    if (!bokeh.renderToScreen) r.clear();
    (bokeh as unknown as { _fsQuad: { render(r: THREE.WebGLRenderer): void } })._fsQuad.render(r);
  };

  // 泛光
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.055, 0.35, 1.3);

  // 轮廓高亮
  const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
  outline.edgeStrength = 4;
  outline.edgeGlow = 0.6;
  outline.edgeThickness = 1;

  // 色调映射输出
  const output = new OutputPass();

  // 调色LUT
  const lut = new LUTPass({ lut: createWarmLUT(), intensity: 1 });

  // SMAA抗锯齿
  const smaa = new SMAAPass();

  // 清理无效值
  const sanitize = new ShaderPass(SANITIZE_SHADER, 'tNone');
  sanitize.uniforms.tDiffuse.value = scenePass.target.texture;

  // 组装后处理管线
  for (const pass of [scenePass, sanitize, gtao, bokeh, bloom, outline, output, lut, smaa]) {
    composer.addPass(pass);
  }

  let focusDistance: number | null = null;
  let currentQuality = initialQuality;

  const processor: UniversalPostProcessor = {
    composer,
    outline,
    quality: currentQuality,

    setQuality(level: QualityLevel) {
      currentQuality = level;
      processor.quality = level;
      const settings = QUALITY_PRESETS[level];

      gtao.enabled = settings.enableGTAO;
      bokeh.enabled = settings.enableDOF && focusDistance !== null;
      bloom.enabled = settings.enableBloom;

      if (settings.enableBloom) {
        bloom.strength = settings.bloomStrength;
      }

      if (settings.enableGTAO) {
        gtao.updateGtaoMaterial({ samples: settings.gtaoSamples });
      }

      renderer.shadowMap.enabled = level !== 'low';
    },

    setSize(width: number, height: number) {
      composer.setSize(width, height);
    },

    setFocus(distance: number | null) {
      focusDistance = distance;
      const settings = QUALITY_PRESETS[currentQuality];
      bokeh.enabled = settings.enableDOF && distance !== null;
      if (distance !== null) {
        (bokeh.uniforms as Record<string, THREE.IUniform>).focus.value = distance;
      }
    },

    render() {
      outline.enabled = outline.selectedObjects.length > 0;
      composer.render();
    },

    dispose() {
      composer.dispose();
      scenePass.dispose();
      sanitize.dispose();
      lut.material.dispose();
      (lut.material.uniforms.lut.value as THREE.Texture | null)?.dispose();
      gtao.dispose();
      bokeh.dispose();
      bloom.dispose();
      outline.dispose();
      output.dispose();
      smaa.dispose();
    },
  };

  processor.setQuality(initialQuality);
  return processor;
}

/** 保存和读取用户质量偏好 */
const QUALITY_STORAGE_KEY = 'stage3d_quality_v2';

export function loadSavedQuality(): QualityLevel | null {
  try {
    const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (saved && ['ultra', 'high', 'medium', 'low'].includes(saved)) {
      return saved as QualityLevel;
    }
  } catch {
    // 无localStorage权限
  }
  return null;
}

export function saveQuality(level: QualityLevel) {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, level);
  } catch {
    // 无localStorage权限
  }
}

/** 根据性能自动选择质量 */
export function autoSelectQuality(fps: number, currentLevel: QualityLevel): QualityLevel | null {
  // 超高 ↔ 高
  if (currentLevel === 'ultra' && fps < 50) return 'high';
  if (currentLevel === 'high' && fps > 58) return 'ultra';

  // 高 ↔ 中
  if (currentLevel === 'high' && fps < 45) return 'medium';
  if (currentLevel === 'medium' && fps > 58) return 'high';

  // 中 ↔ 低
  if (currentLevel === 'medium' && fps < 35) return 'low';
  if (currentLevel === 'low' && fps > 58) return 'medium';

  return null; // 不需要调整
}
