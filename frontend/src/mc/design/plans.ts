import { DEBATE_ZONES, buildDebateRoom } from '../rooms/debate';
import { classroomPlan } from '../rooms/classroom';
import { meadowPlan } from '../rooms/meadow';
import { officePlan } from '../rooms/office';
import { podcastPlan } from '../rooms/podcast';
import { roundtablePlan } from '../rooms/roundtable';
import type { ScenePlan } from './plan';

/** 六个场景的设计入口。运行时房间只从这里生成。 */
export const SCENE_PLANS: ScenePlan[] = [
  {
    kind: 'debate',
    intent: '正反方相对、主持人在北墙、观众从南门进来。队色只说明立场，通道留在正中。',
    scheme: 'debate',
    zones: DEBATE_ZONES,
    build: buildDebateRoom,
  },
  roundtablePlan,
  officePlan,
  classroomPlan,
  meadowPlan,
  podcastPlan,
];

export function planFor(kind: ScenePlan['kind']): ScenePlan {
  const plan = SCENE_PLANS.find(item => item.kind === kind);
  if (!plan) throw new Error('没有这间场景的设计：' + kind);
  return plan;
}
