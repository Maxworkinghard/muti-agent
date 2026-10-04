import type { EngineModule } from '../../types';
import { createBackendEngine } from '../backend';
import { PRODUCT_DEFAULTS } from './config';

/** 工作引擎：后端 server/work.ts 跑派活、并行工作、当面讨论、互相评审与会议交付；前端通过 SSE 接收状态、走动和任务流转。 */
export const productEngine: EngineModule = {
  mode: 'product',
  name: '工作引擎',
  owner: '工作组',
  create: createBackendEngine,
  defaults: PRODUCT_DEFAULTS,
};
