import type { SceneDef, SceneId, Seat } from '../types';

// 坐标是座位中心在 1536x1024 底图上的百分比位置
const p = (x: number, y: number) => ({ x: +(x / 15.36).toFixed(2), y: +(y / 10.24).toFixed(2) });

const ORIGINAL_SCENES: Record<string, SceneDef> = {
  roundtable: {
    id: 'roundtable',
    name: '圆桌会议室',
    image: '/scenes/scene-roundtable.png',
    description: '八个座位围成一圈，人人平等发言，适合闲聊和自由讨论',
    recommendedMode: 'entertainment',
    maxSeats: 8,
    center: p(766, 470),
    seats: [p(766, 190), p(990, 280), p(1080, 475), p(1000, 675), p(766, 770), p(530, 675), p(450, 475), p(545, 280)],
  },
  debate: {
    id: 'debate',
    name: '辩论室',
    image: '/scenes/scene-debate.png',
    description: '正方蓝桌、反方红桌各三席，中间一个主持讲台',
    recommendedMode: 'rational',
    maxSeats: 7,
    seats: [
      { ...p(470, 350), group: 'pro' },
      { ...p(410, 410), group: 'pro' },
      { ...p(350, 475), group: 'pro' },
      { ...p(1066, 350), group: 'con' },
      { ...p(1126, 410), group: 'con' },
      { ...p(1190, 475), group: 'con' },
      { ...p(766, 300), group: 'host' },
    ],
  },
  office: {
    id: 'office',
    name: '办公室',
    image: '/scenes/scene-office.png',
    description: '每人一个工位，文件经过中央交换台在工位间传递',
    recommendedMode: 'product',
    maxSeats: 8,
    center: p(766, 480),
    seats: [p(567, 240), p(1100, 240), p(307, 595), p(1222, 595), p(567, 855), p(965, 855), p(135, 595), p(1370, 595), p(433, 240), p(1297, 320)],
  },
  classroom: {
    id: 'classroom',
    name: '中南大学教室',
    image: '/scenes/scene-classroom.png',
    description: '第一个人站上讲台，其余人坐在前排听讲和发言',
    recommendedMode: 'rational',
    maxSeats: 8,
    center: p(766, 330),
    seats: [p(622, 235), p(660, 400), p(770, 400), p(877, 400), p(313, 400), p(1227, 400), p(660, 490), p(877, 490)],
  },
  meadow: {
    id: 'meadow',
    name: '草地野餐',
    image: '/scenes/scene-meadow.png',
    description: '树桩和坐垫围着野餐布，适合轻松的户外闲聊',
    recommendedMode: 'entertainment',
    maxSeats: 8,
    center: p(766, 460),
    // 先坐上下左右，人少时也能围成一圈
    seats: [p(766, 210), p(1045, 450), p(766, 680), p(485, 450), p(955, 295), p(970, 600), p(565, 600), p(570, 295)],
  },
  podcast: {
    id: 'podcast',
    name: '播客访谈间',
    image: '/scenes/scene-podcast.png',
    description: '一对一播客访谈：左边主持人提问，右边受邀嘉宾作答',
    // 交给导演和每个角色：先入座的是主持人，第二位是嘉宾
    brief: '一对一播客访谈：1号座主持人，2号座受邀嘉宾',
    recommendedMode: 'entertainment',
    maxSeats: 2,
    // 正面视角：两人全身坐在扶手椅上、面朝镜头；座位点是椅面中间，人物宽度占舞台 15%（底图按这个比例画的椅子）
    posture: 'sit',
    actorWidth: 0.15,
    seats: [p(472, 704), p(1064, 704)],
  },
};

// 3D 场景使用独立 ID；原场景与各模式默认选择保持原样。
const MODEL_SEATS: Record<string, Seat[]> = {
  roundtable: [
    { x: 50.02, y: 13.8 }, { x: 64.06, y: 22.73 }, { x: 69.78, y: 42.01 },
    { x: 65.24, y: 66.05 }, { x: 50.47, y: 73.51 }, { x: 34.92, y: 61.83 },
    { x: 30.16, y: 42.27 }, { x: 35.86, y: 22.02 },
  ],
  debate: [
    { x: 29.68, y: 24.46 }, { x: 26.1, y: 31.79 }, { x: 22.65, y: 38.98 },
    { x: 69.42, y: 23 }, { x: 73.39, y: 30.78 }, { x: 77.84, y: 39.04 },
    { x: 50.04, y: 13.5 },
  ],
  office: [
    { x: 37.01, y: 19.35 }, { x: 71.96, y: 19.44 }, { x: 19.91, y: 58.27 },
    { x: 79.79, y: 58.16 }, { x: 36.97, y: 83.3 }, { x: 63.33, y: 83.19 },
    { x: 8.47, y: 58.18 }, { x: 89.46, y: 58.13 }, { x: 28.2, y: 19.11 },
    { x: 85.38, y: 29.13 },
  ],
};

export const SCENES: Record<string, SceneDef> = {
  ...ORIGINAL_SCENES,
  ...Object.fromEntries(['roundtable', 'debate', 'office'].map((sourceId) => {
    const source = ORIGINAL_SCENES[sourceId];
    const id = `${sourceId}-3d`;
    return [id, {
      ...source,
      id,
      name: `${source.name} · 3D`,
      sourceSceneId: sourceId,
      model3d: `/models/scene-${sourceId}.glb`,
      previewImage: `/models/scene-${sourceId}-preview.png`,
      modelSeats: MODEL_SEATS[sourceId],
      description: `可旋转、缩放的三维${source.name}，沿用现有人物和讨论功能`,
    } satisfies SceneDef];
  })),
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

/** 保存到本地；图片太大存不下时返回 false，场景仍然在本次会话里可用 */
export function saveCustomScenes(list: SceneDef[]): boolean {
  customScenes = list;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const sceneById = (id: SceneId): SceneDef =>
  SCENES[id] ?? customScenes.find((s) => s.id === id) ?? SCENES.roundtable;
