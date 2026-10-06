import type { AgentState, Facing } from '../types';

/** 三维人物此刻在做的事。画哪张图由 drawingForPose 决定，换图以前可以先改那个函数。 */
export type ActorPose = 'sit' | 'stand' | 'speak' | 'think' | 'work';

/** 镜头转向时，朝向沿八向环每步只走一格。 */
export const FACING_STEP_MS = 90;

const ORDER: Facing[] = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];

export function facingDelta(from: Facing, to: Facing): number {
  const raw = (ORDER.indexOf(to) - ORDER.indexOf(from) + 8) % 8;
  return raw > 4 ? raw - 8 : raw;
}

/** 从 from 朝 to 走一格。距离相等时走 ORDER 的方向（S 到 N 经过 E）。 */
export function stepFacing(from: Facing, to: Facing): Facing {
  const delta = facingDelta(from, to);
  if (!delta) return from;
  const dir = delta > 0 ? 1 : -1;
  return ORDER[(ORDER.indexOf(from) + dir + 8) % 8];
}

export function poseFromAgent(state: AgentState | undefined, host: boolean): ActorPose {
  if (state === 'speaking') return 'speak';
  if (state === 'thinking') return 'think';
  if (state === 'working') return 'work';
  return host ? 'stand' : 'sit';
}

/**
 * 现在只有坐、站两张图。坐姿图里已经画了椅子。发言用站立，椅子会先跟着这张图消失；
 * 思考和工作先沿用坐（主持一直站）。以后给思考或发言单独画一帧时，只改这里。
 */
export function drawingForPose(pose: ActorPose, host: boolean): 'sit' | 'stand' {
  if (pose === 'speak' || pose === 'stand') return 'stand';
  if (host) return 'stand';
  return 'sit';
}

/** 像素高和世界高。宽按 16 像素等比，脚在本地 y = 0。 */
export const ACTOR_SIZE = {
  sit: { pixelHeight: 22, worldHeight: 0.96 },
  stand: { pixelHeight: 24, worldHeight: 1.2 },
} as const;

/** 三维里叠在坐/站图上的动作。二维头像不传这个。 */
export type AvatarGesture = 'idle' | 'talk' | 'think';

/** 表情帧。0 是平静；发言是四种嘴型，思考和待机是侧目、笑、抬头、眨眼。 */
export type FaceFrame = 0 | 1 | 2 | 3;

export function motionSalt(id: string) {
  let salt = 0;
  for (let i = 0; i < id.length; i++) salt = (salt * 33 + id.charCodeAt(i)) % 10000;
  return salt;
}

/** 发言换嘴型，思考会抬头和眯眼，其余人侧目、微笑、眨眼。减少动效时停在平静的那一帧。 */
export function actorMotion(pose: ActorPose, now: number, salt: number, reduced: boolean): { gesture: AvatarGesture; frame: FaceFrame; bob: number } {
  if (reduced) {
    return { gesture: pose === 'speak' ? 'talk' : pose === 'think' || pose === 'work' ? 'think' : 'idle', frame: 0, bob: 0 };
  }
  const time = now + salt;
  if (pose === 'speak') {
    return { gesture: 'talk', frame: (Math.floor(time / 140) % 4) as FaceFrame, bob: Math.sin(time / 140) * 0.04 };
  }
  if (pose === 'think' || pose === 'work') {
    return { gesture: 'think', frame: (Math.floor(time / 420) % 4) as FaceFrame, bob: Math.sin(time / 380) * 0.018 };
  }
  const cycle = ((time % 3200) + 3200) % 3200;
  let frame: FaceFrame = 0;
  if (cycle >= 1400 && cycle < 2000) frame = 1;
  else if (cycle >= 2000 && cycle < 2680) frame = 2;
  else if (cycle >= 2680 && cycle < 2840) frame = 3;
  return { gesture: 'idle', frame, bob: Math.sin(time / 480) * 0.028 };
}

export function actorWorldSize(drawing: 'sit' | 'stand') {
  const spec = ACTOR_SIZE[drawing];
  return {
    pixelHeight: spec.pixelHeight,
    worldHeight: spec.worldHeight,
    worldWidth: spec.worldHeight * 16 / spec.pixelHeight,
  };
}
