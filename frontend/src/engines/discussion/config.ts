/** 理性讨论引擎的可调参数；轮数和字数上限在选人页可以改 */
export const DISCUSSION_DEFAULTS: Record<string, unknown> = {
  /** 每次发言的字数上限，交给 backend/讨论引擎.py */
  maxChars: 150,
};
