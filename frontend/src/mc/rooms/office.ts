import * as THREE from 'three';
import { SCHEMES } from '../design/scheme';
import type { ScenePlan } from '../design/plan';
import { roundSeatRadius } from '../design/scale';
import { ring, type Zone } from '../design/space';
import { at, binders, blockArmchair, blockBench, blockDesk, blockOfficeChair, blockPlant, blockRoundTable, keyboard, monitor, mug, paper, pendantLantern, printer, roundRug, wallClock } from '../props/furniture';
import type { Point } from './builders';
import type { ActorAnchor } from './debate';
import { MC_SCENE_NAMES } from './names';
import { anchor, finishStage, table } from './shared';
import { studio } from './studio';

/**
 * 办公室分成四块，中间是南北向的主通道：
 * - 北墙：负责人的工位和白板（焦点）
 * - 西北：会议角，六把椅子围着圆桌，地面换一块暖色地毯
 * - 中部：三组面对面的工位岛，岛与岛之间留出大约 2 米
 * - 南端：交换台，也是站会的位置
 * 工位椅只有一种蓝，会议椅只有一种橙。13 个工位的顺序：0 负责人，然后西岛、东岛、中岛各四人。
 */
const S = SCHEMES.office;
const w = 20, d = 15, cx = 11;
const meet = { x: 4.5, z: 4.3, radius: 1.3 };
const meetRing = roundSeatRadius(meet.radius, 0.4);
const lead = { id: 'lead-desk', x: cx, z: 3.6, len: 2.2, dep: 1 };
const islands = [
  { id: 'island-w', x: 5.2, z: 9.4 },
  { id: 'island-e', x: 16.6, z: 9.4 },
  { id: 'island-c', x: 11, z: 9.4 },
];

export const OFFICE_ZONES: Zone[] = [
  { id: 'lead', role: 'focus', min: [9.2, 1.2], max: [12.8, 4.6], note: '负责人的桌子和北墙白板。' },
  { id: 'meeting', role: 'meeting', min: [2, 2], max: [7.2, 6.8], note: '西北会议角，六椅一桌，一块圆毯。' },
  { id: 'desks', role: 'work', min: [2.4, 7.4], max: [18.6, 11.4], note: '三组工位岛，面对面。' },
  { id: 'spine', role: 'circulation', min: [7.4, 5], max: [9.2, 12.5], note: '西岛和中岛之间的主通道，也通向会议角。' },
  { id: 'standup', role: 'stage', min: [8.4, 12.2], max: [13.6, 14.6], note: '南端交换台和站会。' },
];

export const officePlan: ScenePlan = {
  kind: 'office',
  intent: '工作、开会、站会和走访各有一块地，靠通道连起来，不靠盆栽把大地板隔开。',
  scheme: 'office',
  zones: OFFICE_ZONES,
  build: office,
};

