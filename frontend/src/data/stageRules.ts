import type { Participant, SceneDef } from '../types';

/**
 * 台上的规矩：人走到哪、走多久、一句话在气泡里停多久。
 * 前端照它画走路动画，后端（server/work.ts）照它排谁什么时候开口、什么时候起身，两边用同一份才对得上
 * （比如“人走到了才开口”：后端按 walkMs 等，前端按 walkMs 走）。
 */

type Point = { x: number; y: number };
/** 离开工位的人此刻在哪（二维百分比坐标）；sit 表示坐在会议室的椅子上，否则站着 */
export interface Away { x: number; y: number; sit?: boolean }

/** 走路速度：每秒走多少（以舞台高度的百分比计，横向按 3:2 折算）。从办公室一头走到另一头两秒多 */
const WALK_SPEED = 55;
/** 一趟路至少、至多走多久：起身、转身也要时间；再远也不让人等太久 */
const WALK_MIN_MS = 700;
const WALK_MAX_MS = 2600;

/** 从 from 走到 to 要多久（毫秒）；原地不动是 0 */
export function walkMs(from: Point, to: Point): number {
  const distance = Math.hypot((to.x - from.x) * 1.5, to.y - from.y);
  if (distance < 0.5) return 0;
  return Math.round(Math.min(WALK_MAX_MS, Math.max(WALK_MIN_MS, (distance / WALK_SPEED) * 1000)));
}

/** 一句话在气泡里要停多久才看得完：按气泡能露出的字数（四行左右）算，短句也留够反应的时间 */
export function readMs(text: string): number {
  return Math.min(7000, Math.max(2500, 1800 + Math.min(text.length, 80) * 70));
}

/**
 * 站会圈上第 i 个人（共 n 人）的位置，第 0 个在桌后正中。沿椭圆按实际弧长均分：舞台是 3:2，
 * x 的百分比按 1.5 倍折成和 y 同一尺度；按角度均分的话，扁椭圆两侧的人会上下挤成一摞、名牌互相挡住。
 */
export function huddleSpot(h: { x: number; y: number; rx: number; ry: number }, i: number, n: number): Point {
  const steps = 720;
  const at = (k: number) => {
    const a = -Math.PI / 2 + (k / steps) * 2 * Math.PI;
    return { x: h.x + h.rx * Math.cos(a), y: h.y + h.ry * Math.sin(a) };
  };
  const length = [0];
  for (let k = 1; k <= steps; k++) {
    const a = at(k - 1), b = at(k);
    length.push(length[k - 1] + Math.hypot((b.x - a.x) * 1.5, b.y - a.y));
  }
  const goal = (length[steps] * Math.max(0, i)) / Math.max(1, n);
  return at(Math.max(0, length.findIndex((l) => l >= goal)));
}

/**
 * 工作模式的走动：算出这个人要去的位置。desk 回工位（从表里删掉）；huddle 围着中央交换台站一圈，负责人站在桌后正中；
 * meeting 坐进会议室空着的椅子；其他值是同事的 agentId，站到那位同事工位旁的过道上。场景没有 stations 时不动。
 */
export function placeAway(scene: SceneDef, cast: Participant[], away: Record<string, Away>, agentId: string, to: string): Record<string, Away> {
  const st = scene.stations;
  if (!st) return away;
  const { [agentId]: _, ...rest } = away;
  if (to === 'desk') return rest;
  if (to === 'huddle') {
    const ring = [...cast].sort((a, b) => Number(!!b.isLead) - Number(!!a.isLead));
    return { ...rest, [agentId]: huddleSpot(st.huddle, ring.findIndex((p) => p.agentId === agentId), ring.length) };
  }
  if (to === 'meeting') {
    const taken = (c: Point) => Object.values(rest).some((a) => a.sit && a.x === c.x && a.y === c.y);
    const chair = st.meeting.find((c) => !taken(c));
    if (chair) return { ...rest, [agentId]: { ...chair, sit: true } };
    // 椅子坐满了：站在会议桌下方那片空地上，一个挨一个往右排
    const extra = Object.values(rest).filter((a) => !a.sit && a.y > st.meeting[1].y).length;
    return { ...rest, [agentId]: { x: st.meeting[3].x + extra * 4.5, y: st.meeting[1].y + 6 } };
  }
  const host = cast.find((p) => p.agentId === to);
  const spot = host && (st.visits[host.seatIndex] ?? scene.seats[host.seatIndex]);
  if (!spot) return away;
  // 后端一次只让一个人来找他；万一位置上已经站着人，就挪开一个身位
  const crowded = Object.values(rest).some((a) => !a.sit && Math.abs(a.x - spot.x) < 2 && Math.abs(a.y - spot.y) < 2);
  return { ...rest, [agentId]: { x: spot.x + (crowded ? 4.5 : 0), y: spot.y } };
}

/** 这个人此刻在台上的位置：离开了工位就是 away 里的位置，否则是他的座位 */
export function spotOf(scene: SceneDef, p: Participant, away: Record<string, Away>): Point {
  return away[p.agentId] ?? scene.seats[p.seatIndex] ?? { x: 50, y: 50 };
}
