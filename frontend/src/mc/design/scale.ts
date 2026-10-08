/**
 * 人物和家具的尺度。数字来自现有角色骨架和房间检查，不另起一套身高。
 * - 站立脚底 y=1，坐下时身体根在 1.5（validateRoom / sceneDirector 用这个判断坐姿）。
 * - 站立眼睛约 1.62，坐下眼睛约 1.15（镜头遮挡检查用的头高）。
 * - 身体半宽 0.4、半深 0.2（validateRoom 的碰撞箱）。
 * - 桌面 0.95：这个骨架坐下时前臂能平放；不要改成真实人类的 0.75，否则手会悬空。
 */
export const SCALE = {
  standFoot: 1,
  sitRoot: 1.5,
  eyeStand: 1.62,
  eyeSit: 1.15,
  bodyHalfX: 0.4,
  bodyHalfZ: 0.2,
  tableHeight: 0.95,
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
