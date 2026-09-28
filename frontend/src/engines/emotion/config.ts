/** 情感分析引擎的可调参数默认值，运行时从 SessionConfig.engineOptions 读取（底盘的 live/types.ts 的 readLiveOptions） */
export const EMOTION_DEFAULTS: Record<string, unknown> = {
  /** 演员说话的采样温度：比娱乐低一点，回应当事人的事要稳一些 */
  temperature: 0.9,
  /** 导演排戏的温度，低一点更稳 */
  directorTemperature: 0.7,
  /** 生成总结时的温度，低一些更稳定 */
  summaryTemperature: 0.3,
  /** 一场最多几次发言（一次连发几条算一次），到了就收尾；收尾后你再开口，大家能接着聊一阵 */
  maxMessages: 30,
  /** 节奏倍数：1 正常，2 慢一倍，0.5 快一倍 */
  pace: 1,
  /** 随性程度 0~1：谁开口有多少是按各人此刻的冲动抽的（0 总按导演首选，1 完全按冲动）；三步由导演推进，谁开口可以随性，但比娱乐收一点 */
  spontaneity: 0.5,
};
