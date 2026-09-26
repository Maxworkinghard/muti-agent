import type { EngineModule } from '../../types';
import { createBackendEngine } from '../backend';
import { DISCUSSION_DEFAULTS } from './config';

/** 理性讨论引擎（来自 #5）：后端按 server/discussion.ts 的流程跑，人物、性格和提示词读 backend/ 的人格数据库。接入时把 create 换成自己的实现，保持 DiscussionEngine 接口不变 */
export const discussionEngine: EngineModule = {
  mode: 'discussion',
  name: '理性讨论引擎',
  owner: '理性讨论组',
  create: createBackendEngine,
  defaults: DISCUSSION_DEFAULTS,
};
