import type { LlmConfig } from './config.ts';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

/** 只取用得到的字段；接口返回的是外部数据，按 unknown 逐层取 */
interface Completion {
  choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
  error?: { message?: unknown } | string;
}

/** 这一轮没答成；鉴权失败、余额不足、模型不存在这类错误重试也没用 */
export class LlmTurnError extends Error {
  constructor(message: string, readonly fatal = false) {
    super(message);
  }
}

/** 模型会先思考，思考也算在额度里，给少了会拿到空回复 */
const MAX_TOKENS = 8192;
const FATAL_STATUS: Record<number, true> = { 401: true, 402: true, 403: true, 404: true };

/** Cline 网关把非流式结果包在 { success, data } 里，标准 OpenAI 接口直接返回；两种都认，统一成标准格式 */
export function unwrapCompletion(v: unknown): unknown {
  return v && typeof v === 'object' && 'data' in v && v.data && typeof v.data === 'object' && 'choices' in v.data ? v.data : v;
}

function parse(raw: string): Completion | null {
  try {
    const v = unwrapCompletion(JSON.parse(raw));
    return v && typeof v === 'object' ? (v as Completion) : null;
  } catch {
    return null;
  }
}

export interface AgentOptions {
  /** 采样温度；不填用模型服务的默认值 */
  temperature?: number;
  /** false：不保留历史，每次只发 system 和这一条消息（上下文由调用方拼进消息里） */
  remember?: boolean;
}

/**
 * 一个 Agent 角色 = 一段直接发给模型接口（OpenAI 兼容 /chat/completions）的对话。
 * 整场会话里保留自己的历史，所以每个角色都记得自己说过的话；只有答成的轮次才记进历史，失败重试不会重复。
 */
export class LlmAgent {
  private history: Message[] = [];
  private ctrl: AbortController | null = null;

  constructor(readonly name: string, private cfg: LlmConfig, private system: string, private opts: AgentOptions = {}) {}

  /** 发一条消息，等这一轮回答完，返回回答文本 */
  async ask(message: string, timeoutMs = 180_000): Promise<string> {
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
    const turn: Message = { role: 'user', content: message };
    try {
      const res = await fetch(this.cfg.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.cfg.apiKey },
        body: JSON.stringify({
          model: this.cfg.model,
          messages: [{ role: 'system', content: this.system }, ...this.history, turn],
          max_tokens: MAX_TOKENS,
          temperature: this.opts.temperature,
        }),
        signal: ctrl.signal,
      });
      const raw = await res.text();
      const data = parse(raw);
      if (!res.ok) {
        const err = data?.error;
        const detail = String((typeof err === 'object' ? err.message : err) ?? raw).slice(0, 200);
        throw new LlmTurnError(`HTTP ${res.status}：${detail}`, FATAL_STATUS[res.status] === true || /model.{0,40}not.{0,10}(found|exist)/i.test(detail));
      }
      const choice = data?.choices?.[0];
      const text = String(choice?.message?.content ?? '').trim();
      if (!text) throw new LlmTurnError(choice?.finish_reason === 'length' ? '模型把输出额度都用在思考上了，没写出回复' : '模型返回了空内容');
      if (this.opts.remember !== false) this.history.push(turn, { role: 'assistant', content: text });
      return text;
    } catch (e) {
      if (e instanceof LlmTurnError) throw e;
      if (ctrl.signal.aborted) throw new LlmTurnError(timedOut ? '等待模型回答超时' : '已中止');
      throw new LlmTurnError('连不上模型服务：' + (e as Error).message);
    } finally {
      clearTimeout(timer);
      if (this.ctrl === ctrl) this.ctrl = null;
    }
  }

  /** 中断正在进行的请求 */
  abort() {
    this.ctrl?.abort();
  }
}
