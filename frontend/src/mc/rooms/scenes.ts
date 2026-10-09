import type {McSceneKind} from '../../types';
import type {Room} from './types';
import {buildRoundtableV2} from '../v2/roundtable';
export {MC_SCENE_KINDS,MC_SCENE_NAMES} from './names';
/** 唯一保留的 3D 实现是未完成的圆桌重建样板，不再回退到旧房间。 */
export function buildMcRoom(kind:McSceneKind='roundtable'):Room {
  if(kind!=='roundtable')throw new Error('该 3D 场景已移除，只保留圆桌重建样板');
  return buildRoundtableV2();
}
