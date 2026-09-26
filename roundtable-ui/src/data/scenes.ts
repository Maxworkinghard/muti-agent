import type { SceneDef, SceneId } from '../types';

// 坐标是座位中心在 1536x1024 底图上的百分比位置
const p = (x: number, y: number) => ({ x: +(x / 15.36).toFixed(2), y: +(y / 10.24).toFixed(2) });

export const SCENES: Record<SceneId, SceneDef> = {
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
};

export const SCENE_LIST = Object.values(SCENES);

