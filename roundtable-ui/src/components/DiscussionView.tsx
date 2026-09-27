import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentState, ChatMessage, DiscussionEngine, DiscussionResult, EngineEvent, Participant, SessionConfig, TaskEvent,
} from '../types';
import { sceneById } from '../data/scenes';
import { modeById, roundLabel } from '../data/modes';
import { engineFor } from '../engines/registry';
import { playReady, playSeat, SoundToggle } from '../sound';
import { PixelAvatar } from './PixelAvatar';

interface Status { state: AgentState; action: string }
interface Flight { id: string; from: { x: number; y: number }; to: { x: number; y: number }; via?: { x: number; y: number }; color: string; title: string }
interface ErrorItem { id: string; agentId?: string; message: string; retry?: () => void }

const STATE_LABEL: Record<AgentState, string> = { idle: '待机', thinking: '思考', speaking: '发言', working: '工作', done: '完成' };
/** 入场时每个人落座的间隔 */
const SEAT_GAP = 750;

export function DiscussionView({ config, onExit }: { config: SessionConfig; onExit: () => void }) {
  const scene = sceneById(config.sceneId);
  const mode = modeById(config.mode);
  const engineRef = useRef<DiscussionEngine | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [round, setRound] = useState({ n: 0, label: '准备中' });
  const [session, setSession] = useState<'waiting' | 'running' | 'finished' | 'stopped'>('waiting');
  const [result, setResult] = useState<DiscussionResult | null>(null);
  const [tasks, setTasks] = useState<TaskEvent[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  // 已经落座的人数；进入讨论页时大家依次入座
  const [seated, setSeated] = useState(0);
  const allSeated = seated >= config.participants.length;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (allSeated) { const t = window.setTimeout(playReady, 300); return () => clearTimeout(t); }
    const t = window.setTimeout(() => { playSeat(seated); setSeated(seated + 1); }, seated === 0 ? 400 : SEAT_GAP);
    return () => clearTimeout(t);
  }, [seated, allSeated]);
  const skipIntro = () => setSeated(config.participants.length);
  const entering = !allSeated && seated > 0 ? config.participants[seated - 1] : null;
  // 只有刚落座的人带落地动画；动画播完就去掉，之后状态切换不会再从天上掉一次
  const [landing, setLanding] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (seated === 0) return;
    const ids = config.participants.slice(0, seated).map((p) => p.agentId);
    setLanding((s) => new Set([...s, ...ids.filter((id) => !s.has(id))]));
    const t = window.setTimeout(() => setLanding(new Set()), 1000);
    return () => clearTimeout(t);
  }, [seated]);
  // 发言结束的人播放一次坐下（缩回座位）动画
  const prevState = useRef<Record<string, AgentState>>({});
  const [sitting, setSitting] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ended = Object.entries(status)
      .filter(([id, s]) => prevState.current[id] === 'speaking' && s.state !== 'speaking')
      .map(([id]) => id);
    prevState.current = Object.fromEntries(Object.entries(status).map(([id, s]) => [id, s.state]));
    if (!ended.length) return;
    setSitting((s) => new Set([...s, ...ended]));
    window.setTimeout(() => setSitting((s) => new Set([...s].filter((id) => !ended.includes(id)))), 400);
  }, [status]);

  const byId = useMemo(() => Object.fromEntries(config.participants.map((p) => [p.agentId, p])), [config]);
  const seatOf = (id: string) => scene.seats[byId[id]?.seatIndex ?? 0];

  // 用户发完第一句（对项目的理解）后才启动引擎
  const startWith = (brief: string) => {
    const engine = engineFor(config.mode).create();
    engineRef.current = engine;
    setMessages([{ id: 'brief', round: 0, speakerId: 'user', text: brief, kind: 'user', at: Date.now() }]);
    setSession('running');
    const onEvent = (e: EngineEvent) => {
      switch (e.type) {
        case 'session': setSession(e.state); break;
        case 'round': setRound({ n: e.round, label: e.label }); break;
        case 'status': setStatus((s) => ({ ...s, [e.agentId]: { state: e.state, action: e.action } })); break;
        case 'message': setMessages((m) => [...m, e.message]); break;
        case 'message_update': setMessages((m) => m.map((x) => (x.id === e.id ? { ...x, text: e.text } : x))); break;
        case 'result': setResult(e.result); break;
        case 'error':
          setErrors((es) => [...es.filter((x) => x.id !== e.id), { id: e.id, agentId: e.agentId, message: e.message, retry: e.retry }]);
          break;
        case 'task': {
          setTasks((t) => [...t, e.task]);
          const p = byId[e.task.from];
          const a = scene.seats[p?.seatIndex ?? 0];
          const b = scene.seats[byId[e.task.to]?.seatIndex ?? 0];
          const f: Flight = { id: e.task.id, from: a, to: b, via: scene.center, color: p?.color ?? '#d4b04c', title: e.task.title };
          setFlights((fs) => [...fs, f]);
          window.setTimeout(() => setFlights((fs) => fs.filter((x) => x.id !== f.id)), 1500);
          break;
        }
      }
    };
    try {
      engine.start({ ...config, theme: { ...config.theme, brief } }, onEvent);
    } catch (err) {
      onEvent({ type: 'error', id: 'start', message: '引擎启动失败：' + (err as Error).message });
    }
  };
  useEffect(() => () => engineRef.current?.stop(), []);

  // 自动滚到底部
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, focus, result, errors]);

  const dismiss = (id: string) => setErrors((es) => es.filter((x) => x.id !== id));
  const retry = (e: ErrorItem) => { dismiss(e.id); e.retry?.(); };
  const hasError = (agentId: string) => errors.some((x) => x.agentId === agentId);

  const send = () => {
    const text = draft.trim();
    if (session === 'waiting') {
      if (!text) return;
      skipIntro();
      startWith(text);
      setDraft('');
      return;
    }
    if (!text || session !== 'running') return;
    engineRef.current?.sendUserMessage({ text, targetAgentId: focus ?? undefined });
    setDraft('');
  };

  const focused = focus ? byId[focus] : null;
  const visible = focused
    ? messages.filter((m) => m.speakerId === focus || (m.speakerId === 'user' && m.targetId === focus))
    : messages;
  // 按轮次分组
  const rounds = useMemo(() => {
    const g = new Map<number, ChatMessage[]>();
    visible.forEach((m) => { if (m.kind === 'system') return; g.set(m.round, [...(g.get(m.round) ?? []), m]); });
    return [...g.entries()].sort((a, b) => a[0] - b[0]);
  }, [visible]);

  const lastSpeech = (id: string) => [...messages].reverse().find((m) => m.speakerId === id && m.kind !== 'task');

  return (
    <div className={'room' + (collapsed ? ' collapsed' : '')}>
      {/* 顶部：主题 */}
      <header className="room-theme">
        <button className="px-btn tiny" onClick={onExit}>◀</button>
        <span className="mode-tag" style={{ background: mode.color }} title={engineFor(config.mode).name + ' · ' + engineFor(config.mode).owner}>{mode.name}</span>
        <h1 title={config.theme.title}>主题：{config.theme.title}</h1>
        <SoundToggle />
        <span className="round-tag">R{round.n}/{config.maxRounds} · {round.label}</span>
        <span className={'live ' + session}>{session === 'waiting' ? '○ 等你开场' : session === 'running' ? '● LIVE' : session === 'finished' ? '■ 已结束' : '■ 已停止'}</span>
      </header>

      {/* 中左：场景动态演示 */}
      <section className="stage">
        <div className="stage-inner">
          <img className="stage-bg" src={scene.image} alt={scene.name} draggable={false} />
          {config.sceneId === 'debate' && <div className="debate-board">{config.theme.title}</div>}
          {config.participants.map((p, i) => {
            if (i >= seated) return null;
            const st = status[p.agentId]?.state ?? 'idle';
            const seat = scene.seats[p.seatIndex];
            const msg = st === 'speaking' ? lastSpeech(p.agentId) : undefined;
            return (
              <button
                key={p.agentId}
                className={`seat st-${st}${landing.has(p.agentId) ? ' arrive' : ''}${sitting.has(p.agentId) && st !== 'speaking' ? ' sitdown' : ''}${focus === p.agentId ? ' focus' : ''}${focus && focus !== p.agentId ? ' dim' : ''}${hasError(p.agentId) ? ' err' : ''}`}
                style={{ left: seat.x + '%', top: seat.y + '%', ['--ac' as string]: p.color }}
                onClick={() => setFocus(focus === p.agentId ? null : p.agentId)}
              >
                {landing.has(p.agentId) && <span className="landing" />}
                {hasError(p.agentId) && <span className="err-badge" title="发言失败，在右侧工作区可以重试">!</span>}
                {st === 'thinking' && <span className="think">•••</span>}
                {msg && <span className={'bubble' + (seat.y < 30 ? ' below' : '')}>{msg.text}</span>}
                {st === 'working' && <span className="work-icon">⌨</span>}
                <span className="body"><PixelAvatar v={p.persona.visual} size={st === 'speaking' ? 44 : 36} standing={st === 'speaking'} /></span>
                <span className="nameplate">{p.isLead ? '★' : ''}{p.persona.name}</span>
              </button>
            );
          })}
          {flights.map((f) => (
            <span
              key={f.id}
              className="flight"
              style={{
                ['--fx' as string]: f.from.x + '%', ['--fy' as string]: f.from.y + '%',
                ['--mx' as string]: (f.via ?? f.to).x + '%', ['--my' as string]: (f.via ?? f.to).y + '%',
                ['--tx' as string]: f.to.x + '%', ['--ty' as string]: f.to.y + '%',
                ['--fc' as string]: f.color,
              }}
            >
              <i />
            </span>
          ))}
          {session === 'finished' && <div className="stage-banner">讨论结束 · 结果已写入工作区</div>}
          {entering && (
            <div key={entering.agentId} className="intro-card" style={{ ['--ac' as string]: entering.color }}>
              <em>{String(seated).padStart(2, '0')}</em>
              <span className="pc-avatar"><PixelAvatar v={entering.persona.visual} size={44} /></span>
              <div>
                <i>{entering.side ? { pro: '正方', con: '反方', host: '主持' }[entering.side] : entering.isLead ? '负责人' : '入座'}</i>
                <strong>{entering.persona.name}</strong>
                <small>{entering.persona.identity}</small>
              </div>
            </div>
          )}
          {!allSeated && <button className="px-btn tiny intro-skip" onClick={skipIntro}>跳过入场 ▶▶</button>}
          {session === 'waiting' && allSeated && <div className="stage-banner wait">大家已就座 · 等你一句话就开始</div>}
        </div>
      </section>

      {/* 右：工作区 */}
      <aside className="work">
        <button className="collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? '展开工作区' : '收起工作区'}>{collapsed ? '<' : '>'}</button>
        <div className="work-head">
          {focused ? (
            <>
              <span className="wh-dot" style={{ background: focused.color }} />
              <strong>工作区 · {focused.persona.name} 的每轮发言</strong>
              <button className="px-btn tiny" onClick={() => setFocus(null)}>返回全部</button>
            </>
          ) : (
            <strong>工作区 · 全部对话</strong>
          )}
        </div>
        {focused && <PersonaStrip p={focused} status={status[focused.agentId]} />}
        <div className="log" ref={logRef}>
          {session === 'waiting' && !focused && (
            <div className="brief-tip">
              <b>{allSeated ? '大家已就座，等你开口' : '大家正在入座…'}</b>
              <p>想说什么都可以，发出去讨论就开始。</p>
              {config.maxChars && <p>本场 {config.maxRounds} 轮，每人每次发言不超过 {config.maxChars} 字。</p>}
            </div>
          )}
          {rounds.length === 0 && session !== 'waiting' && <p className="empty">{focused ? focused.persona.name + ' 还没有发言' : '等待第一位发言…'}</p>}
          {rounds.map(([r, ms]) => (
            <div key={r} className="round-block">
              <div className="round-sep">{r === 0 ? '开场 · 你的理解' : `第 ${r} 轮 · ${roundLabel(config.mode, r, config.maxRounds)}`}</div>
              {ms.map((m) => <Line key={m.id} m={m} byId={byId} />)}
            </div>
          ))}
          {!focused && tasks.length > 0 && config.mode === 'product' && (
            <div className="task-board">
              <div className="round-sep">任务流转</div>
              {tasks.slice(-6).map((t) => (
                <div key={t.id} className={'task t-' + t.status}>
                  <b>{byId[t.from]?.persona.name}</b> → <b>{byId[t.to]?.persona.name}</b> · {t.title}
                  <em>{t.status === 'assigned' ? '已派发' : t.status === 'handoff' ? '交接' : '交付'}</em>
                </div>
              ))}
            </div>
          )}
          {result && !focused && <ResultCard r={result} />}
          {errors.filter((e) => !focused || !e.agentId || e.agentId === focus).map((e) => (
            <div key={e.id} className="err-line" role="alert">
              <b>{e.agentId ? (byId[e.agentId]?.persona.name ?? e.agentId) + ' 这次发言失败' : '讨论出错'}</b>
              <p>{e.message}</p>
              <div className="err-actions">
                {e.retry && session === 'running' && <button className="px-btn tiny primary" onClick={() => retry(e)}>重试</button>}
                <button className="px-btn tiny" onClick={() => dismiss(e.id)}>知道了</button>
              </div>
            </div>
          ))}
        </div>
        {session === 'waiting' ? (
          <div className="send brief">
            <textarea
              className="px-input"
              rows={5}
              autoFocus
              value={draft}
              placeholder={`可以说说你对「${config.theme.title}」的理解、背景或关心的点，大家会围绕它讨论；也可以只说一句“OK，开始吧”。（Ctrl+Enter 发送）`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}
            />
            <div className="brief-foot">
              <small />
              <button className="px-btn primary" onClick={send} disabled={!draft.trim()}>发送</button>
            </div>
          </div>
        ) : (
          <div className="send">
            <input
              className="px-input"
              value={draft}
              placeholder={session !== 'running' ? '讨论已结束' : focused ? `对 ${focused.persona.name} 说…` : '对全体说…（点成员可以单独对话）'}
              disabled={session !== 'running'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }}
            />
            <button className="px-btn primary" onClick={send} disabled={session !== 'running' || !draft.trim()}>发送</button>
          </div>
        )}
      </aside>

      {/* 底部：成员 */}
      <footer className="members">
        <span className="members-title">成员</span>
        <div className="member-list">
          {config.participants.map((p) => {
            const st = status[p.agentId] ?? { state: 'idle' as AgentState, action: '就座' };
            const count = messages.filter((m) => m.speakerId === p.agentId && m.kind !== 'task').length;
            return (
              <button
                key={p.agentId}
                className={`member st-${st.state}${focus === p.agentId ? ' on' : ''}`}
                style={{ ['--ac' as string]: p.color }}
                onClick={() => setFocus(focus === p.agentId ? null : p.agentId)}
              >
                <span className="m-avatar"><PixelAvatar v={p.persona.visual} size={40} /></span>
                <span className="m-info">
                  <strong>{p.isLead && '★'}{p.persona.name}{p.side && <i className={'side side-' + p.side}>{{ pro: '正', con: '反', host: '主' }[p.side]}</i>}</strong>
                  <small>{p.persona.personalities.find((x) => x.id === p.personalityId)?.label} · {count} 条</small>
                  <em><b className="dot" />{STATE_LABEL[st.state]} · {st.action}</em>
                </span>
              </button>
            );
          })}
        </div>
        {session === 'running' && <button className="px-btn danger" onClick={() => engineRef.current?.stop()}>停止</button>}
      </footer>
    </div>
  );
}

