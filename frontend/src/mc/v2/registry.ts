/**
 * v2 场景登记：按场景种类给出新实现，没有新实现的返回 null，由调用方退回旧场景。
 * 本阶段只有圆桌会议室（roundtable）。
 */
import type {McSceneKind} from '../../types';
import type {Room} from '../rooms/debate';
import {buildRoundtableV2} from './roundtable';

export const V2_KINDS:readonly McSceneKind[]=['roundtable'];
export function buildMcRoomV2(kind:McSceneKind):Room|null{
  if(kind==='roundtable')return buildRoundtableV2();
  return null;
}
