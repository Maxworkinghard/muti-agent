import type { EngineModule, ModeId } from '../types';
import { createMockEngine } from './mock';
import { entertainmentEngine } from './entertainment';
import { rationalEngine } from './rational';
import { productEngine } from './product';

/** 每个模式一个独立引擎，前端只通过这里按 mode 取用 */
export const ENGINES: Record<ModeId, EngineModule> = {
  entertainment: entertainmentEngine,
  rational: rationalEngine,
  product: productEngine,
};

/** 网址加 ?engine=mock 或设置 VITE_ENGINE=mock 时，所有模式都换成模拟引擎，不调用模型 */
const useMock = import.meta.env.VITE_ENGINE === 'mock' || new URLSearchParams(location.search).get('engine') === 'mock';

export const engineFor = (mode: ModeId): EngineModule =>
  useMock ? { ...ENGINES[mode], name: '模拟引擎', create: createMockEngine } : ENGINES[mode];
