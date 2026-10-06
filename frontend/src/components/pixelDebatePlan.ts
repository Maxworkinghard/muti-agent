import type { Seat } from '../types';

/**
 * 辩论室地板。宽高比跟 1536×1024 的原图一致，座位百分比直接铺到这张地板上。
 * 图像 y 向下，所以图像上方（讲台）在世界 -Z，观众侧在 +Z。相机放在 +Z。
 */
export const DEBATE_FLOOR = { width: 20, depth: 20 * 1024 / 1536 };

/** 房间本身的尺寸。墙是竖直的，不再沿用俯视图里被压扁的那一圈。 */
export const DEBATE_ROOM = { width: 12, depth: 9.2, wall: 4 };

export function planToWorld(xPercent: number, yPercent: number): { x: number; z: number } {
  return {
    x: (xPercent / 100 - 0.5) * DEBATE_FLOOR.width,
    z: (yPercent / 100 - 0.5) * DEBATE_FLOOR.depth,
  };
}

/** 从座位指向房间原点的水平单位向量。人朝这边看，桌子也朝这边挪。 */
export function inwardFrom(x: number, z: number): { x: number; z: number } {
  const length = Math.hypot(x, z);
  if (length < 1e-4) return { x: 0, z: 1 };
  return { x: -x / length, z: -z / length };
}

/**
 * 让 BoxGeometry 的本地 +X 对准 (ax, az)。
 * Three.js 里 rotation.y = θ 把本地 +X 送到 (cos θ, 0, −sin θ)。
 */
export function yawAligningLocalX(ax: number, az: number): number {
  const length = Math.hypot(ax, az);
  if (length < 1e-6) return 0;
  return Math.atan2(-az / length, ax / length);
}

export interface PlannedSeat {
  index: number;
  x: number;
  z: number;
  group?: Seat['group'];
}

export function planDebateSeats(seats: Seat[]): PlannedSeat[] {
  return seats.map((seat, index) => {
    const world = planToWorld(seat.x, seat.y);
    return { index, x: world.x, z: world.z, group: seat.group };
  });
}

export interface PlannedTable {
  x: number;
  z: number;
  yaw: number;
  length: number;
}

/** 一组座位旁边的桌子：沿座位连线，往房间中心挪一截，避免人站在桌面上。 */
export function tableFor(seats: PlannedSeat[]): PlannedTable | null {
  if (seats.length < 2) return null;
  const mid = {
    x: seats.reduce((sum, seat) => sum + seat.x, 0) / seats.length,
    z: seats.reduce((sum, seat) => sum + seat.z, 0) / seats.length,
  };
  const first = seats[0];
  const last = seats[seats.length - 1];
  const ax = last.x - first.x;
  const az = last.z - first.z;
  const inward = inwardFrom(mid.x, mid.z);
  // 桌子往中心挪得够远，人物半身不会压到桌面。
  const gap = 1.7;
  return {
    x: mid.x + inward.x * gap,
    z: mid.z + inward.z * gap,
    yaw: yawAligningLocalX(ax, az),
    length: Math.hypot(ax, az) + 1.15,
  };
}

/**
 * 世界坐标在桌面本地坐标里的位置：
 * - along：沿桌长，0 是桌心，正负对应座位前后；
 * - side：垂直桌长，+1 是座位这一侧，-1 是房间中心那一侧。
 */
export function tableLocal(point: { x: number; z: number }, table: PlannedTable): { along: number; side: number } {
  const dx = point.x - table.x;
  const dz = point.z - table.z;
  const alongX = Math.cos(table.yaw);
  const alongZ = -Math.sin(table.yaw);
  const sideX = Math.sin(table.yaw);
  const sideZ = Math.cos(table.yaw);
  return { along: dx * alongX + dz * alongZ, side: dx * sideX + dz * sideZ };
}

export interface CameraFrame {
  position: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  fov: number;
}

/** 进房间时的眼睛高度、看向的高度，以及视场角的扫描范围 */
const EYE_HEIGHT = 1.72;
const LOOK_HEIGHT = 0.95;
const FOV_MIN = 58;
const FOV_MAX = 80;
/** 画面里留出的边距：投影落在 ±0.92 以内才算“进画面” */
const NDC_MARGIN = 0.92;

/**
 * 进门时的默认机位：站在观众侧朝里看，把每个座位都收进画面。
 * 先按最小视场角试，不够宽就一档档加大；同一档里挑离座位最远的位置，透视变形最小。
 * 返回的是相机坐标和朝角（YXZ 下的 yaw / pitch），相机位姿由调用方设置。
 */
export function frameCamera(points: { x: number; z: number }[], aspect: number, room = DEBATE_ROOM): CameraFrame {
  const midX = points.length ? points.reduce((sum, p) => sum + p.x, 0) / points.length : 0;
  const midZ = points.length ? points.reduce((sum, p) => sum + p.z, 0) / points.length : 0;
  const target = { x: midX, y: LOOK_HEIGHT, z: midZ };
  // 取景机位最靠后到这儿：再往后转头就是一堵贴脸的墙
  const maxZ = room.depth / 2 - 1.15;
  const minZ = -room.depth / 2 + 1.4;
  const height = Math.max(EYE_HEIGHT, 1.2);

  const fits = (fov: number, z: number) => {
    const camera = { x: midX, y: height, z };
    const vx = target.x - camera.x;
    const vy = target.y - camera.y;
    const vz = target.z - camera.z;
    const length = Math.hypot(vx, vy, vz) || 1;
    const forward = { x: vx / length, y: vy / length, z: vz / length };
    const rightLength = Math.hypot(forward.z, forward.x) || 1;
    const right = { x: -forward.z / rightLength, y: 0, z: forward.x / rightLength };
    const up = {
      x: right.y * forward.z - right.z * forward.y,
      y: right.z * forward.x - right.x * forward.z,
      z: right.x * forward.y - right.y * forward.x,
    };
    const tan = Math.tan((fov * Math.PI) / 180 / 2);
    // 一个人的脚、腰、头顶都在画面里，才算这个人真的进画面
    return points.every((point) => [0.15, 0.75, 1.3].every((tall) => {
      const px = point.x - camera.x;
      const py = tall - camera.y;
      const pz = point.z - camera.z;
      const depth = px * forward.x + py * forward.y + pz * forward.z;
      if (depth < 0.6) return false;
      const sx = (px * right.x + py * right.y + pz * right.z) / (depth * tan * aspect);
      const sy = (px * up.x + py * up.y + pz * up.z) / (depth * tan);
      return Math.abs(sx) <= NDC_MARGIN && Math.abs(sy) <= NDC_MARGIN;
    }));
  };

  for (let fov = FOV_MIN; fov <= FOV_MAX; fov += 4) {
    for (let z = maxZ; z >= minZ; z -= 0.4) {
      if (!fits(fov, z)) continue;
      const vx = target.x - midX;
      const vy = target.y - height;
      const vz = target.z - z;
      const flat = Math.hypot(vx, vz) || 1;
      return {
        position: { x: midX, y: height, z: +z.toFixed(3) },
        yaw: Math.atan2(-vx, -vz),
        pitch: Math.atan2(vy, flat),
        fov,
      };
    }
  }
  const vx = target.x - midX;
  const vz = target.z - maxZ;
  return {
    position: { x: midX, y: height, z: maxZ },
    yaw: Math.atan2(-vx, -vz),
    pitch: Math.atan2(target.y - height, Math.hypot(vx, vz)),
    fov: FOV_MAX,
  };
}
