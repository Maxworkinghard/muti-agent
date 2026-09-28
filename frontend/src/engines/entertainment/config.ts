/** 娱乐引擎的可调参数默认值，运行时从 SessionConfig.engineOptions 读取 */
export const ENTERTAINMENT_DEFAULTS: Record<string, unknown> = {
  /** 是否把热梗卡提供给角色（角色仍会按语境决定用不用） */
  memesEnabled: true,
  /** 每场讨论随机抽几张热梗卡；超过卡片总数时全部提供 */
  memeCount: 3,
  /** 演员说话的采样温度 */
  temperature: 1,
  /** 导演排戏的温度，低一点更稳 */
  directorTemperature: 0.8,
  /** 生成总结时的温度，低一些更稳定 */
  summaryTemperature: 0.3,
  /** 一场最多几次发言（一次连发几条算一次），到了就散场；散场后你再开口，大家能接着聊一阵 */
  maxMessages: 50,
  /** 节奏倍数：1 正常，2 慢一倍，0.5 快一倍 */
  pace: 1,
};

export interface EntertainmentOptions {
  memesEnabled: boolean;
  memeCount: number;
}

/** 梗卡相关的参数；温度、条数、节奏由底盘读（live/types.ts 的 readLiveOptions） */
export function readOptions(raw: Record<string, unknown> | undefined): EntertainmentOptions {
  const o = { ...ENTERTAINMENT_DEFAULTS, ...(raw ?? {}) };
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    memesEnabled: o.memesEnabled !== false,
    memeCount: Math.max(0, Math.floor(num(o.memeCount, 3))),
  };
}
