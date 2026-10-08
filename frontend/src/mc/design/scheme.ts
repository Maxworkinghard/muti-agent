/**
 * 视觉方案：一间房只声明角色，不在摆家具时临时挑方块。
 * 方块名必须是资源包里有的原版方块。布料用羊毛，木作用木板或去皮原木。
 * 强调色只给有功能的东西（队色、地毯、座位），不拿来给每把椅子换一种颜色。
 */
export interface Scheme {
  id: string;
  /** 给人和文档看的一句话，不是渲染参数。 */
  note: string;
  floor: string;
  wall: string;
  /** 墙下沿。和墙是同一种时，房间就是一整面墙。 */
  base: string;
  trim: string;
  trimLog: string;
  ceiling: string;
  /** 家具木色，和 trim 同一族，避免一根梁一种木头。 */
  wood: string;
  /** 座位布料。辩论室的正反方另有队色，不走这一项。 */
  fabric: string;
  /** 唯一的暖强调：地毯、灯、小花。 */
  accent: string;
  sun: string;
  lamp: string;
}

export const SCHEMES = {
  study: {
    id: 'study',
    note: '书房会议室：白墙、白桦地面、橡木、一种蓝布、一块灰绿地毯。',
    floor: 'birch_planks', wall: 'smooth_quartz', base: 'smooth_quartz',
    trim: 'oak_planks', trimLog: 'stripped_oak_log', ceiling: 'smooth_quartz',
    wood: 'oak_planks', fabric: 'white_wool', accent: 'moss_block',
    sun: '#ffe8c2', lamp: '#ffd9a6',
  },
  classroom: {
    id: 'classroom',
    note: '教室：白墙、云杉墙裙、白桦地面、橡木课桌、全体浅蓝座位。',
    floor: 'birch_planks', wall: 'smooth_quartz', base: 'spruce_planks',
    trim: 'oak_planks', trimLog: 'stripped_oak_log', ceiling: 'smooth_quartz',
    wood: 'oak_planks', fabric: 'light_blue_wool', accent: 'oxidized_cut_copper',
    sun: '#ffd79c', lamp: '#ffe2b6',
  },
  office: {
    id: 'office',
    note: '办公室：橡木地面、白墙、工作椅一种蓝、会议椅一种暖色。',
    floor: 'oak_planks', wall: 'smooth_quartz', base: 'birch_planks',
    trim: 'oak_planks', trimLog: 'stripped_oak_log', ceiling: 'smooth_quartz',
    wood: 'oak_planks', fabric: 'light_blue_wool', accent: 'orange_wool',
    sun: '#ffe2b6', lamp: '#ffd9a6',
  },
  debate: {
    id: 'debate',
    note: '辩论场：湖绿赛场、白墙、云杉木、队色只属于正反方。',
    floor: 'oxidized_copper', wall: 'smooth_quartz', base: 'spruce_planks',
    trim: 'stripped_dark_oak_log', trimLog: 'stripped_spruce_log', ceiling: 'smooth_quartz',
    wood: 'spruce_planks', fabric: 'white_wool', accent: 'oxidized_copper',
    sun: '#ffe2b8', lamp: '#ffd9a6',
  },
  meadow: {
    id: 'meadow',
    note: '草地：原版草地、土路、橡树白桦樱花，野餐布只有黄和白。',
    floor: 'grass_block', wall: 'grass_block', base: 'dirt',
    trim: 'oak_log', trimLog: 'oak_log', ceiling: 'grass_block',
    wood: 'oak_log', fabric: 'white_wool', accent: 'yellow_carpet',
    sun: '#fff0d0', lamp: '#ffd9a6',
  },
  podcast: {
    id: 'podcast',
    note: '访谈布景：平涂的暖墙和两把椅子。这是图形背景，不是方块建筑。',
    floor: 'birch_planks', wall: 'smooth_quartz', base: 'spruce_planks',
    trim: 'oak_planks', trimLog: 'stripped_oak_log', ceiling: 'smooth_quartz',
    wood: 'oak_planks', fabric: 'orange_wool', accent: 'blue_wool',
    sun: '#ffe8c8', lamp: '#fbe6b0',
  },
} as const satisfies Record<string, Scheme>;

export type SchemeId = keyof typeof SCHEMES;
