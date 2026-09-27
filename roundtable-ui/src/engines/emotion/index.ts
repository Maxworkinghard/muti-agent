import type { EngineModule } from '../../types';
import { createBackendEngine } from '../backend';
import { EMOTION_DEFAULTS } from './config';

/**
 * 情感分析引擎（PR6）：7 种回应风格轮流接住用户的事，由后端跑（server/session.ts 的 runTalk），
 * 三轮依次是 回应情绪 / 分清事实与感受 / 下一步行动，和 data/modes.ts 的轮次名一致。
 */
export const emotionEngine: EngineModule = {
  mode: 'emotion',
  name: '情感分析引擎',
  owner: '情感组',
  create: createBackendEngine,
  defaults: EMOTION_DEFAULTS,
};
