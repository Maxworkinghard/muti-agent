import type { EngineModule } from '../../types';
import { createMockEngine } from '../mock';
import { RATIONAL_DEFAULTS } from './config';

/** 辩论引擎：由辩论组负责（哲学、政治类理性辩论）。接入时把 create 换成真实实现，保持 DiscussionEngine 接口不变 */
export const rationalEngine: EngineModule = {
  mode: 'rational',
  name: '辩论引擎（mock）',
  owner: '辩论组',
  create: createMockEngine,
  defaults: RATIONAL_DEFAULTS,
};
