/** 工作引擎的可调参数（后端 server/work.ts 读取） */
export const PRODUCT_DEFAULTS: Record<string, unknown> = {
  /** 节奏倍数：走路、递文件、气泡停留这些等待时间都乘它；0 表示不等（测试用） */
  pace: 1,
  /** 最多几个人同时调用模型（同时在干活、讨论的人数），1～8 */
  parallel: 4,
};
