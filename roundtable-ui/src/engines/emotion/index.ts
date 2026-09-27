import type { EngineModule } from '../../types';
import { createMockEngine } from '../mock';
import { EMOTION_DEFAULTS } from './config';

/**
 * 情感分析引擎：预留位置，由情感组导入。
 * 接入时把 create 换成真实实现（遵守 src/types.ts 的 DiscussionEngine 接口），
 * 轮次名要和 data/modes.ts 一致：回应情绪 / 分清事实与感受 / 下一步行动。
 */
export const emotionEngine: EngineModule = {
  mode: 'emotion',
  name: '情感分析引擎（mock，待导入）',
  owner: '情感组',
  create: createMockEngine,
  defaults: EMOTION_DEFAULTS,
};
