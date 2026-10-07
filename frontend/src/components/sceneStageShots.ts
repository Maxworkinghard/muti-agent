import { Box3, Mesh, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import type { SceneDef } from '../types';
import type { Occupancy } from './stageOccupancy';
import { FOLLOW, UP, roomViewFor } from './sceneStageConstants';
import type { Shot, StageCue, StageRoomMetrics } from './sceneStageConstants';
import { clamp } from './sceneStageMath';

/**
 * 机位规划需要的舞台状态：模型加载完才有值，全部用 getter 读取，
 * 组件里的同名局部变量更新后，这里读到的是最新值。
 */
export interface StageShotContext {
  scene: SceneDef;
  walk: PerspectiveCamera;
  ray: Raycaster;
  seats: Vector3[];
  seatSurfaces: Mesh[];
  castRef: { current: number[] };
  getBounds: () => Box3 | null;
  getRoomMetrics: () => StageRoomMetrics | null;
  getOccupancy: () => Occupancy | null;
  getAvatarHeight: () => number;
  getFloorY: () => number;
  getCeilingY: () => number;
}

/**
 * 跟拍的机位规划：全景、单人、双人同框，以及视线遮挡检查。
 * 实现与原来 SceneStage3D 里的完全一致，只是闭包变量改为从 ctx 读取。
 */
export function createStageShots(ctx: StageShotContext) {
  const { scene, walk, ray, seats, seatSurfaces, castRef } = ctx;

  /** 默认机位：站在观众那头、眼睛高度 */
  const vantage = () => {
    const bounds = ctx.getBounds()!;
    const roomMetrics = ctx.getRoomMetrics();
    const view = roomViewFor(scene);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    return new Vector3(
      center.x + size.x * view.side,
      roomMetrics ? roomMetrics.floor + roomMetrics.eyeHeight : bounds.min.y + size.y * view.eye,
      center.z + size.z * view.back,
    );
  };
  const castSeats = () => castRef.current.map((i) => seats[i]).filter((seat): seat is Vector3 => Boolean(seat));

  /** 从 from 看向 target 时，要多大的竖直视场角才能把这些点都框进来（留 margin 倍余量） */
  const fitFov = (from: Vector3, target: Vector3, points: Vector3[], margin: number) => {
    const probe = new PerspectiveCamera(50, walk.aspect, 0.01, 100);
    probe.position.copy(from);
    probe.lookAt(target);
    probe.updateMatrixWorld();
    let need = 0;
    for (const point of points) {
      const q = point.clone().applyMatrix4(probe.matrixWorldInverse);
      // 有人在镜头侧面或身后：多大的视场角都框不进来
      if (q.z > -1e-3) return 180;
      need = Math.max(need, Math.abs(q.y) / -q.z, Math.abs(q.x) / -q.z / walk.aspect);
    }
    return (2 * Math.atan(need * margin) * 180) / Math.PI;
  };

  /**
   * 全景：从观众那头稍高处往下拍，像辩论节目的摇臂机位：把在座的人都框进来，
   * 视线微微朝下，画面给人和桌子，少拍天花板。
   */
  const wideShot = (): Shot => {
    const bounds = ctx.getBounds()!;
    const roomMetrics = ctx.getRoomMetrics();
    const avatarHeight = ctx.getAvatarHeight();
    const floorY = ctx.getFloorY();
    const ceilingY = ctx.getCeilingY();
    const view = roomViewFor(scene);
    const pos = vantage();
    const people = castSeats();
    if (!people.length) {
      const center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3());
      return { pos, target: new Vector3(center.x, roomMetrics ? roomMetrics.floor + roomMetrics.lookHeight : bounds.min.y + size.y * view.look, center.z), fov: view.fov };
    }
    const target = new Vector3();
    for (const seat of people) target.add(seat);
    target.divideScalar(people.length);
    target.y += avatarHeight * 0.55;
    const corners = people.flatMap((seat) => [
      seat.clone().add(new Vector3(-avatarHeight * 0.4, -avatarHeight * 0.15, 0)),
      seat.clone().add(new Vector3(avatarHeight * 0.4, avatarHeight * 1.05, 0)),
    ]);
    // 从人群中心朝默认机位的方向往后退，直到能把所有人框进来（围坐一圈时默认机位在圈里，得退到圈外）；
    // 人散在四周的房间（办公室）平视怎么退都框不全，就把镜头升高、往下俯得更多。
    // 俯角从小往大试，用第一个框得全的；都不行就取视场角最小的那个
    const away = new Vector3(pos.x - target.x, 0, pos.z - target.z);
    if (away.lengthSq() < 1e-8) away.set(0, 0, 1);
    away.normalize();
    const size = bounds.getSize(new Vector3());
    const start = Math.hypot(pos.x - target.x, pos.z - target.z);
    let best: Shot | null = null;
    for (const pitch of FOLLOW.widePitches) {
      for (let reach = start; reach <= Math.hypot(size.x, size.z); reach += Math.max(size.x, size.z) * 0.05) {
        const at = keepInside(target.clone().addScaledVector(away, reach).setY(target.y + reach * Math.tan(pitch)));
        at.y = clamp(at.y, floorY + avatarHeight, ceilingY - avatarHeight);
        const fov = fitFov(at, target, corners, 1.12);
        if (!best || fov < best.fov) best = { pos: at, target, fov };
        if (fov <= 48) return { pos: at, target, fov: Math.max(30, fov) };
      }
    }
    // 屋里怎么站都框不全（顶上敞开、人沿四面墙坐的办公室）：升到屋顶上方往下拍，像无人机开场。
    // 镜头在屋顶以上时补的顶会自动隐藏（见 publishPositions），有人开口再降进屋里
    for (let reach = start; reach <= Math.hypot(size.x, size.z) * 2; reach += Math.max(size.x, size.z) * 0.05) {
      const at = target.clone().addScaledVector(away, reach * Math.cos(FOLLOW.dronePitch));
      at.y = Math.max(target.y + reach * Math.sin(FOLLOW.dronePitch), bounds.max.y + avatarHeight);
      const fov = fitFov(at, target, corners, 1.15);
      if (fov <= view.fov) return { pos: at, target, fov: Math.max(30, fov) };
    }
    return { ...best!, fov: clamp(best!.fov, 30, view.fov) };
  };

  /**
   * 从人物的头往镜头看过去，四周要有空：中间那条线必须通，往左、右、上各偏开四分之一距离的三条线至少通两条。
   * 只查中间一条线的话，镜头会贴着隔板或柜子站，人看得见，画面却被半堵墙占了
   */
  const clearView = (head: Vector3, pos: Vector3) => {
    if (!headVisible(head, pos)) return false;
    const toward = pos.clone().sub(head);
    const side = new Vector3().crossVectors(toward, UP).normalize().multiplyScalar(toward.length() * 0.25);
    const lift = UP.clone().multiplyScalar(toward.length() * 0.25);
    const open = [pos.clone().add(side), pos.clone().sub(side), pos.clone().add(lift)].filter((p) => clearLine(head, p)).length;
    return open >= 2 && roomy(pos, head);
  };
  /**
   * 他的脸从镜头那儿看得见吗：从头部中间、左右、上下五个点各拉一条线，至少三条通就算看得见。
   * 人物画在场景里会被近处的东西挡；面前一根细话筒架挡住一点没关系，整张脸被挡才算挡住
   */
  const headVisible = (head: Vector3, pos: Vector3) => {
    const avatarHeight = ctx.getAvatarHeight();
    const side = new Vector3().crossVectors(pos.clone().sub(head), UP).normalize().multiplyScalar(avatarHeight * 0.3);
    const points = [head, head.clone().add(side), head.clone().sub(side), head.clone().addScaledVector(UP, avatarHeight * 0.3), head.clone().addScaledVector(UP, -avatarHeight * 0.25)];
    let open = 0;
    for (const [i, point] of points.entries()) {
      if (clearLine(point, pos)) open++;
      // 已经够三条，或者剩下的全通也凑不够，就不用再打了
      if (open >= 3 || open + points.length - 1 - i < 3) break;
    }
    return open >= 3;
  };
  /**
   * 镜头正前方近处不能有东西糊在画面上（比如脸前一支大话筒、贴着镜头的柜子）：从镜头往画面中间一行、偏上一行
   * 各打三条短线（到人物一半距离），偏下一行打更短的三条（四分之一距离），碰到东西就不要这个机位
   */
  const foregroundClear = (pos: Vector3, target: Vector3, fov: number) => {
    const forward = target.clone().sub(pos);
    const reach = forward.length() * 0.5;
    forward.normalize();
    const right = new Vector3().crossVectors(forward, UP).normalize();
    const up = new Vector3().crossVectors(right, forward).normalize();
    const tanV = Math.tan((fov * Math.PI) / 360);
    const tanH = tanV * walk.aspect;
    // 下面一行只查一半距离：桌面在下方做前景没关系，贴着镜头的柜子、打印机才算糊
    for (const [v, share] of [[0, 1], [0.55, 1], [-0.45, 0.5]]) {
      for (const u of [-0.6, 0, 0.6]) {
        const dir = forward.clone().addScaledVector(right, u * tanH).addScaledVector(up, v * tanV).normalize();
        if (blocked(pos, pos.clone().addScaledVector(dir, reach * share))) return false;
      }
    }
    return true;
  };
  /** 镜头身边要留出空：左、右、左前、右前在三成拍摄距离内碰到东西，说明镜头贴着隔板或柜子站 */
  const roomy = (pos: Vector3, head: Vector3) => {
    const ahead = new Vector3(head.x - pos.x, 0, head.z - pos.z);
    const reach = ahead.length() * 0.3;
    ahead.normalize();
    const left = new Vector3(-ahead.z, 0, ahead.x);
    return [left, left.clone().negate(), left.clone().add(ahead).normalize(), left.clone().negate().add(ahead).normalize()]
      .every((dir) => !blocked(pos, pos.clone().addScaledVector(dir, reach)));
  };
  /**
   * 从人物的头往镜头拉一条线，中间不能撞上墙、柜子、大盆栽，也不能被他面前的话筒挡住脸。
   * 起点离头 0.12 个半身高（且不少于一个占位格），只跳过和头紧挨着的那一点；
   * 加载时已经把嵌进桌上东西的头挪了出来（见座位校正）
   */
  const clearLine = (head: Vector3, pos: Vector3) => !blocked(head, pos, Math.max(ctx.getAvatarHeight() * 0.12, ctx.getOccupancy()?.cellSize ?? 0));
  /** 两点之间有没有被挡：在占位网格里走（快）；网格还没建好时退回逐个三角面求交 */
  const blocked = (from: Vector3, to: Vector3, skip = 0) => {
    const occupancy = ctx.getOccupancy();
    if (occupancy) return occupancy.blocked(from, to, skip);
    const toward = to.clone().sub(from);
    const length = toward.length();
    toward.divideScalar(length);
    ray.set(from.clone().addScaledVector(toward, skip), toward);
    ray.near = 0;
    ray.far = Math.max(0, length - skip);
    const hit = ray.intersectObjects(seatSurfaces.filter((mesh) => mesh.visible), false).length > 0;
    ray.far = Infinity;
    return hit;
  };
  /** 镜头和他之间别正好隔着另一个人，否则前景一个大脑袋把他挡住 */
  const personInWay = (pos: Vector3, head: Vector3, index: number) => {
    const avatarHeight = ctx.getAvatarHeight();
    const toward = head.clone().sub(pos);
    const length = toward.length();
    toward.divideScalar(length);
    return castRef.current.some((i) => {
      if (i === index || !seats[i]) return false;
      const other = seats[i].clone().setY(seats[i].y + avatarHeight * 0.5).sub(pos);
      const along = other.dot(toward);
      if (along <= 0 || along >= length * 0.92) return false;
      return other.addScaledVector(toward, -along).length() < avatarHeight * 0.9;
    });
  };
  const keepInside = (pos: Vector3) => {
    const bounds = ctx.getBounds()!;
    const avatarHeight = ctx.getAvatarHeight();
    const floorY = ctx.getFloorY();
    const ceilingY = ctx.getCeilingY();
    const size = bounds.getSize(new Vector3());
    const inset = Math.min(size.x, size.z) * 0.06;
    pos.x = clamp(pos.x, bounds.min.x + inset, bounds.max.x - inset);
    pos.z = clamp(pos.z, bounds.min.z + inset, bounds.max.z - inset);
    pos.y = clamp(pos.y, floorY + avatarHeight * 0.6, ceilingY - avatarHeight * 0.25);
    return pos;
  };

  /**
   * 说话的人和交流对象同框，像对话戏的过肩镜头：镜头站到对象那边、斜开一个角度，
   * 对象留在画面一侧，说话的人在中间、看得到正脸。机位同样要在屋里、四周不被挡、不被别人挡住，
   * 两人都进得了 48° 以内的画面才用；找不到返回 null，交给单人镜头。
   */
  const pairShot = (index: number, partnerIndex: number, head: Vector3, facing: Vector3, signs: number[]): Shot | null => {
    const avatarHeight = ctx.getAvatarHeight();
    const partner = seats[partnerIndex];
    const partnerHead = partner.clone().setY(partner.y + avatarHeight * 0.6);
    const toward = new Vector3(partnerHead.x - head.x, 0, partnerHead.z - head.z);
    const gap = toward.length();
    // 隔得太远（辩论室两边的长桌之间）硬凑同框，两个人都只剩一点点：交给单人镜头，镜头仍站在对方那一侧
    if (gap < avatarHeight || gap > avatarHeight * 5.5) return null;
    toward.normalize();
    const target = head.clone().lerp(partnerHead, 0.3);
    // 两个人从桌面到头顶都要进画面
    const points = [seats[index], head.clone().setY(head.y + avatarHeight * 0.5), partner, partnerHead.clone().setY(partnerHead.y + avatarHeight * 0.5)];
    // 抬得太高就成了俯拍，只看得到头顶
    for (const lift of [0.6, 1.2, 1.8]) {
      for (const angle of [32, 48, 20, 64]) {
        for (const sign of signs) {
          // 从「两人间距」和「两个半身高」里取大的起步，框不下就往后退：邻座两人挨得近，按间距算会贴到脸上
          for (let step = 0, reach = Math.max(gap * 0.9, avatarHeight * 2.2); step < 4; step++, reach *= 1.25) {
            const dir = toward.clone().applyAxisAngle(UP, (sign * angle * Math.PI) / 180);
            const want = target.clone().addScaledVector(dir, reach).setY(target.y + avatarHeight * lift);
            const pos = keepInside(want.clone());
            // 被墙挤开太多就不是原来想的构图了
            if (pos.distanceTo(want) > reach * 0.15) continue;
            // 镜头要在说话的人面前（他面朝的那一侧）：邻座两人并排时，站到桌子后面只能拍到两个后脑勺
            const front = new Vector3(pos.x - head.x, 0, pos.z - head.z);
            if (front.dot(facing) < front.length() * 0.25) continue;
            const fov = fitFov(pos, target, points, 1.15);
            if (fov > 48) continue;
            if (!clearView(head, pos) || !headVisible(partnerHead, pos) || personInWay(pos, head, index)) continue;
            if (!foregroundClear(pos, target, clamp(fov, 32, 46))) continue;
            return { pos, target, fov: clamp(fov, 32, 46) };
          }
        }
      }
    }
    return null;
  };

  /**
   * 拍某一个人：镜头在他面朝的那一侧（他对着说话的那群人），斜 20 来度，像对面观众席上的机位。
   * 开口时先试和交流对象同框（pairShot），不行再拍他一个人。
   * 两侧都能拍时选离默认机位近的一侧，镜头大体留在观众这边，不越轴。
   * 被墙或家具挡住就换角度、抬高、拉近；都不行返回 null，退回全景。
   */
  const personShot = (index: number, kind: 'think' | 'speak', listener?: number): Shot | null => {
    const avatarHeight = ctx.getAvatarHeight();
    const anchor = seats[index];
    if (!anchor) return null;
    const spec = FOLLOW[kind];
    const head = anchor.clone().setY(anchor.y + avatarHeight * 0.6);
    const home = vantage();
    const othersIdx = castRef.current.filter((i) => i !== index && seats[i]);
    const others = othersIdx.map((i) => seats[i]);
    const listeners = others.length
      ? others.reduce((sum, seat) => sum.clone().add(seat), new Vector3()).divideScalar(others.length)
      : home;
    // 镜头站在他面朝的那一侧（他对着说话的那群人）：看得到正脸。站到他背后只能拍到后脑勺
    const facing = new Vector3(listeners.x - anchor.x, 0, listeners.z - anchor.z);
    if (facing.lengthSq() < 1e-8) facing.set(home.x - anchor.x, 0, home.z - anchor.z);
    facing.normalize();
    const distance = avatarHeight / (2 * Math.tan((spec.fov * Math.PI) / 360) * spec.frac);
    const sideDistance = (sign: number) => head.clone().addScaledVector(facing.clone().applyAxisAngle(UP, sign * 0.42), distance).distanceTo(home);
    const signs = sideDistance(1) <= sideDistance(-1) ? [1, -1] : [-1, 1];
    if (kind === 'speak') {
      // 开口时尽量和交流对象同框：上一位发言人；没有就取他正前方的人，不取坐在旁边的队友
      const partner = listener !== undefined && listener !== index && seats[listener] ? listener
        : othersIdx
          .map((i) => ({ i, front: seats[i].clone().sub(anchor).setY(0).normalize().dot(facing) }))
          .filter((x) => x.front > 0.35)
          .sort((a, b) => b.front - a.front)[0]?.i;
      const pair = partner === undefined ? null : pairShot(index, partner, head, facing, signs);
      if (pair) return pair;
    }
    // 单人镜头只和他是谁、在想还是在说有关：算过一次就记住，接谁的话都能直接用
    const soloKey = index + ':' + kind;
    if (!soloCache.has(soloKey)) soloCache.set(soloKey, soloShot(index, head, facing, distance, signs, spec.fov));
    return soloCache.get(soloKey) ?? null;
  };
  const soloCache = new Map<string, Shot | null>();
  /** 只拍他一个人：在他面朝的一侧斜开角度，挡住就换角度、抬高、拉近 */
  const soloShot = (index: number, head: Vector3, facing: Vector3, distance: number, signs: number[], fov: number): Shot | null => {
    const avatarHeight = ctx.getAvatarHeight();
    for (const near of [1, 0.8, 0.62]) {
      for (const lift of [0.18, 0.7, 1.3]) {
        for (const angle of [24, 40, 10, 56]) {
          for (const sign of signs) {
            const dir = facing.clone().applyAxisAngle(UP, (sign * angle * Math.PI) / 180);
            const pos = keepInside(head.clone().addScaledVector(dir, distance * near).setY(head.y + avatarHeight * lift));
            if (pos.distanceTo(head) < distance * near * 0.6) continue;
            if (!clearView(head, pos) || personInWay(pos, head, index) || !foregroundClear(pos, head, fov)) continue;
            return { pos, target: head, fov };
          }
        }
      }
    }
    return null;
  };

  const shotCache = new Map<string, Shot | null>();
  const keyOf = (c: StageCue) => (c.seat === null || c.shot === 'wide' ? 'wide:' + castRef.current.join(',') : c.shot + ':' + c.seat + ':' + (c.listener ?? ''));
  const shotFor = (c: StageCue): Shot => {
    const key = keyOf(c);
    if (!shotCache.has(key)) shotCache.set(key, c.seat === null || c.shot === 'wide' ? wideShot() : personShot(c.seat, c.shot, c.listener));
    return shotCache.get(key) ?? shotFor({ seat: null, shot: 'wide' });
  };
  /**
   * 进屋后每帧顺手算一个：全景和每个人「在想」「开口」的机位先进缓存。
   * 找机位要打几十上百条射线，等到有人开口那一帧再算会卡一下
   */
  const warm: StageCue[] = [];
  const warmUp = () => {
    warm.length = 0;
    warm.push({ seat: null, shot: 'wide' });
    for (const i of castRef.current) warm.push({ seat: i, shot: 'think' }, { seat: i, shot: 'speak' });
  };
  /** 画面比例变了：机位缓存清空重算，预热队列也重建 */
  const clearShots = () => {
    shotCache.clear();
    warmUp();
  };

  return { vantage, castSeats, fitFov, wideShot, clearView, headVisible, foregroundClear, roomy, clearLine, blocked, personInWay, keepInside, pairShot, personShot, soloShot, keyOf, shotFor, warm, warmUp, clearShots };
}
