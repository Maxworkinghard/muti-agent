import type { Facing } from '../types';

/** 场景水平面上的一点（只用 XZ，Y 与朝向无关） */
export interface StagePoint { x: number; z: number }

/**
 * 相机在场景水平面上的朝向，两个向量都已归一化：
 * - `right`：屏幕向右对应的世界方向
 * - `toward`：从场景指向观众（相机）的方向
 */
export interface StageView {
  right: StagePoint;
  toward: StagePoint;
  /** 每个座位在世界里的位置，下标与 seatIndex 一致 */
  seats: StagePoint[];
}

/** 正对观众是 S；从 S 顺时针每 45° 一格，和 PixelAvatar 画出来的八个朝向一致 */
const OCTANTS: Facing[] = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];

/** 人物朝世界方向 (dx, dz) 时，观众看到的是八个朝向里的哪一个 */
export function facingFromDirection(dx: number, dz: number, cam: Pick<StageView, 'right' | 'toward'>): Facing {
  const length = Math.hypot(dx, dz);
  if (!length) return 'S';
  const nx = dx / length;
  const nz = dz / length;
  // 投影到相机的两个轴上：cos 是「有多正对观众」，sin 是「有多偏向屏幕右侧」
  const cos = nx * cam.toward.x + nz * cam.toward.z;
  const sin = nx * cam.right.x + nz * cam.right.z;
  const turn = Math.atan2(sin, cos);
  const index = ((Math.round(turn / (Math.PI / 4)) % 8) + 8) % 8;
  return OCTANTS[index];
}

/** 站在 from 的人看向 look 时的朝向；from 和 look 都在水平面上 */
export function facingToward(from: StagePoint, look: StagePoint, cam: Pick<StageView, 'right' | 'toward'>): Facing {
  return facingFromDirection(look.x - from.x, look.z - from.z, cam);
}

/** 一组座位的重心，用作房间里大家看过去的那一点 */
export function centroid(points: StagePoint[]): StagePoint | null {
  if (!points.length) return null;
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    z: points.reduce((sum, p) => sum + p.z, 0) / points.length,
  };
}
