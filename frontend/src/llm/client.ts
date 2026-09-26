/**
 * 所有引擎共用的 AI 调用入口。
 * 人物之间的区别只体现在传进来的 messages（系统提示词）和参数上，API 只有这一个。
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** 不填就用服务器 .env.local 里的 ROUNDTABLE_MODEL */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

const ENDPOINT = '/api/llm/chat';

/**
 * 默认输出上限。当前模型会先“思考”再回答，思考内容也计入 max_tokens，
 * 上限太小会拿到空回复（finish_reason = length），所以默认给足 10000。
 */
export const DEFAULT_MAX_TOKENS = 10000;

/** 等待模型开始回复的最长时间，超时按网络错误处理 */
export const DEFAULT_TIMEOUT_MS = 90_000;

export type LlmErrorKind = 'aborted' | 'timeout' | 'network' | 'auth' | 'quota' | 'rate_limit' | 'server' | 'bad_request' | 'empty';

/** AI 调用失败时抛出的错误，message 是给用户看的中文说明 */
export class LlmError extends Error {
  constructor(
    public kind: LlmErrorKind,
    message: string,
    /** 这类错误点“重试”是否可能成功 */
    public retryable: boolean,
    public status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** 用户点了停止（或组件卸载）导致的中断，引擎遇到它应安静退出，不要显示成错误 */
export const isAbort = (e: unknown) => e instanceof LlmError && e.kind === 'aborted';

function buildBody(messages: LlmMessage[], opt: ChatOptions, stream: boolean) {
  return JSON.stringify({
    messages,
    model: opt.model,
    temperature: opt.temperature,
    max_tokens: opt.maxTokens ?? DEFAULT_MAX_TOKENS,
    stream,
  });
}

async function failText(res: Response) {
  const raw = await res.text();
  try { return JSON.parse(raw).error?.message ?? JSON.parse(raw).error ?? raw; } catch { return raw; }
}

function httpError(status: number, detail: string): LlmError {
  const d = String(detail).slice(0, 200);
  if (status === 401 || status === 403) return new LlmError('auth', 'API Key 无效或没有权限，请检查 .env.local 里的 ROUNDTABLE_API_KEY（' + d + '）', false, status);
  if (status === 402) return new LlmError('quota', '账户余额不足，请到服务商后台充值（' + d + '）', false, status);
  if (status === 429) return new LlmError('rate_limit', '请求太频繁或额度用完，稍等一会儿再试（' + d + '）', true, status);
  if (status >= 500) return new LlmError('server', '模型服务暂时出错（' + status + '），可以重试（' + d + '）', true, status);
  return new LlmError('bad_request', '请求被拒绝（' + status + '）：' + d, false, status);
}

/** 发请求：合并用户的 signal 和超时，把各种失败统一成 LlmError */
async function post(body: string, opt: ChatOptions): Promise<Response> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, DEFAULT_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  if (opt.signal?.aborted) ctrl.abort();
  opt.signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal });
    if (!res.ok) throw httpError(res.status, await failText(res));
    return res;
  } catch (e) {
    throw toLlmError(e, timedOut);
  } finally {
    clearTimeout(timer);
    opt.signal?.removeEventListener('abort', onAbort);
  }
}

function toLlmError(e: unknown, timedOut = false): LlmError {
  if (e instanceof LlmError) return e;
  if (timedOut) return new LlmError('timeout', '模型超过 ' + DEFAULT_TIMEOUT_MS / 1000 + ' 秒没有响应，可以重试', true);
  if ((e as Error)?.name === 'AbortError') return new LlmError('aborted', '已停止', false);
  return new LlmError('network', '连不上 AI 接口，请确认 npm run dev 正在运行、网络正常（' + ((e as Error)?.message ?? e) + '）', true);
}

/** 一次性拿到完整回复 */
export async function chat(messages: LlmMessage[], opt: ChatOptions = {}): Promise<ChatResult> {
  const res = await post(buildBody(messages, opt, false), opt);
  let data: any;
  try { data = await res.json(); } catch (e) { throw toLlmError(e); }
  const u = data.usage;
  const text: string = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw emptyError(data.choices?.[0]?.finish_reason);
  return {
    text,
    usage: u && { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens },
  };
}

function emptyError(finish?: string) {
  return finish === 'length'
    ? new LlmError('empty', '模型把输出额度都用在思考上了，没写出回复。请调大 maxTokens 后重试', true)
    : new LlmError('empty', '模型返回了空内容，可以重试', true);
}

/** 边生成边回调，适合讨论室里逐字显示发言；返回完整文本 */
export async function chatStream(messages: LlmMessage[], onDelta: (chunk: string) => void, opt: ChatOptions = {}): Promise<string> {
  const res = await post(buildBody(messages, opt, true), opt);
  if (!res.body) throw new LlmError('network', 'AI 接口没有返回内容，可以重试', true);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let finish: string | undefined;
  const onAbort = () => reader.cancel().catch(() => {});
  opt.signal?.addEventListener('abort', onAbort);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (opt.signal?.aborted) throw new LlmError('aborted', '已停止', false);
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') { buf = ''; break; }
        try {
          const choice = JSON.parse(payload).choices?.[0];
          if (choice?.finish_reason) finish = choice.finish_reason;
          const delta = choice?.delta?.content;
          if (delta) { full += delta; onDelta(delta); }
        } catch { /* 忽略不完整的行 */ }
      }
    }
  } catch (e) {
    throw toLlmError(e);
  } finally {
    opt.signal?.removeEventListener('abort', onAbort);
  }
  if (!full.trim()) throw emptyError(finish);
  return full;
}
