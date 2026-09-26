import type { DiscussionEngine } from '../types';
import { MODES } from '../data/modes';
import { createMockEngine } from './mockEngine';
import { createOmpEngine } from './ompEngine';

/** 网址加 ?engine=mock 或设置 VITE_ENGINE=mock 时用模拟引擎，不调用模型 */
const useMock = import.meta.env.VITE_ENGINE === 'mock' || new URLSearchParams(location.search).get('engine') === 'mock';

/** 其他小组的引擎在这里注册；前端通过 mode 取对应引擎。默认每个模式都用 omp 真实引擎 */
export const ENGINE_REGISTRY: Record<string, () => DiscussionEngine> = Object.fromEntries(
  MODES.map((m) => [m.id, useMock ? createMockEngine : createOmpEngine]),
);
