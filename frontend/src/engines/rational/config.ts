import { DEBATE_CHARS } from '../../data/modes';

/** 辩论引擎的可调参数。轮数（maxRounds）和字数上限在选人页可以改 */
export const RATIONAL_DEFAULTS: Record<string, unknown> = {
  /** 发言速度倍率，目前只有 mock 引擎使用 */
  speed: 1,
  /** 每次发言的字数上限，范围和默认值见 modes.ts 的 DEBATE_CHARS */
  maxChars: DEBATE_CHARS.default,
};
