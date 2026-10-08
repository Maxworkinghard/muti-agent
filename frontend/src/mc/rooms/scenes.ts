import type { McSceneKind } from '../../types';
import { planFor, SCENE_PLANS } from '../design/plans';
import type { Room } from './debate';
import { MC_SCENE_KINDS, MC_SCENE_NAMES } from './names';

export { MC_SCENE_KINDS, MC_SCENE_NAMES, SCENE_PLANS };

/** 按场景设计生成运行时房间。讨论、碰撞和镜头只消费这个结果。 */
export function buildMcRoom(kind: McSceneKind = 'debate'): Room {
  return planFor(kind).build();
}
