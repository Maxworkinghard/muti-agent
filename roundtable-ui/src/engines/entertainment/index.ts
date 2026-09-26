import type { EngineModule } from '../../types';
import { createBackendEngine } from '../backend';
import { ENTERTAINMENT_DEFAULTS } from './config';

/** 娱乐引擎：由娱乐组负责。现在由后端跑（server/session.ts 的轮流发言流程），接入时把 create 换成自己的实现，保持 DiscussionEngine 接口不变 */
export const entertainmentEngine: EngineModule = {
  mode: 'entertainment',
  name: '娱乐引擎',
  owner: '娱乐组',
  create: createBackendEngine,
  defaults: ENTERTAINMENT_DEFAULTS,
};
