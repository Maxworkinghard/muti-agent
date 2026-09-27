/**
 * AI 接口转发：前端只请求同源的 /api/llm/chat，这里补上 API Key 再转给模型服务商。
 * Key 只在服务器端读取，浏览器里看不到。
 * 按 OpenAI 兼容格式（POST {baseUrl}/chat/completions）转发，和 /api/sessions 用同一套 LLM_* 配置，
 * 换服务商只改 frontend/.env。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable, pipeline } from 'node:stream';
import type { LlmConfig } from './config.ts';
import { unwrapCompletion } from './llmAgent.ts';

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_TOKENS = 10000;
class BodyTooLarge extends Error {}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    req.on('data', (c: Buffer) => {
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new BodyTooLarge('请求体超过 1 MB'));
        return;
      }
      data += c;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function createLlmHandler(cfg: LlmConfig) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' });
    if (!cfg.apiKey) return sendJson(res, 500, { error: '服务器没有配置 LLM_API_KEY，请在 frontend/.env 里填写' });

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      return e instanceof BodyTooLarge
        ? sendJson(res, 413, { error: e.message })
        : sendJson(res, 400, { error: '请求体不是合法 JSON' });
    }
    if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) return sendJson(res, 400, { error: '缺少消息列表' });

    // 浏览器只用这些参数；模型与输出上限由服务端决定，避免直接转发任意高额度请求。
    const tokens = Number(body.max_tokens);
    const payload = {
      messages: body.messages,
      model: cfg.model,
      max_tokens: Number.isFinite(tokens) ? Math.min(Math.max(Math.trunc(tokens), 1), MAX_TOKENS) : MAX_TOKENS,
      ...(typeof body.temperature === 'number' && Number.isFinite(body.temperature) && body.temperature >= 0 && body.temperature <= 2
        ? { temperature: body.temperature } : {}),
      stream: body.stream === true,
    };

    // 浏览器中途断开（停止、离开页面）时一并中止到模型服务的请求，不再白白生成
    const ctrl = new AbortController();
    res.on('close', () => { if (!res.writableFinished) ctrl.abort(); });
    try {
      const upstream = await fetch(cfg.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const type = upstream.headers.get('content-type') || 'application/json';
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', type);
      if (!upstream.body) return res.end();
      // 流式回复（stream: true）本来就是标准格式，原样转回前端。
      // 用 pipeline 而不是 pipe：模型流中途断开时它会收掉两头并把错误交给回调，
      // 不会变成没人接的 'error' 事件把整个 Node 进程带崩；前端那边看到的是连接中断，按发言失败处理
      if (type.includes('text/event-stream')) return void pipeline(Readable.fromWeb(upstream.body as never), res, () => {});
      // 普通回复去掉网关的外层包装，前端拿到的总是标准 OpenAI 格式；不是 JSON 就原样转
      const raw = await upstream.text();
      let out = raw;
      try { out = JSON.stringify(unwrapCompletion(JSON.parse(raw))); } catch { /* 原样转 */ }
      res.end(out);
    } catch (e) {
      sendJson(res, 502, { error: '连不上模型服务：' + (e as Error).message });
    }
  };
}
