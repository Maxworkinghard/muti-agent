import { Vector3 } from 'three';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 临界阻尼弹簧走一步：起步和收尾都是缓的，中途换目标也不会急停急转 */
export function spring(x: Vector3, v: Vector3, goal: Vector3, omega: number, dt: number) {
  for (const k of ['x', 'y', 'z'] as const) {
    v[k] += (omega * omega * (goal[k] - x[k]) - 2 * omega * v[k]) * dt;
    x[k] += v[k] * dt;
  }
}

/** 相机在水平面上的轴：局部 X 是屏幕向右，局部 +Z 从场景指向观众 */
export const flatAxis = (v: Vector3) => {
  const length = Math.hypot(v.x, v.z);
  return length < 1e-6 ? null : { x: +(v.x / length).toFixed(2), z: +(v.z / length).toFixed(2) };
};
