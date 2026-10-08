import { EYE_SIT, EYE_STAND, SEAT_H, SIT_DROP } from '../avatar/rig';
/**
 * 人物和家具的尺度。数字来自 Q 版人物骨架（avatar/rig.ts）和房间检查，不另起一套身高。
 * - 站立脚底 y=1，坐下时座位锚点在 1.5 = 地面 + 统一座面高 0.50（validateRoom / sceneDirector 用这个判断坐姿）。
 * - 坐下时人物根点比锚点低 sitDrop（0.4167，旧骨架 0.578）。
 * - 站立眼睛 1.1875（旧 1.62），坐下眼睛在锚点上方 0.771（旧检查用 1.15）：镜头遮挡检查和导演“看向某人”都用它。
 * - 身体半宽 0.4、半深 0.2（validateRoom 的碰撞箱，一个盒子包整个人：取躯干和腿的深度，大头前后 0.58 会伸出去，不算碰撞）。
 * - 桌面：旧场景仍是 0.95；Q 版人物坐着时 0.95 到肩膀，湖畔圆桌（v2）降到 0.78（见 v2/roundtable）。
 */
export const SCALE = {
  standFoot: 1,
  sitRoot: 1.5,
  seatHeight: SEAT_H,
  sitDrop: SIT_DROP,
  eyeStand: EYE_STAND,
  eyeSit: EYE_SIT,
  bodyHalfX: 0.4,
  bodyHalfZ: 0.2,
  tableHeight: 0.95,
  chibiTableHeight: 0.78,
  /** 圆桌边缘到座位根点。太近腿进桌，太远人像围着空地。 */
  roundGapMin: 0.28,
  roundGapMax: 0.62,
  /** 两人侧身错开时，通道至少要过得去一个身体。 */
  aisle: 1.1,
} as const;

/** 圆桌座位环的半径：桌面半径 + 人和桌沿的空隙。 */
export function roundSeatRadius(tableRadius: number, gap = 0.36): number {
  return tableRadius + gap;
}