function Line({ m, byId }: { m: ChatMessage; byId: Record<string, Participant> }) {
  if (m.speakerId === 'user') {
    const to = m.targetId ? byId[m.targetId]?.persona.name : '全体';
    return <div className="line user"><div className="who">你 → {to}</div><p>{m.text}</p></div>;
  }
  const p = byId[m.speakerId];
  if (!p) return null;
  return (
    <div className={'line ' + m.kind} style={{ ['--ac' as string]: p.color }}>
      <span className="l-avatar"><PixelAvatar v={p.persona.visual} size={28} /></span>
      <div>
        <div className="who">{p.persona.name}{m.kind === 'reply' && <i>回复你</i>}</div>
        <p>{m.text}</p>
      </div>
    </div>
  );
}

function PersonaStrip({ p, status }: { p: Participant; status?: Status }) {
  const per = p.persona.personalities.find((x) => x.id === p.personalityId);
  return (
    <div className="persona-strip" style={{ ['--ac' as string]: p.color }}>
      <PixelAvatar v={p.persona.visual} size={36} />
      <div>
        <b>{p.persona.identity}</b>
        <small>性格：{per?.label} · 知识：{p.persona.knowledge.join('/')} · 当前：{status?.action ?? '就座'}</small>
      </div>
    </div>
  );
}

function ResultCard({ r }: { r: DiscussionResult }) {
  const sec: Array<[string, string[] | undefined, string]> = [
    ['共识', r.consensus, 'green'], ['分歧', r.disagreements, 'orange'],
    ['待验证', r.openQuestions, 'blue'], ['建议', r.suggestions, 'purple'], ['交付物', r.deliverables, 'yellow'],
  ];
  return (
    <div className="result">
      <div className="round-sep">讨论结果</div>
      {sec.filter(([, v]) => v?.length).map(([k, v, c]) => (
        <div key={k} className={'res res-' + c}><b>{k}</b><ul>{v!.map((x) => <li key={x}>{x}</li>)}</ul></div>
      ))}
    </div>
  );
}
