/** 小工具：id、数字、字符串处理、节奏与限速常量、条件变量（被引擎各模块共用） */

let seq = 0;
export const uid = (p: string) => p + '-' + Date.now().toString(36) + '-' + (seq++).toString(36);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const QUOTE_PAIRS: Record<string, string> = { '“': '”', '「': '」', '『': '』', '"': '"', "'": "'" };
/**
 * 整句被一对引号包着（“……”「……」）时去掉这对引号；句子里本来就有的引号（引用别人的原话）不动，
 * 比如「故意」是你补的、那我给你一句能直接发的：“……”
 */
export function unwrapQuotes(t: string) {
  const close = QUOTE_PAIRS[t[0]];
  if (!close || t.length < 2 || t[t.length - 1] !== close) return t;
  const inner = t.slice(1, -1);
  // 里面还有同样的引号，首尾就不是一对（「故意」是你补的「理由」），不动
  return inner.includes(t[0]) || inner.includes(close) ? t : inner.trim();
}

/** 说话时每秒刷新几次 */
export const FPS = 12;
/** 说话速度：每秒几个字（再乘嘴快和上头程度） */
export const CPS = 9;
/** 限速：导演每一步给一个人每种情绪最多改 2，按性情放大后最多变 3 */
export const STEP_MOOD = 2;
export const STEP_MOOD_MAX = 3;
/** 到了插嘴的地方、插嘴的人还没组织好话时，说话的人最多停多久 */
export const MAX_CUT_WAIT = 4000;
/** 导演改的说话状态，过这么多次发言自动回到平时的样子（导演再写一次就续上），免得一次判断锁住一个人 */
export const STYLE_TTL = 6;

/** 条件变量：状态一变就叫醒等着的循环，醒来后自己再看条件 */
export class Signal {
  private waiters = new Set<() => void>();
  notify() {
    const ws = [...this.waiters];
    this.waiters.clear();
    ws.forEach((w) => w());
  }
  wait(ms?: number) {
    return new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = () => { if (timer !== undefined) clearTimeout(timer); this.waiters.delete(done); resolve(); };
      if (ms !== undefined) timer = setTimeout(done, Math.max(0, ms));
      this.waiters.add(done);
    });
  }
}
