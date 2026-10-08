import type { McSceneKind } from '../../types';

export const MC_SCENE_KINDS: McSceneKind[] = ['debate', 'roundtable', 'office', 'classroom', 'meadow', 'podcast'];
export const MC_SCENE_NAMES: Record<McSceneKind, string> = {
  debate: '辩论室', roundtable: '圆桌会议室', office: '办公室', classroom: '教室', meadow: '草地野餐', podcast: '播客访谈间',
};
