import type { EngineModule } from '../../types';
import { createApiEngine } from './apiEngine';
import { RATIONAL_DEFAULTS } from './config';

/** 辩论引擎：调用 backend/服务.py（PR5 的人物数据库和 讨论引擎.py），发言和主持人总结都来自后端 */
export const rationalEngine: EngineModule = {
  mode: 'rational',
  name: '辩论引擎（人物数据库）',
  owner: 'backend/服务.py',
  create: createApiEngine,
  defaults: RATIONAL_DEFAULTS,
};
