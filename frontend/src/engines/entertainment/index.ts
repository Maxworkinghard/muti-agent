import type { EngineModule } from '../../types';
import { createLiveEngine } from '../live/engine';
import { ENTERTAINMENT_DEFAULTS } from './config';
import { createEntertainmentKit } from './kit';

/**
 * 娱乐引擎：活人群聊底盘（../live）+ 娱乐玩法（kit.ts）。
 * 没有轮次、不指定谁说话：每出一段话所有人各自起反应，谁最憋不住谁先说，情绪会攒、会上头、会冷下来。说明见 README.md
 */
export const entertainmentEngine: EngineModule = {
  mode: 'entertainment',
  name: '娱乐引擎 · 活人群聊',
  owner: '娱乐组',
  create: () => createLiveEngine(createEntertainmentKit()),
  defaults: ENTERTAINMENT_DEFAULTS,
};
