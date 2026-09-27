import type { EngineModule } from '../../types';
import { createMockEngine } from '../mock';
import { ENTERTAINMENT_DEFAULTS } from './config';

/** 娱乐引擎：由娱乐组负责。接入时把 create 换成真实实现，保持 DiscussionEngine 接口不变 */
export const entertainmentEngine: EngineModule = {
  mode: 'entertainment',
  name: '娱乐引擎（mock）',
  owner: '娱乐组',
  create: createMockEngine,
  defaults: ENTERTAINMENT_DEFAULTS,
};
