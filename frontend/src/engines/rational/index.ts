import type { EngineModule } from '../../types';
import { createRationalEngine } from './engine';
import { RATIONAL_DEFAULTS } from './config';

/** 独立辩论引擎：自己的导演、辩手与赛后总结，只共用页面和模型请求接口。 */
export const rationalEngine: EngineModule = {
  mode: 'rational',
  name: '辩论引擎 · 导演与辩手',
  owner: 'frontend/src/engines/rational',
  create: () => createRationalEngine(),
  defaults: RATIONAL_DEFAULTS,
};
