import type { EngineModule } from '../../types';
import { createMockEngine } from '../mock';
import { EMOTION_DEFAULTS } from './config';

/** 情感交流引擎：几种回应风格轮流接住用户的事。情感组的实现导入后合并到这个文件夹，接入时把 create 换成真实实现，保持 DiscussionEngine 接口不变 */
export const emotionEngine: EngineModule = {
  mode: 'emotion',
  name: '情感交流引擎（mock）',
  owner: '情感组',
  create: createMockEngine,
  defaults: EMOTION_DEFAULTS,
};
