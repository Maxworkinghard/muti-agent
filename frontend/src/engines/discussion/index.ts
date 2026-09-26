import type { EngineModule } from '../../types';
import { createApiEngine } from './apiEngine';
import { DISCUSSION_DEFAULTS } from './config';

/** 理性讨论引擎：流程在 backend/讨论引擎.py（Python），前端通过 backend/服务.py 的 /api/discuss 调用 */
export const discussionEngine: EngineModule = {
  mode: 'discussion',
  name: '理性讨论引擎（人格数据库）',
  owner: 'backend/服务.py',
  create: createApiEngine,
  defaults: DISCUSSION_DEFAULTS,
};
