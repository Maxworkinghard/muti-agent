import * as THREE from 'three';
import type { ScenePlan } from '../design/plan';
import type { Zone } from '../design/space';
import { at, openBook, signPosts, teacup } from '../props/furniture';
import { seeded } from '../style';
import { Builder } from './builders';
import type { Room } from './debate';
import { MC_SCENE_NAMES } from './names';
import { anchor, finishStyled, seat } from './shared';

/**
 * 草地野餐。地形是写死的几块，不是满地撒点：
 * 一条土路、一汪池塘、北面一排树、南面空出给镜头、中间一块黄白野餐布。
 * 草和花只出现在点名的草地上，同一格每次生成都一样。
 */
const cx = 16, cz = 12;

export const MEADOW_ZONES: Zone[] = [
  { id: 'picnic', role: 'meeting', min: [13, 9], max: [19, 16], note: '黄白野餐布和八个树桩座位。' },
  { id: 'path', role: 'circulation', min: [3, -16], max: [14, 40], note: '从镜头左下方弯进树林的土路。' },
  { id: 'pond', role: 'landscape', min: [19, 14], max: [32, 26], note: '东边的池塘、睡莲和甘蔗。' },
  { id: 'treeline', role: 'landscape', min: [-6, -16], max: [42, 2], note: '北面的树，给天空留出下沿。' },
  { id: 'foreground', role: 'threshold', min: [8, 22], max: [24, 40], note: '镜头前留空，不长高草。' },
];

export const meadowPlan: ScenePlan = {
  kind: 'meadow',
  intent: '一块能坐下的草地，路、水、树和花各占一块，不把植物撒满整张地图。',
  scheme: 'meadow',
  zones: MEADOW_ZONES,
  build: meadow,
};

const TREES: Array<[number, number, 'oak' | 'birch' | 'cherry', number, number]> = [
  [-3, 1, 'birch', 6, 1.5], [2, -8, 'oak', 8, 2.4], [8, -2, 'birch', 7, 1.6], [12, -11, 'oak', 6, 2],
  [17, -5, 'oak', 8, 2.6], [22, -12, 'birch', 7, 1.6], [27, -3, 'cherry', 5, 2.3], [32, -9, 'oak', 6, 2],
  [38, -2, 'birch', 7, 1.5], [6, -16, 'oak', 7, 2.1], [15, -17, 'birch', 8, 1.5], [29, -16, 'oak', 6, 2],
  [-8, 20, 'birch', 6, 1.5], [37, 14, 'cherry', 5, 2],
];

/** 点名的草地。每块写清种什么，步长固定，不靠随机密度。 */
const BEDS: Array<{ x0: number; z0: number; x1: number; z1: number; plant: string; step: number; tall?: boolean }> = [
  { x0: 2, z0: 4, x1: 8, z1: 10, plant: 'short_grass', step: 2 },
  { x0: 28, z0: 4, x1: 36, z1: 10, plant: 'short_grass', step: 2 },
  { x0: 4, z0: -8, x1: 16, z1: -2, plant: 'short_grass', step: 1 },
  { x0: 28, z0: -6, x1: 38, z1: 0, plant: 'fern', step: 2 },
  { x0: -4, z0: 8, x1: 2, z1: 16, plant: 'tall_grass', step: 2, tall: true },
  { x0: 30, z0: 8, x1: 36, z1: 14, plant: 'bush', step: 3 },
  { x0: 6, z0: 16, x1: 10, z1: 20, plant: 'oxeye_daisy', step: 2 },
  { x0: 6, z0: 16, x1: 10, z1: 20, plant: 'azure_bluet', step: 3 },
  { x0: 22, z0: 16, x1: 27, z1: 21, plant: 'poppy', step: 2 },
  { x0: 22, z0: 16, x1: 27, z1: 21, plant: 'pink_tulip', step: 3 },
  { x0: 10, z0: 2, x1: 14, z1: 6, plant: 'dandelion', step: 2 },
  { x0: 26, z0: 2, x1: 31, z1: 6, plant: 'cornflower', step: 2 },
  { x0: 18, z0: 18, x1: 22, z1: 22, plant: 'allium', step: 2 },
];

