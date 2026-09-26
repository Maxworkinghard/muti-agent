import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionConfig } from '../src/types.ts';
import { DEBATE_CHARS, DEBATE_ROUNDS, isModeId } from '../src/data/modes.ts';
import { readConfig } from './config.ts';
import { RoundtableSession } from './session.ts';
import { DiscussionSession, LIMITS, prepareDiscussion } from './discussion.ts';
import { readOptions } from './personaDb.ts';
import { createLlmHandler } from './llm-proxy.ts';

/**
 * 后端接口（挂在 Vite 开发 / 预览服务器上，Key 只在这里读取，不会进前端代码）：
 *   GET  /api/health                     当前模型和配置状态
 *   GET  /api/discussion/options         理性讨论的人物、性格和人数 / 轮数 / 字数范围（读 personaDir 里的人格数据库）
 *   POST /api/sessions                   用 SessionConfig 开一场会话 → { sessionId }
 *   GET  /api/sessions/:id/events        SSE 推送 EngineEvent，断线重连按 Last-Event-ID 补发
 *   POST /api/sessions/:id/messages      用户插话 { text, targetAgentId? }
 *   POST /api/sessions/:id/stop          停止会话并中断进行中的模型请求
 *   POST /api/llm/chat                   转发给模型服务（OpenAI 兼容），给在浏览器里写流程的引擎用
 */
export function createApi(env: Record<string, string | undefined>, personaDir: string) {
  const cfg = readConfig(env);
  const setupError = cfg.apiKey ? '' : '没有配置 ROUNDTABLE_API_KEY（在 frontend/.env.local 里设置）';
  const sessions = new Map<string, RoundtableSession>();
  const llm = createLlmHandler(cfg);

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const [, , section, id, action] = url.pathname.split('/');

    if (req.method === 'GET' && section === 'health') {
      return json(res, 200, { ok: !setupError, error: setupError || undefined, model: cfg.model, baseUrl: cfg.baseUrl });
    }
    if (req.method === 'GET' && section === 'discussion' && id === 'options') {
      try {
        return json(res, 200, { ...(await readOptions(personaDir)), model: cfg.model, configError: setupError || null, limits: LIMITS });
      } catch (e) {
        return json(res, 500, { error: (e as Error).message });
      }
    }
    if (section === 'llm' && id === 'chat') return llm(req, res);
    if (section !== 'sessions') return json(res, 404, { error: '没有这个接口' });

    if (req.method === 'POST' && !id) {
      if (setupError) return json(res, 503, { error: setupError });
      const body = await readJson(req);
      const problem = validate(body);
      if (problem) return json(res, 400, { error: problem });
      const sid = randomUUID();
      let session: RoundtableSession;
      if (body.mode === 'discussion') {
        const seats = await prepareDiscussion(body as SessionConfig, personaDir);
        if (typeof seats === 'string') return json(res, 400, { error: seats });
        session = new DiscussionSession(sid, body as SessionConfig, cfg, seats, personaDir);
      } else {
        session = new RoundtableSession(sid, body as SessionConfig, cfg);
      }
      sessions.set(sid, session);
      void session.run().finally(() => setTimeout(() => sessions.delete(sid), 10 * 60_000).unref());
      return json(res, 200, { sessionId: sid });
    }

    const session = id ? sessions.get(id) : undefined;
    if (!session) return json(res, 404, { error: '会话不存在或已过期' });

    if (req.method === 'GET' && action === 'events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
      const last = Number(req.headers['last-event-id']);
      const off = session.subscribe((e, i) => res.write(`id: ${i}\ndata: ${JSON.stringify(e)}\n\n`), Number.isFinite(last) ? last : -1);
      const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
      session.attach();
      // 浏览器断开看 res 的 close（req 的 close 在读完请求后就会触发）；断线后的写入错误直接忽略
      res.on('error', () => {});
      res.on('close', () => { clearInterval(ping); off(); session.detach(); });
      return;
    }
    if (req.method === 'POST' && action === 'messages') {
      const body = await readJson(req);
      const text = String(body?.text ?? '').trim().slice(0, 2000);
      if (text) session.userMessage(text, typeof body?.targetAgentId === 'string' ? body.targetAgentId : undefined);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && action === 'stop') {
      session.stop();
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: '没有这个接口' });
  }

  return {
    handle,
    /** 服务器关闭时停止全部会话 */
    dispose() { for (const s of sessions.values()) s.stop(); },
  };
}

function validate(b: any): string {
  if (!b || typeof b !== 'object') return '请求体不是 JSON 对象';
  if (!isModeId(b.mode)) return '未知模式：' + b.mode;
  if (typeof b.theme?.title !== 'string') return '缺少主题字段（可以是空字符串）';
  if (!Array.isArray(b.participants) || b.participants.length === 0) return '至少需要一位成员';
  for (const p of b.participants) {
    if (!p?.agentId || !p.persona?.name || !Array.isArray(p.persona.personalities)) return '成员资料不完整';
  }
  // 辩论的轮数和每次发言字数上限由选人页设置
  if (b.mode === 'rational') {
    const chars = Number(b.engineOptions?.maxChars ?? DEBATE_CHARS.default);
    if (!Number.isInteger(b.maxRounds) || b.maxRounds < DEBATE_ROUNDS.min || b.maxRounds > DEBATE_ROUNDS.max) return `辩论轮数要在 ${DEBATE_ROUNDS.min} 到 ${DEBATE_ROUNDS.max} 之间`;
    if (!(chars >= DEBATE_CHARS.min && chars <= DEBATE_CHARS.max)) return `每次发言字数上限要在 ${DEBATE_CHARS.min} 到 ${DEBATE_CHARS.max} 之间`;
  }
  return '';
}

function readJson(req: IncomingMessage, limit = 4 * 1024 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体太大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { resolve(null); }
    });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
