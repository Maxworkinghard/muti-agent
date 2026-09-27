import type { EngineModule, ModeId } from '../types';
import { entertainmentEngine } from './entertainment';
import { rationalEngine } from './rational';
import { productEngine } from './product';

/** 每个模式一个独立引擎，前端只通过这里按 mode 取用 */
export const ENGINES: Record<ModeId, EngineModule> = {
  entertainment: entertainmentEngine,
  rational: rationalEngine,
  product: productEngine,
};

export const engineFor = (mode: ModeId) => ENGINES[mode];
