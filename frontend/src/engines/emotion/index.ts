import type { EngineModule } from '../../types';
import { createBackendEngine } from '../backend';
import { EMOTION_DEFAULTS } from './config';

/** 情感交流引擎：几种回应风格轮流接住用户的事。现在由后端跑（server/session.ts 的轮流发言流程），接入时把 create 换成自己的实现，保持 DiscussionEngine 接口不变 */
export const emotionEngine: EngineModule = {
  mode: 'emotion',
  name: '情感交流引擎',
  owner: '情感组',
  create: createBackendEngine,
  defaults: EMOTION_DEFAULTS,
};
