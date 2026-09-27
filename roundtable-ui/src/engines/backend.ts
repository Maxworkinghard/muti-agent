import type { DiscussionEngine, EngineEvent } from '../types';

/**
 * 真实引擎：每位成员在后端是一段直接发给模型接口的对话（见 server/），前端只负责发起会话和转发事件。
 * 会话配置 POST 给 /api/sessions，事件通过 SSE 推回来。
 */
export function createBackendEngine(): DiscussionEngine {
  let emit: (e: EngineEvent) => void = () => {};
  let sessionId: string | null = null;
  let source: EventSource | null = null;
  let stopped = false;

  const notice = (text: string) =>
    emit({ type: 'message', message: { id: 'n-' + Date.now(), round: 0, speakerId: 'system', text, kind: 'notice', at: Date.now() } });
  const post = (path: string, body?: unknown, keepalive = false) =>
    fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), keepalive });

  return {
    start(config, onEvent) {
      emit = onEvent;
      emit({ type: 'session', state: 'running' });
      post('/api/sessions', config)
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error ?? 'HTTP ' + r.status);
          return data.sessionId as string;
        })
        .then((id) => {
          if (stopped) { void post(`/api/sessions/${id}/stop`); return; }
          sessionId = id;
          source = new EventSource(`/api/sessions/${id}/events`);
          source.onmessage = (ev) => {
            const e = JSON.parse(ev.data) as EngineEvent;
            emit(e);
            if (e.type === 'session' && e.state !== 'running') source?.close();
          };
          source.onerror = () => {
            if (stopped || source?.readyState !== EventSource.CLOSED) return;
            notice('和后端的连接断开了（开发服务器可能重启过），请返回后重新进入对话');
            emit({ type: 'session', state: 'stopped' });
          };
        })
        .catch((err: Error) => {
          if (stopped) return;
          notice(`无法启动引擎：${err.message}。确认用 npm run dev 启动、在 roundtable-ui/.env 配好 LLM_API_KEY`);
          emit({ type: 'session', state: 'stopped' });
        });
    },
    sendUserMessage({ text, targetAgentId }) {
      if (!sessionId || stopped) return;
      post(`/api/sessions/${sessionId}/messages`, { text, targetAgentId }).catch(() => notice('消息没有发出去，请重试'));
    },
    stop() {
      if (stopped) return;
      stopped = true;
      source?.close();
      if (sessionId) post(`/api/sessions/${sessionId}/stop`, undefined, true).catch(() => {});
      emit({ type: 'session', state: 'stopped' });
    },
  };
}
