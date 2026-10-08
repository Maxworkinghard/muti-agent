/** 一块有名字的地面。坐标是米，x 朝东、z 朝南，含边界。用来约束布局，不直接变成网格。 */
export interface Zone {
  id: string;
  role: 'meeting' | 'work' | 'circulation' | 'focus' | 'audience' | 'landscape' | 'stage' | 'threshold';
  min: [number, number];
  max: [number, number];
  note: string;
}

/** 绕圆心等分座位。phase 弧度，0 是正东，-π/2 是正北。返回朝向圆心的 yaw。 */
export function ring(cx: number, cz: number, radius: number, count: number, phase = -Math.PI / 2): Array<{ x: number; z: number; yaw: number }> {
  return Array.from({ length: count }, (_, i) => {
    const angle = phase + (i * 2 * Math.PI) / count;
    const x = cx + radius * Math.cos(angle), z = cz + radius * Math.sin(angle);
    return { x, z, yaw: Math.atan2(cx - x, cz - z) };
  });
}

/** 圆桌边缘到座位根点的空隙。tableRadius 是桌面半径，不是碰撞用的外接圆。 */
export function roundGap(tableRadius: number, seatX: number, seatZ: number, cx: number, cz: number): number {
  return Math.hypot(seatX - cx, seatZ - cz) - tableRadius;
}
