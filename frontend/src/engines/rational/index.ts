import type { EngineModule } from '../../types';
import { createBackendEngine } from '../backend';
import { RATIONAL_DEFAULTS } from './config';

/** 辩论引擎：由辩论组负责（哲学、政治类理性辩论）。现在由后端跑（server/session.ts 的主持开场收尾、正反方交替流程），接入时把 create 换成自己的实现，保持 DiscussionEngine 接口不变 */
export const rationalEngine: EngineModule = {
  mode: 'rational',
  name: '辩论引擎',
  owner: '辩论组',
  create: createBackendEngine,
  defaults: RATIONAL_DEFAULTS,
};
