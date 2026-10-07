/**
 * 统一的舞台质量管理
 * 适用于所有3D舞台：SceneStage3D, PixelStage3D, McStage3D
 */

export type StageQuality = 'ultra' | 'high' | 'medium' | 'low';

export interface StageQualityConfig {
  label: string;
  pixelRatio: number;
  shadow: number;
  anisotropy: number;
  ao: boolean; // 环境光遮蔽
  bloom: boolean;
  dof: boolean; // 景深
  gtaoSamples: number;
}

export const STAGE_QUALITY: Record<StageQuality, StageQualityConfig> = {
  ultra: {
    label: '超高 (4K)',
    pixelRatio: 2,
    shadow: 4096,
    anisotropy: 16,
    ao: true,
    bloom: true,
    dof: true,
    gtaoSamples: 12,
  },
  high: {
    label: '高 (2K)',
    pixelRatio: 1.5,
    shadow: 2048,
    anisotropy: 16,
    ao: false,
    bloom: true,
    dof: true,
    gtaoSamples: 8,
  },
  medium: {
    label: '中 (1080p)',
    pixelRatio: 1.25,
    shadow: 2048,
    anisotropy: 8,
    ao: false,
    bloom: true,
    dof: false,
    gtaoSamples: 8,
  },
  low: {
    label: '低 (720p)',
    pixelRatio: 1,
    shadow: 1024,
    anisotropy: 4,
    ao: false,
    bloom: false,
    dof: false,
    gtaoSamples: 4,
  },
};

export const STAGE_QUALITY_KEY = 'stage3d-quality-v3';

export function savedStageQuality(storage: Pick<Storage, 'getItem'>): StageQuality {
  try {
    const saved = storage.getItem(STAGE_QUALITY_KEY);
    if (saved === 'ultra' || saved === 'high' || saved === 'medium' || saved === 'low') {
      return saved;
    }
  } catch {
    // localStorage不可用
  }
  // 默认中等质量（平衡性能和清晰度）
  return 'medium';
}

export function saveStageQuality(storage: Pick<Storage, 'setItem'>, quality: StageQuality) {
  try {
    storage.setItem(STAGE_QUALITY_KEY, quality);
  } catch {
    // localStorage不可用
  }
}

export function stageRenderSize(quality: StageQuality, width: number, height: number): [number, number] {
  const ratio = STAGE_QUALITY[quality].pixelRatio;
  const dpr = Math.min(window.devicePixelRatio || 1, ratio);
  return [Math.floor(width * dpr), Math.floor(height * dpr)];
}

/** 根据帧率自动调整质量 */
export function autoAdjustQuality(current: StageQuality, fps: number): StageQuality | null {
  if (current === 'ultra' && fps < 50) return 'high';
  if (current === 'high' && fps < 45) return 'medium';
  if (current === 'medium' && fps < 35) return 'low';

  if (current === 'low' && fps > 58) return 'medium';
  if (current === 'medium' && fps > 58) return 'high';
  if (current === 'high' && fps > 58) return 'ultra';

  return null;
}
