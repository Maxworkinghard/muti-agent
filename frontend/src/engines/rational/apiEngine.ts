import type { ChatMessage, DiscussionEngine, EngineEvent, Participant, SessionConfig } from '../../types';

/**
 * 辩论引擎：接 backend/服务.py（PR5 的人物数据库 + 讨论引擎.py 的开场 → 交锋 → 收尾，最后主持人总结）。
 * POST /api/discuss 返回 SSE，每段 data: {...} 是一个后端事件。
 * 用户在讨论室发的第一句话（config.theme.brief）作为开场补充说明传给后端。
 */
export function createApiEngine(): DiscussionEngine {
  let cfg: SessionConfig;
  let emit: (e: EngineEvent) => void = () => {};
  let ctrl: AbortController | null = null;
  let round = 0;
  let ended = false;
  /** 讨论正常结束：还可以追问，走 /ask 接口 */
  let finished = false;
  let paused = false;
  /** 后端开始写总结 / 判定后，插话接口就没人读了；这之后说的话先存着，结束后按追问一条条发 */
  let wrapping = false;
  const held: Array<{ text: string; target?: string }> = [];
  let seq = 0;
  let motion: { motion: string; pro: string; con: string } | undefined;
  const uid = () => 'm-' + Date.now().toString(36) + '-' + (seq++).toString(36);
  /** 会话编号由后端生成，在 /api/discuss 的响应头里；拿到之前的插话、暂停等它到了再发 */
  let sid: Promise<string> = new Promise(() => {});
  let gotSid: (id: string) => void = () => {};
  let noSid: (err: Error) => void = () => {};

  const idOf = (name?: string | null) => cfg.participants.find((p) => p.persona.name === name)?.agentId;
  const message = (m: Omit<ChatMessage, 'id' | 'at'>) => emit({ type: 'message', message: { ...m, id: uid(), at: Date.now() } });
  const allStatus = (state: 'idle' | 'done', action: string) =>
    cfg.participants.forEach((p) => emit({ type: 'status', agentId: p.agentId, state, action }));
  const finish = (state: 'finished' | 'stopped') => {
    if (ended) return;
    ended = true;
    finished = state === 'finished';
    paused = false;
    allStatus(state === 'finished' ? 'done' : 'idle', state === 'finished' ? '完成' : '已停止');
    emit({ type: 'session', state });
    const later = held.splice(0);
    if (finished) void later.reduce((p, h) => p.then(() => ask(h.text, h.target)), Promise.resolve());
    else if (later.length) emit({ type: 'error', id: 'held-' + uid(), message: `讨论没有正常结束，写总结期间说的 ${later.length} 句话没有送达` });
  };
  const post = async (action: string, body?: unknown) =>
    fetch('/api/discuss/' + encodeURIComponent(await sid) + '/' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
    });

  /** 讨论结束后追问：后端按整场记录让被点名的人（没点名由主持人）回答 */
  async function ask(text: string, target?: string) {
    const who = idOf(target) ?? cfg.participants.find((p) => p.side === 'host')?.agentId;
    if (who) emit({ type: 'status', agentId: who, state: 'thinking', action: '准备回答' });
    try {
      const res = await post('ask', { text, target });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'HTTP ' + res.status);
      const id = idOf(data.name);
      if (who && who !== id) emit({ type: 'status', agentId: who, state: 'done', action: '完成' });
      if (!id) return;
      emit({ type: 'status', agentId: id, state: 'speaking', action: '回答追问' });
      message({ round, speakerId: id, text: data.speech, kind: 'reply', targetId: 'user', tag: '赛后追问', private: target ? true : undefined });
      window.setTimeout(() => emit({ type: 'status', agentId: id, state: 'done', action: '完成' }), 2500);
    } catch (err) {
      if (who) emit({ type: 'status', agentId: who, state: 'done', action: '完成' });
      emit({ type: 'error', id: 'ask-' + uid(), message: '追问没有得到回答：' + (err as Error).message });
    }
  }
  /** 选人物时存的是性格 id，后端要性格名 */
  const personalityOf = (p: Participant) => p.persona.personalities.find((x) => x.id === p.personalityId)?.label ?? p.personalityId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = (e: any) => {
    switch (e.type) {
      case 'round':
        round = e.round;
        emit({ type: 'round', round: e.round, label: e.stage });
        message({ round: e.round, speakerId: 'system', text: '第 ' + e.round + ' 轮 · ' + e.stage, kind: 'system' });
        break;
      case 'start':
        if (e.motion) motion = e.motion;
        break;
      case 'thinking': {
        const id = idOf(e.name);
        if (id) emit({ type: 'status', agentId: id, state: 'thinking', action: '思考中…' });
        break;
      }
      case 'speech': {
        const x = e.entry;
        const id = idOf(x.name);
        if (!id) break;
        emit({ type: 'status', agentId: id, state: 'speaking', action: e.private ? '私下回应用户' : e.toUser ? '回应你' : x.phase || x.stance || '发言中' });
        // 辩论里标出辩位和环节；站错阵营被纠正时也标出来，方便检查模型有没有守住立场
        const tag = x.title ? [x.title, x.phase, x.sideCheck === 'corrected' ? '已纠正立场' : x.sideCheck === 'mismatch' ? '⚠ 立场不符' : '']
          .filter(Boolean).join(' · ') : undefined;
        message({ round: x.round ?? round, speakerId: id, text: x.speech, kind: e.toUser ? 'reply' : 'speech', targetId: e.toUser ? 'user' : idOf(x.respondsTo), tag, private: e.private || undefined });
        // 发言气泡停留一会儿再回到倾听
        window.setTimeout(() => { if (!ended) emit({ type: 'status', agentId: id, state: 'idle', action: '倾听' }); }, 2500);
        break;
      }
      case 'summarizing':
        allStatus('idle', e.text);
        wrapping = true;
        break;
      case 'summary':
        emit({ type: 'result', result: {
          consensus: e.verdict?.consensus ?? [], disagreements: e.verdict?.disagreements ?? [],
          openQuestions: e.verdict?.unanswered?.length ? e.verdict.unanswered : (e.verdict?.openQuestions ?? []),
          suggestions: [], summary: e.text, verdict: e.verdict && { ...e.verdict, motion },
        } });
        break;
      case 'done':
        finish('finished');
        break;
      case 'stopped':
        finish('stopped');
        break;
      case 'error':
        emit({ type: 'error', id: 'err-' + uid(), message: e.message });
        finish('stopped');
        break;
    }
  };

  async function run() {
    ctrl = new AbortController();
    const body = {
      question: cfg.theme.title.trim(),
      brief: cfg.theme.brief ?? '',
      rounds: cfg.maxRounds,
      maxChars: cfg.maxChars ?? 150,
      // side 决定后端走正式辩论（正方/反方/主持）还是普通圆桌讨论
      members: cfg.participants.map((p) => ({ name: p.persona.name, personality: personalityOf(p), side: p.side })),
    };
    const res = await fetch('/api/discuss', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: '辩论后端没有响应（' + res.status + '）' }));
      handle({ type: 'error', message: err.error });
      return;
    }
    const id = res.headers.get('X-Session-Id');
    if (id) gotSid(id);
    else noSid(new Error('辩论后端没有返回会话编号'));
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data:'));
        if (line) handle(JSON.parse(line.slice(5)));
      }
    }
    // 流读完了却没收到 done / stopped / error：后端中途退出了（崩溃、重启），不能当成正常结束
    if (!ended) handle({ type: 'error', message: '和辩论后端的连接断了（后端可能重启过），这场讨论没有正常结束' });
  }

  return {
    start(config, onEvent) {
      cfg = config; emit = onEvent; ended = false; round = 0;
      sid = new Promise((resolve, reject) => { gotSid = resolve; noSid = reject; });
      sid.catch(() => {}); // 没拿到编号时，由等它的各个请求自己报错
      emit({ type: 'session', state: 'running' });
      allStatus('idle', '就座');
      run().catch((err) => {
        if (ended) return;
        if (err?.name === 'AbortError') finish('stopped');
        else handle({ type: 'error', message: '连不上辩论后端，请先在 backend 文件夹运行 python 服务.py（' + err + '）' });
      }).finally(() => noSid(new Error('没有连上辩论后端')));
    },
    sendUserMessage({ text, targetAgentId }) {
      if (ended && !finished) return;
      // 点成员 = 私聊：只有他看得到（后端也只把这句话给这个成员）
      message({ round, speakerId: 'user', text, kind: 'user', targetId: targetAgentId, private: targetAgentId ? true : undefined });
      const target = cfg.participants.find((p) => p.agentId === targetAgentId)?.persona.name;
      if (finished) { void ask(text, target); return; }
      if (wrapping) { held.push({ text, target }); return; }
      post('say', { text, target })
        .then((res) => { if (!res.ok) throw new Error(); })
        .catch(() => emit({ type: 'error', id: 'say-' + uid(), message: '插话没有送达' }));
    },
    pause() {
      if (ended || paused) return;
      paused = true;
      post('pause').catch(() => {});
      emit({ type: 'session', state: 'paused' });
    },
    resume() {
      if (ended || !paused) return;
      paused = false;
      post('resume').catch(() => {});
      emit({ type: 'session', state: 'running' });
    },
    stop() {
      if (ended) return;
      post('stop').catch(() => {});
      ctrl?.abort();
      finish('stopped');
    },
  };
}
