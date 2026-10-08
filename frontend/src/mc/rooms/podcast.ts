import * as THREE from 'three';
import type { ScenePlan } from '../design/plan';
import type { Zone } from '../design/space';
import { acousticPanel, armchair, at, floorLamp, micStand, mug, onAirSign, paper, plant, radio, roundLeafPlant, sconce, shelf, sideTable, type Kit } from '../props/furniture';
import { pattern, shade } from '../style';
import { MC_SCENE_NAMES } from './names';
import { anchor, finishStyled, seat } from './shared';
import { floors, studio, TEX } from './studio';

/**
 * 播客访谈间保持平涂布景：两位嘉宾、两把椅子、一张茶几、两支话筒、一块话题。
 * 这间不改成方块建筑。上一轮画面里这间是被认可的，重构只把它收成明确的分区，不换造型。
 */
const C = { wall: '#F0E6D2', stripe: '#ebcc9e', panel: '#d4a86a', rail: '#a87840', cap: '#8a5a34', outline: '#2b2136', floor: '#c39962', seam: '#a87840', plank: '#d4a86a', rug: '#3d8bff', gold: '#f0c84a', host: '#ff7a2f', guest: '#3d8bff', leaf: '#3dba6e' };
const w = 12, d = 8, cx = 7;

export const PODCAST_ZONES: Zone[] = [
  { id: 'talk', role: 'meeting', min: [4.2, 4.4], max: [9.8, 6.2], note: '两把椅子和中间的茶几。' },
  { id: 'backdrop', role: 'focus', min: [3, 1], max: [11, 1.3], note: 'ON AIR、话题板和两侧置物。' },
  { id: 'wing', role: 'threshold', min: [1.4, 5.8], max: [2.8, 7.2], note: '角落的植物，不进谈话圈。' },
];

export const podcastPlan: ScenePlan = {
  kind: 'podcast',
  intent: '两个人面对面谈话。椅子、茶几、话筒和灯是全部道具，背景只说明这是一间访谈间。',
  scheme: 'podcast',
  zones: PODCAST_ZONES,
  build: podcast,
};

function bookRow(k: Kit, colors: string[]) {
  const g = new THREE.Group();
  let x = -.4;
  colors.forEach((c, i) => { const h = .24 + (i % 3) * .05; k.box(g, .09, h, .18, c, x, h / 2, 0, .01); x += .1; });
  return g;
}

function podcast() {
  const r = studio({
    kind: 'podcast', title: MC_SCENE_NAMES.podcast, w, d,
    palette: { floor: C.floor, wall: C.wall, base: C.panel, cap: C.cap, outline: C.outline, post: C.rail, ceiling: '#f3e6cc', frame: C.cap },
    look: { background: '#3a2840', sky: '#fff6ea', ground: C.floor, ambient: 1.38, sun: { color: '#ffe8c8', intensity: 1.35, azimuth: -105, elevation: 48, shadow: .28 }, exposure: 1.16, indirect: .16 },
    rows: ['brown_concrete', 'white_concrete', 'white_concrete', 'white_concrete'],
    paint: {
      [TEX.wall]: pattern.stripes(C.wall, C.stripe, 4, 2),
      [TEX.base]: pattern.panel(C.panel, shade(C.panel, .78), shade(C.panel, .9)),
      [TEX.post]: q => { q.fill(C.panel).rect(0, 0, 16, 3, C.rail).rect(0, 3, 16, 1, shade(C.rail, 1.25)).rect(2, 6, 12, 8, shade(C.panel, .8)).rect(3, 7, 10, 6, shade(C.panel, .92)); },
      [TEX.capSide]: q => { q.fill(C.cap).rect(0, 0, 16, 2, shade(C.cap, 1.15)).rect(0, 14, 16, 2, shade(C.cap, .75)); },
      [TEX.capSide2]: q => { q.fill(C.cap).rect(0, 0, 16, 2, shade(C.cap, 1.15)).rect(0, 14, 16, 2, shade(C.cap, .75)); },
    },
    open: true, view: { back: 3.6, height: 3.6, target: [cx, 2.05, 4.2], fov: 36 },
    floorArt: (c, width, depth) => { floors.planks(c, width, depth, C.floor, C.seam, C.plank, 12); floors.rug(c, 2.6, 2.4, 8.8, 3.9, C.rug, C.gold, 4); },
  });
  r.seatedSpeech = true;
  r.boardStyle = 'onair';
  r.boardFrame = C.gold;
  r.layout.board = { position: [cx, 2.55, 1.05], width: 2.9, height: 1.05 };
  const seats: Array<[number, number, number]> = [[4.7, 5.1, .45], [9.3, 5.1, -.45]];
  seats.forEach(([x, z, yaw], i) => seat(r, anchor(x, z, yaw, i), i, 'armchair'));
  r.makeChair = (k, c) => armchair(k, c.actor === 1 ? C.guest : C.host, '#6c4830');
  r.lights = [
    { position: [4.6, 3.35, 1.4], length: .3, intensity: 1.6, distance: 6, kind: 'lantern', shadow: false },
    { position: [9.4, 3.35, 1.4], length: .3, intensity: 1.6, distance: 6, kind: 'lantern', shadow: false },
    { position: [11.8, 2.7, 6.6], length: .3, intensity: 2.2, distance: 6, kind: 'lantern', shadow: false },
  ];
  r.decorate = (k, root) => {
    root.add(at(sideTable(k, '#9c6c48'), cx, 1, 5.4));
    root.add(at(mug(k, '#fbfaf4'), cx - .15, 1.55, 5.35));
    root.add(at(mug(k, '#9fd3ea'), cx + .18, 1.55, 5.45));
    root.add(at(paper(k, .24, .14), cx, 1.552, 5.62));
    for (const [x, z] of seats) { const sx = x + (x < cx ? .95 : -.95), sz = z + .95; root.add(at(micStand(k), sx, 1, sz, Math.atan2(x - sx, z - sz))); }
    root.add(at(onAirSign(k), cx, 3.72, 1.06));
    for (const x of [3.1, 10.9]) { root.add(at(acousticPanel(k), x, 3.35, 1.05)); root.add(at(shelf(k, 1.7, '#7a5232'), x, 2.2, 1.14)); }
    root.add(at(bookRow(k, ['#c4553a', '#e6c56a', '#3d6fbf', '#3d8a5a', '#fff8ea']), 2.6, 2.23, 1.14));
    root.add(at(plant(k, C.leaf, '#d07a4f', .4, 3), 3.8, 2.23, 1.14));
    root.add(at(radio(k), 10.5, 2.23, 1.14));
    root.add(at(bookRow(k, ['#3d6fbf', '#e6c56a', '#c4553a', '#3d8a5a']), 11.4, 2.23, 1.14));
    for (const x of [4.6, 9.4]) root.add(at(sconce(k), x, 3.2, 1.04));
    root.add(at(floorLamp(k), 11.8, 1, 6.6));
    root.add(at(roundLeafPlant(k, C.leaf, '#d07a4f', 1.1), 2.1, 1, 6.3));
  };
  r.judge = [cx, 2.4, 8.3];
  r.judgeTarget = [cx, 2, 2];
  finishStyled(r);
  r.fit = r.fit.filter(p => p[2] <= d - 1);
  r.fit.push([2.4, 1, 7.4], [11.6, 1, 7.4]);
  return r;
}
