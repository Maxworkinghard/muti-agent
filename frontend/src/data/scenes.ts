import type { Facing, Seat, SceneDef, SceneId } from '../types';

// 坐标是座位中心在 1536x1024 底图上的百分比位置
const p = (x: number, y: number) => ({ x: +(x / 15.36).toFixed(2), y: +(y / 10.24).toFixed(2) });
/** 带朝向的座位 */
const seat = (x: number, y: number, face: Facing, group?: Seat['group']): Seat => ({ ...p(x, y), face, group });

export const SCENES: Record<string, SceneDef> = {
  roundtable: {
    id: 'roundtable',
    name: '圆桌会议室',
    image: '/scenes/scene-roundtable.png',
    description: '八个座位围成一圈，人人平等发言，适合闲聊和自由讨论',
    maxSeats: 8,
    center: p(766, 470),
    seats: [p(766, 190), p(990, 280), p(1080, 475), p(1000, 675), p(766, 770), p(530, 675), p(450, 475), p(545, 280)],
  },
  debate: {
    id: 'debate',
    name: '辩论室',
    image: '/scenes/scene-debate.png',
    description: '正方蓝桌、反方红桌各三席，中间一个主持讲台',
    maxSeats: 7,
    // 两张辩论桌斜着摆，正反方都朝场地中央，主持人面朝台下
    seats: [
      seat(470, 350, 'SE', 'pro'),
      seat(410, 410, 'SE', 'pro'),
      seat(350, 475, 'SE', 'pro'),
      seat(1066, 350, 'SW', 'con'),
      seat(1126, 410, 'SW', 'con'),
      seat(1190, 475, 'SW', 'con'),
      seat(766, 300, 'S', 'host'),
    ],
  },
  office: {
    id: 'office',
    name: '办公室',
    image: '/scenes/scene-office.png',
    description: '每人一个工位，文件经过中央交换台在工位间传递',
    maxSeats: 8,
    center: p(766, 480),
    // 椅子都在桌子下方，坐着的人面向自己的显示器
    seats: [[567, 240], [1100, 240], [307, 595], [1222, 595], [567, 855], [965, 855], [135, 595], [1370, 595], [433, 240], [1297, 320]]
      .map(([x, y]) => seat(x, y, 'N')),
  },
  classroom: {
    id: 'classroom',
    name: '中南大学教室',
    image: '/scenes/scene-classroom.png',
    description: '第一个人站上讲台，其余人坐在前排听讲和发言',
    maxSeats: 8,
    center: p(766, 330),
    // 讲台上的人面朝台下，其余人面朝讲台
    seats: [seat(622, 235, 'S'), ...[[660, 400], [770, 400], [877, 400], [313, 400], [1227, 400], [660, 490], [877, 490]].map(([x, y]) => seat(x, y, 'N'))],
  },
  meadow: {
    id: 'meadow',
    name: '草地野餐',
    image: '/scenes/scene-meadow.png',
    description: '树桩和坐垫围着野餐布，适合轻松的户外闲聊',
    maxSeats: 8,
    center: p(766, 460),
    // 先坐上下左右，人少时也能围成一圈；大家都看向野餐布
    seats: [p(766, 210), p(1045, 450), p(766, 680), p(485, 450), p(955, 295), p(970, 600), p(565, 600), p(570, 295)],
  },
};

export const SCENE_LIST = Object.values(SCENES);

// ---------- 用户自己添加的场景 ----------
const STORE_KEY = 'roundtable.customScenes';
let customScenes: SceneDef[] = [];

export function loadCustomScenes(): SceneDef[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
    customScenes = Array.isArray(list) ? list.filter((s) => s?.id && s.image && Array.isArray(s.seats)) : [];
  } catch {
    customScenes = [];
  }
  return customScenes;
}

/** 保存到本地；图片太大存不下时返回 false，场景仍然在本次打开时可用 */
export function saveCustomScenes(list: SceneDef[]): boolean {
  customScenes = list;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** 内置场景或用户添加的场景；找不到时退回圆桌 */
export const sceneById = (id: SceneId): SceneDef =>
  SCENES[id] ?? customScenes.find((s) => s.id === id) ?? SCENES.roundtable;

const DIRS: Facing[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

/** 坐在 s 上的人朝哪边：座位写了 face 就用它，否则看向场景中心（圆桌就是看向桌子中间）。底图是 3:2，百分比坐标按宽高换算后再算角度 */
export function facingOf(scene: SceneDef, s: Seat): Facing {
  if (s.face) return s.face;
  if (!scene.center) return 'S';
  const deg = (Math.atan2((scene.center.y - s.y) * 2, (scene.center.x - s.x) * 3) * 180) / Math.PI;
  return DIRS[(Math.round(deg / 45) + 8) % 8];
}

