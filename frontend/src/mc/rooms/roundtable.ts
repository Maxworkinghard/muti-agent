import { SCHEMES } from '../design/scheme';
import { roundSeatRadius } from '../design/scale';
import { ring, type Zone } from '../design/space';
import type { ScenePlan } from '../design/plan';
import { at, blockArmchair, blockRoundTable, centerpiece, paper, pendantLantern, roundRug, trim } from '../props/furniture';
import type { Point } from './builders';
import { studio } from './studio';
import { MC_SCENE_NAMES } from './names';
import { anchor, finishStage, seat, table } from './shared';

/**
 * 圆桌会议室。空间只有三块：围合的一圈座位、北墙的话题、两侧的书。
 * 桌子直径 3.2 米，座位环比桌沿多 0.35 米，地毯盖住拉开的椅子。
 * 座位转过 22.5°，正南和正北留出空当：镜头从南面两人之间看进去，话题板不被北面的人挡住。
 */
const S = SCHEMES.study;
const w = 11, d = 9, cx = 6.5, cz = 5;
const tableRadius = 1.6, gap = 0.35, ringR = roundSeatRadius(tableRadius, gap);

export const ROUNDTABLE_ZONES: Zone[] = [
  { id: 'circle', role: 'meeting', min: [cx - 2.7, cz - 2.7], max: [cx + 2.7, cz + 2.7], note: '圆桌、八把椅子和地毯。这是唯一的活动中心。' },
  { id: 'topic', role: 'focus', min: [cx - 1.6, 1], max: [cx + 1.6, 1.2], note: '北墙话题板，在两扇窗之间。' },
  { id: 'books', role: 'work', min: [1, 1], max: [w, 1.2], note: '两角书架，不进会议圈。' },
  { id: 'approach', role: 'circulation', min: [cx - 1.2, cz + 2.2], max: [cx + 1.2, d], note: '南面两人之间的进场空当。' },
];

export const roundtablePlan: ScenePlan = {
  kind: 'roundtable',
  intent: '八个人围着一张够得着的圆桌说话。房间只负责把这张桌子围住，不另做第二焦点。',
  scheme: 'study',
  zones: ROUNDTABLE_ZONES,
  build: roundtable,
};

function roundtable() {
  const fabric = { tex: S.fabric, tint: '#5873b3' };
  const rug = { tex: 'block/white_wool', field: '#a3c19d', edge: '#efe4cc' };
  const plant = { pot: 'block/terracotta', leaves: 'block/moss_block', flower: 'block/pink_wool' };
  const lamp = { metal: 'block/polished_blackstone', glow: 'block/glowstone', light: S.lamp };
  const r = studio({
    kind: 'roundtable', title: MC_SCENE_NAMES.roundtable, w, d, material: 'original',
    look: { background: '#bfe3ff', sky: '#fff6ea', ground: '#e3cfa4', ambient: 1.3, sun: { color: S.sun, intensity: 3.6, azimuth: 125, elevation: 34, shadow: .9 }, exposure: 1.18, indirect: .18, roof: true, saturation: 1 },
    shell: { floor: S.floor, base: S.base, wall: S.wall, top: S.wall, ceiling: S.ceiling },
    windows: [{ wall: 'north', from: 2, to: 3 }, { wall: 'north', from: 9, to: 10 }],
    open: true, view: { back: 4.5, height: 6, target: [cx, 1.25, cz], fov: 30 },
    build: b => { for (const x of [1, 11]) b.put(x, 1, 1, 'bookshelf').put(x, 2, 1, 'bookshelf').put(x, 3, 1, 'potted_azalea_bush'); },
  });
  r.layout.board = { position: [cx, 2.75, 1.05], width: 3.2, height: 1.5 };
  r.boardStyle = 'cork';
  r.boardFrame = 'block/' + S.wood;
  table(r, 'round-table', cx, cz, tableRadius * 2, tableRadius * 2, .95, 'round');
  ring(cx, cz, ringR, 8, -Math.PI / 2 + Math.PI / 8).forEach((p, i) => seat(r, anchor(p.x, p.z, p.yaw, i), i, 'armchair'));
  r.makeChair = k => blockArmchair(k, fabric.tex, S.wood, fabric.tint);
  const lamps: Point[] = [[cx - 1.4, 3.85, cz + .2], [cx + 1.4, 3.85, cz + .2]];
  r.lights = lamps.map(p => ({ position: p, length: .3, intensity: 1.6, distance: 7, kind: 'lantern' as const, shadow: false, color: lamp.light }));
  r.decorate = (k, root) => {
    const planks = 'block/' + S.wood;
    root.add(at(roundRug(k, 2.65, rug.field, rug.edge, .14, rug.tex), cx, 1, cz));
    root.add(at(blockRoundTable(k, tableRadius, .95, S.wood, S.trimLog), cx, 1, cz));
    root.add(at(centerpiece(k, .75, plant.pot, plant.leaves, plant.flower), cx, 1.95, cz));
    for (const a of r.anchors) {
      const dx = a.seat[0] - cx, dz = a.seat[2] - cz, l = Math.hypot(dx, dz);
      root.add(at(paper(k), cx + dx / l * 1.15, 1.952, cz + dz / l * 1.15, Math.atan2(dx, dz)));
    }
    for (const p of lamps) root.add(at(pendantLantern(k, 5 - p[1], .36, lamp.metal, lamp.glow), ...p));
    const W = w + 1;
    root.add(at(trim(k, W - 1, .2, .06, planks), cx, 4.9, 1.03));
    root.add(at(trim(k, W - 1, .14, .05, planks), cx, 1.07, 1.025));
    for (const [x, yaw] of [[1.03, Math.PI / 2], [W - .03, -Math.PI / 2]] as const) {
      root.add(at(trim(k, d, .2, .06, planks), x, 4.9, 1 + d / 2, yaw));
      root.add(at(trim(k, d, .14, .05, planks), x, 1.07, 1 + d / 2, yaw));
    }
    for (const x0 of [2, 9]) {
      const xc = x0 + 1;
      root.add(at(trim(k, 2.2, .1, .08, planks), xc, 4.05, 1.04));
      root.add(at(trim(k, 2.3, .12, .16, planks), xc, 1.98, 1.07));
      for (const s of [-1, 1]) root.add(at(trim(k, .1, 2.1, .08, planks), xc + s * 1.05, 3, 1.04));
    }
    for (const x of [1.06, W - .06]) k.block(root, .12, 4, .12, { side: 'block/' + S.trimLog, top: 'block/' + S.trimLog + '_top' }, x, 3, 1.06);
    k.painting(root, 'sunset', 1.6, .8, 1.04, 2.9, 5.5, Math.PI / 2, planks);
    k.painting(root, 'sea', 1.6, .8, W - .04, 2.9, 5.5, -Math.PI / 2, planks);
  };
  r.judge = [cx, 3.5, d + .6];
  r.judgeTarget = [cx, 2.2, cz - 1.6];
  r.seatedSpeech = true;
  return finishStage(r, [[cx, 4.9, 1], [1.5, 4.1, 1.3], [11.5, 4.1, 1.3], [cx, 1, cz + 2.65]]);
}