function office() {
  const r = studio({
    kind: 'office', title: MC_SCENE_NAMES.office, w, d, material: 'original',
    look: { background: '#bfe3ff', sky: '#fff8ec', ground: '#d9c39a', ambient: 1.05, sun: { color: S.sun, intensity: 3.2, azimuth: 80, elevation: 32, shadow: .92 }, exposure: 1.1, indirect: .18, roof: true, saturation: 1 },
    shell: { floor: S.floor, base: S.base, wall: S.wall, top: S.wall, ceiling: S.ceiling },
    windows: [{ wall: 'north', from: 2, to: 4 }, { wall: 'north', from: 16, to: 18 }],
    open: true, view: { back: 13, height: 12, target: [cx, 1.2, 7.2], fov: 26 },
    build: b => {
      const rug = (x0: number, x1: number, z0: number, z1: number, fill: string) => {
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) b.put(x, 1, z, x === x0 || x === x1 || z === z0 || z === z1 ? 'white_carpet' : fill);
      };
      rug(9, 13, 12, 15, 'yellow_carpet');
      for (const x of [6, 7]) b.put(x, 1, 1, 'bookshelf').put(x, 2, 1, 'bookshelf');
      b.put(6, 3, 1, 'potted_fern');
      b.put(14, 1, 1, 'cartography_table').put(15, 1, 1, 'potted_bamboo');
      b.put(1, 1, 8, 'barrel', { facing: 'up' }).put(1, 2, 8, 'brewing_stand', { has_bottle_0: 'true', has_bottle_1: 'false', has_bottle_2: 'true' });
      b.put(1, 1, 12, 'white_concrete').put(1, 2, 12, 'light_blue_stained_glass');
      b.put(w, 1, 12, 'barrel', { facing: 'west' }).put(w, 1, 13, 'barrel', { facing: 'west' }).put(w, 2, 13, 'lantern');
      for (const [x, z, id] of [[1, 1, 'potted_azalea_bush'], [w, 1, 'potted_flowering_azalea_bush'], [1, 14, 'potted_fern']] as const) b.put(x, 1, z, id);
      
    },
  });
  r.frontal = true;
  r.seatedSpeech = true;
  r.layout.board = { position: [cx, 2.85, 1.05], width: 3.6, height: 1.35 };
  r.boardStyle = 'whiteboard';
  r.boardFrame = 'block/' + S.wood;
  const anchors: ActorAnchor[] = [anchor(lead.x, 2.55, 0, 0)];
  for (const isl of islands) for (const dz of [-.8, .8]) for (const side of [-1, 1]) anchors.push(anchor(isl.x + side * 1.45, isl.z + dz, side < 0 ? Math.PI / 2 : -Math.PI / 2, anchors.length));
  anchors.forEach((a, i) => {
    r.anchors.push(a);
    r.layout.chairs.push({ id: a.chair!, side: 'judge', position: [a.seat[0], 1, a.seat[2]], yaw: a.homeYaw, slide: .18, actor: i });
  });
  table(r, lead.id, lead.x, lead.z, lead.len, lead.dep, .9);
  for (const isl of islands) table(r, isl.id, isl.x, isl.z, 1.6, 3.2, .9);
  table(r, 'exchange-table', cx, 13.7, 2.4, 1.1, .85);
  table(r, 'meeting-table', meet.x, meet.z, meet.radius * 2, meet.radius * 2, .9, 'round');
  const meeting: ActorAnchor[] = [];
  ring(meet.x, meet.z, meetRing, 6, -Math.PI / 2).forEach((p, i) => {
    const a = anchor(p.x, p.z, p.yaw, i);
    a.chair = 'meeting-chair-' + i;
    meeting.push(a);
    r.layout.chairs.push({ id: a.chair, side: 'judge', position: [p.x, 1, p.z], yaw: a.homeYaw, slide: 0, style: 'armchair' });
  });
  const visits: Point[] = anchors.map((a, i) => i === 0 ? [lead.x + 1.7, 1, lead.z] : [a.seat[0], 1, a.seat[2] + (a.seat[2] < islands[Math.floor((i - 1) / 4)].z ? -1 : 1)]);
  r.work = { visits, meeting, huddle: { center: [cx, 1, 13.7], rx: 3.6, rz: 1.3 }, overflow: [7.4, 1, 4.3] };
  const screens: THREE.MeshStandardMaterial[] = [];
  r.makeChair = (k, c) => c.style === 'armchair' ? blockArmchair(k, S.accent, S.wood) : blockOfficeChair(k, S.fabric);
  r.lights = [
    ...([[5.2, 4.3], [5.2, 9.4], [11, 9.4], [16.6, 9.4]] as const).map(([x, z]) => ({ position: [x, 3.85, z] as Point, length: .4, intensity: 2.1, distance: 8, kind: 'lantern' as const, shadow: false, color: S.lamp })),
    { position: [20.5, 2.6, 12.5], length: .2, intensity: 1, distance: 5, kind: 'lantern', shadow: false, color: S.lamp },
  ];
  r.decorate = (k, root) => {
    for (const t of r.layout.tables) {
      const top = t.center[1] + t.height + .01;
      if (t.shape === 'round') {
        root.add(at(roundRug(k, 2.35, '#e6a15a', '#f3ecdf', .16), t.center[0], 1, t.center[2]));
        root.add(at(blockRoundTable(k, meet.radius, t.height, S.wood, S.trimLog), ...t.center));
        root.add(at(blockPlant(k, .42, 'azalea_leaves', 'terracotta', 9), t.center[0], top, t.center[2]));
        root.add(at(pendantLantern(k, 1.15, .34), t.center[0], 3.85, t.center[2]));
        continue;
      }
      if (t.id === 'exchange-table') {
        root.add(at(blockDesk(k, t.length, t.depth, t.height, 'spruce_planks', S.trimLog), ...t.center));
        root.add(at(printer(k, .62, .28, .46), t.center[0] + .55, top, t.center[2]));
        for (const dx of [-.7, -.35]) root.add(at(paper(k), t.center[0] + dx, top, t.center[2] + .05, dx));
        continue;
      }
      if (t.id === lead.id) {
        root.add(at(blockDesk(k, t.length, t.depth, t.height, S.wood, S.trimLog), ...t.center));
        const screen = k.mat('#d5e4ea', { emissive: '#e7f3f6', glow: .16 });
        screens.push(screen);
        root.add(at(monitor(k, screen), t.center[0] - .25, top, t.center[2] + .15, Math.PI));
        root.add(at(keyboard(k), t.center[0] - .25, top, t.center[2] - .22, Math.PI));
        root.add(at(mug(k, '#efe6d6'), t.center[0] + .55, top, t.center[2] - .15));
        root.add(at(binders(k, ['#d7d2c8', '#c5d0d6', '#e6d3b4'], 3), t.center[0] + .85, top, t.center[2] + .2));
        continue;
      }
      root.add(at(blockDesk(k, t.length, t.depth, t.height, 'birch_planks', 'white_concrete'), ...t.center));
      root.add(at(pendantLantern(k, 1.15, .3), t.center[0], 3.85, t.center[2]));
      k.block(root, .06, .36, t.depth - .2, { side: 'block/white_stained_glass' }, t.center[0], top + .18, t.center[2]);
      for (const a of anchors) {
        const [x, , z] = a.seat;
        if (Math.abs(x - t.center[0]) > 1.6 || Math.abs(z - t.center[2]) > 1.7 || a === anchors[0]) continue;
        const toward = x < t.center[0] ? 1 : -1;
        const screen = k.mat('#d5e4ea', { emissive: '#e7f3f6', glow: .14 });
        screens.push(screen);
        root.add(at(monitor(k, screen), t.center[0] - toward * .32, top, z, toward > 0 ? -Math.PI / 2 : Math.PI / 2));
        root.add(at(keyboard(k), t.center[0] - toward * .62, top, z, toward > 0 ? -Math.PI / 2 : Math.PI / 2));
      }
    }
    root.add(at(wallClock(k, '#8a5a34', .26), cx, 4.15, 1.06));
    root.add(at(blockBench(k, 2.2, S.fabric, S.wood), 19.4, 1, 13.4, -Math.PI / 2));
    k.painting(root, 'sea', 1.4, .7, 1.04, 3, 6, Math.PI / 2);
  };
  r.animate = now => { const v = .16 + .04 * Math.sin(now / 700); for (const m of screens) m.emissiveIntensity = v; };
  r.judge = [cx, 2.6, d + .6];
  r.judgeTarget = [cx, 1.6, 6];
  return finishStage(r, [[1.4, 4.9, 1], [20.6, 4.9, 1], [meet.x, 2.2, meet.z], [cx, 1.2, 13.7]]);
}
