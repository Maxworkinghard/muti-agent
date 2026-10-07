import { Vector3 } from 'three';
import type { SceneDef } from '../types';

/** GLB 自带烘焙配色；光照沿用房间基准，后处理只做轻度调色和高光压缩。 */
export const STAGE_TUNING = {
  hemi: 3.0,
  groundColor: 0xa89a90,
  key: 0.4,
  fill: 0.1,
  exposure: 1,
  sat: 1,
} as const;

/** 屋里看出去时的取景：站在房间一头、眼睛高度，朝中心看 */
export const ROOM_VIEW = {
  fov: 62,
  /** 眼睛在房间净高里的位置 */
  eye: 0.40,
  /** 从房间中心往观众侧退多少（占房间进深） */
  back: 0.40,
  /** 站位再往旁边偏一点（占房间宽度），避开正对镜头的那件家具 */
  side: 0.0,
  /** 视线落点的高度 */
  look: 0.26,
} as const;
/**
 * 各场景的站位微调：默认正对房间中心站着，个别房间里正中间摆着家具
 * （例如圆桌那张正对镜头的大椅子）就横向挪开一点，别让它糊在镜头上。
 */
export const SCENE_VIEW: Record<string, { side?: number; back?: number; eye?: number; look?: number; fov?: number }> = {
  // 圆桌正中有把大椅子顶在镜头上，横向挪开半个座位、站高一点
  roundtable: { side: 0.13, eye: 0.52, back: 0.34 },
  // 办公室中间是一圈文件柜，站高些越过它才看得见两边的工位
  office: { eye: 0.70, back: 0.46, look: 0.20, fov: 66 },
  'debate-meshy': { eye: 0.54, back: 0.46, look: 0.54, fov: 56 },
};
/** 补的天花板颜色：取自墙面的暖色，和这套房间的配色一致 */
export const CEILING_COLOR = '#e6d3ae';
/** 抬头低头的上下限 */
export const PITCH_LIMIT = 1.15;
export const LOOK_SPEED = 0.004;
/** 座位点往上抬多少再当锚点（占房间净高）。0 = 正好落在桌面/讲台面上 */
export const SEAT_LIFT = 0;

/**
 * 跟拍：镜头跟着讨论走，像导播切机位。没人说话拍全景；有人在想，镜头先移到他那边；
 * 开口了推到中近景（离得近的交流对象一起入画），能看清表情和手势，也看得懂大家的交流关系。
 * frac 是人物半身占画面高度的比例；omega 是镜头弹簧的角频率（3 左右约 1.5 秒到位）。
 */
export const FOLLOW = {
  speak: { frac: 0.2, fov: 46 },
  think: { frac: 0.15, fov: 48 },
  /** 一个镜头至少停这么久再切：你一句我一句时镜头不来回甩 */
  hold: 2600,
  omega: 2.6,
  /** 镜头停着时的轻微呼吸，占到人物距离的比例；画面不至于像监控一样死 */
  breathe: 0.002,
  /** 全景往下俯的角度：先试 16°（画面上沿压在后墙顶附近，天花板基本出画），框不全再升高 */
  widePitches: [16, 28, 40, 55].map((deg) => (deg * Math.PI) / 180),
  /** 屋里框不全时，从屋顶上方往下拍的俯角 */
  dronePitch: (50 * Math.PI) / 180,
} as const;
/**
 * 人物半身（36px 那张像素小人）在世界里有多高，占房间包围盒高度的比例。
 * 精模自带 roomMetrics.avatarHeight；其余三间没有尺寸标定，按「半身约为桌高的 2/3」
 * （桌高约 0.75 米，坐着露出桌面的头肩约 0.5 米）换算：在每个人座位和房间中心之间往下打线量桌面，
 * 圆桌桌高 0.085、辩论室 0.058、办公室 0.0845（模型单位，房间高分别是 0.3475、0.4243、0.222）。
 */
export const AVATAR_SHARE: Record<string, number> = { roundtable: 0.163, debate: 0.091, office: 0.254 };
/** 人物缩放的上下限：太远时也要认得出，推近时不至于糊满画面 */
export const SCALE_RANGE = { min: 0.55, max: 7, overviewMin: 0.8 } as const;
export const UP = new Vector3(0, 1, 0);

export type StageViewMode = 'inside' | 'overview' | 'walk' | 'free' | 'actor';

/** 外面告诉舞台现在该拍谁：座位下标为 null 时拍全景 */
export interface StageCue {
  seat: number | null;
  shot: 'wide' | 'think' | 'speak';
  /** 上一位发言者／被回应的人，让镜头保留交流对象。 */
  listener?: number;
}

export interface Shot { pos: Vector3; target: Vector3; fov: number }

/** 精模自带的房间标定：地板/天花高度、眼睛与视线落点高度、座位抬升和人物半身高 */
export interface StageRoomMetrics { floor: number; ceiling: number; eyeHeight: number; lookHeight: number; seatLift: number; avatarHeight: number }

/** 各场景的光照微调：精模（debate-meshy）烘焙贴图暗一些，半球光减弱、方向光加强 */
export const stageTuningFor = (scene: SceneDef) =>
  scene.id === 'debate-meshy' ? { ...STAGE_TUNING, hemi: 2.5, key: 0.7, fill: 0.15 } : STAGE_TUNING;

/** 默认取景叠加该场景的站位微调 */
export const roomViewFor = (scene: SceneDef) => ({ ...ROOM_VIEW, ...(SCENE_VIEW[scene.id] ?? SCENE_VIEW[scene.sourceSceneId ?? scene.id]) });
