import type { EngineModule } from '../../types';
import { createBackendEngine } from '../backend';
import { PRODUCT_DEFAULTS } from './config';

/** 工作引擎：工作 Agent 分工交接，后续导入的工作部分合并到这个文件夹。现在由后端跑（server/session.ts 的负责人派活、交接、汇总流程），接入时把 create 换成自己的实现，保持 DiscussionEngine 接口不变 */
export const productEngine: EngineModule = {
  mode: 'product',
  name: '工作引擎',
  owner: '工作组',
  create: createBackendEngine,
  defaults: PRODUCT_DEFAULTS,
};
