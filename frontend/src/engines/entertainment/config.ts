/** 娱乐引擎的可调参数默认值，运行时从 SessionConfig.engineOptions 读取 */
export const ENTERTAINMENT_DEFAULTS: Record<string, unknown> = {
  /** 是否把热梗卡提供给角色（角色仍会按语境决定用不用） */
  memesEnabled: true,
  /** 每场讨论随机抽几张热梗卡；超过卡片总数时全部提供 */
  memeCount: 3,
  /** 角色发言的采样温度 */
  temperature: 0.8,
  /** 生成总结时的温度，低一些更稳定 */
  summaryTemperature: 0.3,
};

export interface EntertainmentOptions {
  memesEnabled: boolean;
  memeCount: number;
  temperature: number;
  summaryTemperature: number;
}

/** 把界面传来的 engineOptions 和默认值合并，类型不对时回落到默认值 */
export function readOptions(raw: Record<string, unknown> | undefined): EntertainmentOptions {
  const o = { ...ENTERTAINMENT_DEFAULTS, ...(raw ?? {}) };
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    memesEnabled: o.memesEnabled !== false,
    memeCount: Math.max(0, Math.floor(num(o.memeCount, 3))),
    temperature: num(o.temperature, 0.8),
    summaryTemperature: num(o.summaryTemperature, 0.3),
  };
}
