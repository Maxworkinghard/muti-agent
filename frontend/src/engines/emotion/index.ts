import type { EngineModule } from '../../types';
import { createLiveEngine } from '../live/engine';
import { EMOTION_DEFAULTS } from './config';
import { createEmotionKit } from './kit';

/**
 * 情感分析引擎：导演 + 演员底盘（../live）+ 情感玩法（kit.ts）。
 * 七种回应风格一起接住用户的事，按「回应情绪 → 分清事实与感受 → 下一步行动」往前走，
 * 步骤名和 data/modes.ts 的轮次名一致。说明见 README.md
 */
export const emotionEngine: EngineModule = {
  mode: 'emotion',
  name: '情感分析引擎 · 导演 + 演员',
  owner: '情感组',
  create: () => createLiveEngine(createEmotionKit()),
  defaults: EMOTION_DEFAULTS,
};
