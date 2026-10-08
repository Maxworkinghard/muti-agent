import * as THREE from 'three';
import { SCHEMES } from '../design/scheme';
import type { ScenePlan } from '../design/plan';
import type { Zone } from '../design/space';
import { at, blockDesk, blockSeat, chalkboard, mug, openBook, paper, wallClock } from '../props/furniture';
import { MC_SCENE_NAMES } from './names';
import { anchor, finishStage, seat, table } from './shared';
import { studio } from './studio';

/**
 * 教室。北墙是讲授面（黑板、讲台、老师）。七个学生坐两排，不摆没人的空椅。
 * 左右各一列，中间一条通道正对黑板，南面镜头不会被人挡住辩题。前排每侧两人，后排左侧两人、右侧一人。
 * 座位只有一种浅蓝布。
 */
const S = SCHEMES.classroom;
const w = 17, d = 12, cx = 9.5;

export const CLASSROOM_ZONES: Zone[] = [
  { id: 'teaching', role: 'focus', min: [cx - 2.6, 1], max: [cx + 2.6, 4.2], note: '黑板、讲台和老师站位。' },
  { id: 'class', role: 'audience', min: [2, 5.6], max: [w - 1, 11], note: '左右两列、各两排，椅子和人一样多。' },
  { id: 'aisle', role: 'circulation', min: [6.2, 5.2], max: [12.8, 12], note: '正对黑板的通道，不放人。' },
];

export const classroomPlan: ScenePlan = {
  kind: 'classroom',
  intent: '老师在北墙讲，学生朝黑板坐。通道比桌缝宽，座位布料只有一种。',
  scheme: 'classroom',
  zones: CLASSROOM_ZONES,
  build: classroom,
};

function classroom() {
  const frame = '#5a3c26';
  const r = studio({
    kind: 'classroom', title: MC_SCENE_NAMES.classroom, w, d, material: 'original',
    look: { background: '#bfe3ff', sky: '#fff8ec', ground: '#e6d3ae', ambient: 1.05, sun: { color: S.sun, intensity: 3.4, azimuth: 168, elevation: 21, shadow: .94 }, exposure: 1.1, indirect: .16, roof: true, saturation: 1 },
    shell: { floor: S.floor, base: S.base, wall: S.wall, top: S.wall, ceiling: S.ceiling },
    windows: [{ wall: 'west', from: 3, to: 5 }, { wall: 'west', from: 8, to: 10 }],
    open: true, view: { back: 12, height: 9.5, target: [cx, 1.4, 6.2], fov: 30 },
    build: b => {
      b.put(9, 1, 3, 'lectern', { facing: 'north', has_book: 'true', powered: 'false' });
      for (const [y, half] of [[1, 'lower'], [2, 'upper']] as const) b.put(w + 1, y, 2, 'oak_door', { facing: 'west', half, hinge: 'left', open: 'false' });
      b.put(1, 1, 1, 'cauldron').put(w, 1, 1, 'bookshelf').put(w, 2, 1, 'potted_cactus');
      for (const [x, z, id] of [[w, 11, 'potted_azalea_bush'], [1, 11, 'potted_flowering_azalea_bush'], [w, 6, 'potted_bamboo']] as const) b.put(x, 1, z, id);
    },
  });
  r.frontal = true;
  r.layout.board = { position: [cx, 2.75, 1.05], width: 5, height: 1.6 };
  r.boardStyle = 'chalk';
  r.boardFrame = frame;
  r.layout.podium.position = [cx, 1, 3.5];
  r.host = [cx, 1, 2.75];
  seat(r, anchor(cx, 2.75, 0, 0, true), 0);
  r.standingSeats = [0];
  const desks: Array<{ x: number; z: number; len: number; seats: number[] }> = [
    { x: 4.2, z: 6.5, len: 2.4, seats: [-.55, .55] },
    { x: 14.8, z: 6.5, len: 2.4, seats: [-.55, .55] },
    { x: 4.2, z: 9.2, len: 2.4, seats: [-.55, .55] },
    { x: 14.8, z: 9.2, len: 1.6, seats: [0] },
  ];
  let actor = 1;
  for (const desk of desks) {
    table(r, 'student-desk-' + actor, desk.x, desk.z, desk.len, .62, .78);
    for (const o of desk.seats) seat(r, anchor(desk.x + o, desk.z + .78, Math.PI, actor), actor++);
  }
  r.makeChair = k => blockSeat(k, S.fabric);
  r.decorate = (k, root) => {
    r.layout.tables.forEach((t, ti) => {
      root.add(at(blockDesk(k, t.length, t.depth, t.height, S.wood, 'polished_blackstone'), ...t.center));
      const top = t.center[1] + t.height + .02;
      if (ti % 3 !== 2) root.add(at(mug(k, '#f4efe4'), t.center[0] + .2, top, t.center[2]));
      if (ti % 2 === 0) root.add(at(paper(k, .22, .14), t.center[0] - .5, top, t.center[2] - .1, ti * .2));
      if (ti % 4 === 1) root.add(at(openBook(k), t.center[0] + .7, top, t.center[2] + .05, .3));
    });
    for (const x of [4.2, 14.8]) root.add(at(chalkboard(k, 2.4, 1.2, frame, x), x, 2.75, 1.04));
    root.add(at(wallClock(k, '#c4553a', .3), cx, 4.15, 1.06));
    k.painting(root, 'sunset', 1.6, .8, 1.04, 2.95, 7, Math.PI / 2);
    const g = new THREE.Group();
    k.block(g, 3.4, 1.5, .06, { side: 'block/spruce_planks' });
    k.box(g, 3.2, 1.3, .02, '#c99a62', 0, 0, .035, .01, false);
    for (const [x, y, col, ww, hh] of [[-1.1, .25, '#fff8ea', .7, .5], [-.25, .3, '#efe4cc', .6, .45], [.55, .2, '#e7eef2', .75, .55], [1.25, .3, '#fff3b0', .45, .4], [-.9, -.35, '#e4efe4', .8, .4], [.1, -.3, '#fff8ea', .7, .45], [.95, -.35, '#f3e0cc', .6, .4]] as const) k.box(g, ww, hh, .01, col, x, y, .05, .004, false);
    g.position.set(17.97, 2.75, 8.3);
    g.rotation.y = -Math.PI / 2;
    root.add(g);
  };
  r.judge = [cx, 2.6, d + .6];
  r.judgeTarget = [cx, 1.8, 4];
  r.seatedSpeech = false;
  return finishStage(r);
}
