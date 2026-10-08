import type { McSceneKind } from '../../types';
import type { Room } from '../rooms/debate';
import type { SchemeId } from './scheme';
import type { Zone } from './space';

/** 一间场景在渲染之前的设计：意图、配色方案、分区，以及生成运行时房间的函数。 */
export interface ScenePlan {
  kind: McSceneKind;
  intent: string;
  scheme: SchemeId;
  zones: Zone[];
  build: () => Room;
}
