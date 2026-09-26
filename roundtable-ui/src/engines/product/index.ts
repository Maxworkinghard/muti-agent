import type { EngineModule } from '../../types';
import { createMockEngine } from '../mock';
import { PRODUCT_DEFAULTS } from './config';

/** 工作引擎：工作 Agent 分工交接，后续导入的工作部分合并到这个文件夹。接入时把 create 换成真实实现，保持 DiscussionEngine 接口不变 */
export const productEngine: EngineModule = {
  mode: 'product',
  name: '工作引擎（mock）',
  owner: '工作组',
  create: createMockEngine,
  defaults: PRODUCT_DEFAULTS,
};
