/**
 * AI 接口转发：前端只请求同源的 /api/llm/chat，这里补上 API Key 再转给模型服务商。
 * Key 只在服务器端读取，浏览器里看不到。
 * 按 OpenAI 兼容格式（POST {baseUrl}/chat/completions）转发，和 /api/sessions 用同一套 ROUNDTABLE_* 配置，
 * 换服务商只改 roundtable-ui/.env.local。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { LlmConfig } from './config.ts';
import { unwrapCompletion } from './llmAgent.ts';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
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
    if (!cfg.apiKey) return sendJson(res, 500, { error: '服务器没有配置 ROUNDTABLE_API_KEY，请在 roundtable-ui/.env.local 里填写' });

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: '请求体不是合法 JSON' });
    }

    try {
      const upstream = await fetch(cfg.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
        // 前端没指定模型时用 ROUNDTABLE_MODEL
        body: JSON.stringify({ ...body, model: body.model || cfg.model }),
      });
      const type = upstream.headers.get('content-type') || 'application/json';
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', type);
      if (!upstream.body) return res.end();
      // 流式回复（stream: true）本来就是标准格式，原样转回前端
      if (type.includes('text/event-stream')) return void Readable.fromWeb(upstream.body as never).pipe(res);
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