function meadow(): Room {
  const b = new Builder(), rnd = seeded(2026);
  const X0 = -16, X1 = 48, Z0 = -16, Z1 = 40;
  b.fill(X0, X1, 0, 0, Z0, Z1, 'grass_block', { snowy: 'false' });
  const taken = new Set<string>(), cell = (x: number, z: number) => x + ',' + z, mark = (x: number, z: number) => taken.add(cell(x, z));
  const path: [number, number][] = [[8, 40], [9.5, 31], [11.5, 23], [12, 17], [11, 11], [8.5, 5], [5.5, -2], [3, -16]];
  const pathX = (z: number) => {
    for (let i = 0; i < path.length - 1; i++) {
      const [xa, za] = path[i], [xb, zb] = path[i + 1];
      if (z <= za && z >= zb) { const t = (za - z) / (za - zb); return xa + (xb - xa) * t; }
    }
    return path.at(-1)![0];
  };
  for (let z = Z0; z <= Z1; z++) {
    const x = Math.round(pathX(z));
    for (let dx = -1; dx <= 1; dx++) {
      const id = dx !== 0 && rnd() < .25 ? 'grass_block' : rnd() < .12 ? 'coarse_dirt' : 'dirt_path';
      if (id !== 'grass_block') b.put(x + dx, 0, z, id);
      mark(x + dx, z);
    }
  }
  const pond = (x: number, z: number, grow = 0) => ((x + .5 - 25.5) / (4.2 + grow)) ** 2 + ((z + .5 - 20) / (3.2 + grow)) ** 2 <= 1;
  for (let x = 19; x <= 32; x++) for (let z = 14; z <= 26; z++) {
    if (pond(x, z)) { b.put(x, 0, z, 'water', { level: '0' }).put(x, -1, z, 'dirt'); mark(x, z); }
    else if (pond(x, z, 1)) { b.put(x, 0, z, rnd() < .6 ? 'sand' : 'gravel'); mark(x, z); }
  }
  for (let x = 19; x <= 32; x++) for (let z = 14; z <= 26; z++) if (pond(x, z) && rnd() < .16 && !pond(x, z - 1)) b.put(x, 1, z, 'lily_pad');
  for (const [x, z, h] of [[21, 17, 3], [22, 17, 2], [29, 22, 3], [21, 22, 2]] as const) {
    for (let y = 1; y <= h; y++) b.put(x, y, z, 'sugar_cane', { age: '0' });
    mark(x, z);
  }
  for (let x = 14; x <= 17; x++) for (let z = 10; z <= 13; z++) {
    mark(x, z);
    if ((x === 15 || x === 16) && (z === 11 || z === 12)) continue;
    b.put(x, 1, z, (x + z) % 2 ? 'yellow_carpet' : 'white_carpet');
  }
  b.put(15, 1, 11, 'cake', { bites: '0' }).put(16, 1, 12, 'potted_poppy').put(16, 1, 11, 'lantern', { hanging: 'false', waterlogged: 'false' }).put(15, 1, 12, 'white_carpet');
  for (let i = 0; i < 8; i++) {
    const q = -Math.PI / 2 + i * Math.PI / 4;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) mark(Math.floor(cx + 3 * Math.cos(q)) + dx, Math.floor(cz + 3 * Math.sin(q)) + dz);
  }
  for (let x = 12; x <= 20; x++) for (let z = 8; z <= 16; z++) mark(x, z);
  // 话题牌在东边，牌子前和镜头到牌子的近处不长草，否则矮草会挡住牌角。
  for (let x = 18; x <= 26; x++) for (let z = 6; z <= 14; z++) mark(x, z);
  const leaf = (x: number, y: number, z: number, id: string) => { if (!b.cells.has(`${x},${y},${z}`)) b.put(x, y, z, id, { distance: '1', persistent: 'true', waterlogged: 'false' }); };
  const tree = (x: number, z: number, kind: 'oak' | 'birch' | 'cherry', h: number, wide = 2) => {
    for (let y = 1; y <= h; y++) b.put(x, y, z, kind + '_log', { axis: 'y' });
    mark(x, z);
    for (let dy = -2; dy <= 2; dy++) {
      const rad = dy <= -1 ? wide + .5 : dy === 0 ? wide : dy === 1 ? wide - .6 : .9;
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        const dist = Math.hypot(dx, dz);
        if (dist <= rad && !(dx === 0 && dz === 0 && dy < 1)) leaf(x + dx, h + dy, z + dz, kind + '_leaves');
      }
    }
    leaf(x, h + 1, z, kind + '_leaves');
  };
  for (const [x, z, kind, h, wide] of TREES) tree(x, z, kind, h, wide);
  // 几块一格高的土坡，打破整片 y=0。避开土路、野餐布和镜头到牌子的那一段。
  for (const [mx, mz] of [[-10, 4], [43, 2], [34, 17]] as const) {
    for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) {
      const x = mx + dx, z = mz + dz;
      if (taken.has(cell(x, z))) continue;
      b.put(x, 1, z, 'grass_block', { snowy: 'false' });
      mark(x, z);
    }
  }
  const free = (x: number, z: number) => x > X0 + 1 && x < X1 - 1 && z > Z0 + 1 && z < Z1 - 1 && !taken.has(cell(x, z)) && !b.cells.has(`${x},1,${z}`);
  const put = (x: number, z: number, id: string) => { if (!free(x, z)) return; b.put(x, 1, z, id); mark(x, z); };
  const tall = (x: number, z: number, id: string) => { if (!free(x, z)) return; b.put(x, 1, z, id, { half: 'lower' }).put(x, 2, z, id, { half: 'upper' }); mark(x, z); };
  for (const bed of BEDS) {
    for (let x = bed.x0; x <= bed.x1; x += bed.step) for (let z = bed.z0; z <= bed.z1; z += bed.step) {
      if ((x + z) % (bed.step + 1) !== 0) continue;
      if (bed.tall) tall(x, z, bed.plant);
      else put(x, z, bed.plant);
    }
  }
  for (const [x, z, id] of [[19, 19, 'rose_bush'], [30, 17, 'peony'], [9, 14, 'lilac'], [4, 18, 'rose_bush']] as const) tall(x, z, id);
  put(20, 6, 'flowering_azalea');
  put(8, 18, 'flowering_azalea');
  const r: Room = {
    kind: 'meadow', title: MC_SCENE_NAMES.meadow, outdoor: true, seatedSpeech: true, frontal: true, material: 'original',
    blocks: b.connect(), ceiling: [], cutaway: [], anchors: [], host: [cx, 1, cz],
    layout: { tables: [], chairs: [], desk: [], podium: { position: [cx, 1, cz], yaw: 0 }, board: { position: [21.8, 2.15, 8.2], width: 2.4, height: 1.1 }, phaseLamps: [] },
    camera: [14.5, 7.2, 26.5], cameraTarget: [20, 1.8, 14], fov: 40, fit: [], judge: [cx, 2.6, cz + 6.5], judgeTarget: [cx, 1.6, cz],
    lights: [], windows: [], banners: [], floor: [], bounds: { min: [1, 1, 1], max: [31, 12, 25] },
    look: {
      background: '#9fd0f5', outdoor: true, sky: '#cfe6ff', ground: '#86b84e', ambient: .86,
      sun: { color: '#fff0d0', intensity: 3.8, azimuth: 158, elevation: 38, shadow: .88 }, exposure: 1.12, indirect: .1,
      haze: '#d4e9f8', fog: [45, 170], skyTop: '#3f93e8', tint: { grass: '#a2d462', foliage: '#7ccb4f', birch: '#a3d163' }, saturation: 1,
    },
    waterColor: '#3d9be0', boardStyle: 'sign',
  };
  for (let i = 0; i < 8; i++) {
    const q = -Math.PI / 2 + i * Math.PI / 4;
    seat(r, anchor(cx + 3 * Math.cos(q), cz + 3 * Math.sin(q), Math.atan2(-3 * Math.cos(q), -3 * Math.sin(q)), i), i, 'stool');
  }
  r.makeChair = (k, c) => {
    const g = new THREE.Group(), wood = (c.actor ?? 0) % 2 === 0 ? 'oak' : 'birch';
    k.block(g, .62, .48, .62, { side: 'block/' + wood + '_log', top: 'block/' + wood + '_log_top' }, 0, .24, 0);
    return g;
  };
  r.decorate = (k, root) => {
    for (const [dx, dz] of [[-.95, -.8], [.95, -.75], [-.8, .95], [.85, .9]]) root.add(at(teacup(k), cx + dx, 1.07, cz + dz));
    root.add(at(openBook(k), cx - 1.3, 1.07, cz + .1, .4));
  };
  r.decorateBoard = (k, sign) => { sign.add(at(signPosts(k, 2.4, 1.7, '#8a5c35'), 0, -1.1, 0)); };
  finishStyled(r);
  r.fit = [...r.fit.slice(0, r.anchors.length * 2), [21.8, 2.8, 8.2]];
  return r;
}
