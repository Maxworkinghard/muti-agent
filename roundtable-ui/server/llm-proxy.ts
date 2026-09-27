/**
 * AI 接口转发：前端只请求同源的 /api/llm/chat，这里补上 API Key 再转给模型服务商。
 * Key 只在服务器端读取，浏览器里看不到。
 * 默认按 OpenAI 兼容格式（POST {baseUrl}/chat/completions）转发，
 * DeepSeek、通义千问、Kimi、智谱、OpenAI 等都支持这个格式，换服务商只改 .env。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

export interface LlmEnv {
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
}

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

export function createLlmHandler(env: LlmEnv) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' });
    if (!env.LLM_API_KEY) return sendJson(res, 500, { error: '服务器没有配置 LLM_API_KEY，请在 roundtable-ui/.env 里填写' });

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: '请求体不是合法 JSON' });
    }

    const baseUrl = (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    try {
      const upstream = await fetch(baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.LLM_API_KEY },
        // 前端没指定模型时用 .env 里的默认模型
        body: JSON.stringify({ ...body, model: body.model || env.LLM_MODEL }),
      });
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      if (!upstream.body) return res.end();
      // 普通回复和流式回复（stream: true）都原样转回前端
      Readable.fromWeb(upstream.body as never).pipe(res);
    } catch (e) {
      sendJson(res, 502, { error: '连不上模型服务：' + (e as Error).message });
    }
  };
}
