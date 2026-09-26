import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentState, ChatMessage, DiscussionEngine, DiscussionResult, EngineEvent, Participant, SessionConfig, TaskEvent,
} from '../types';
import { SCENES } from '../data/scenes';
import { modeById } from '../data/modes';
import { ENGINE_REGISTRY } from '../engine/registry';
import { PixelAvatar } from './PixelAvatar';

interface Status { state: AgentState; action: string }
interface Flight { id: string; from: { x: number; y: number }; to: { x: number; y: number }; via?: { x: number; y: number }; color: string; title: string }

const STATE_LABEL: Record<AgentState, string> = { idle: '待机', thinking: '思考', speaking: '发言', working: '工作', done: '完成' };

export function DiscussionView({ config, onExit }: { config: SessionConfig; onExit: () => void }) {
  const scene = SCENES[config.sceneId];
  const mode = modeById(config.mode);
  const engineRef = useRef<DiscussionEngine | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [round, setRound] = useState({ n: 0, label: '准备中' });
  // 没填主题时由引擎按用户第一句话生成，收到 theme 事件后更新
  const [theme, setTheme] = useState(config.theme.title);
  const [session, setSession] = useState<'running' | 'finished' | 'stopped'>('running');
  const [result, setResult] = useState<DiscussionResult | null>(null);
  const [tasks, setTasks] = useState<TaskEvent[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => Object.fromEntries(config.participants.map((p) => [p.agentId, p])), [config]);
  const seatOf = (id: string) => scene.seats[byId[id]?.seatIndex ?? 0];

  useEffect(() => {
    const engine = (ENGINE_REGISTRY[config.mode] ?? ENGINE_REGISTRY.entertainment)();
    engineRef.current = engine;
    const onEvent = (e: EngineEvent) => {
      switch (e.type) {
        case 'session': setSession(e.state); break;
        case 'round': setRound({ n: e.round, label: e.label }); break;
        case 'status': setStatus((s) => ({ ...s, [e.agentId]: { state: e.state, action: e.action } })); break;
        case 'message': setMessages((m) => [...m, e.message]); break;
        case 'result': setResult(e.result); break;
        case 'theme': setTheme(e.title); break;
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
    engine.start(config, onEvent);
    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // 自动滚到底部
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, focus, result]);

  const send = () => {
    const text = draft.trim();
    if (!text || session !== 'running') return;
    engineRef.current?.sendUserMessage({ text, targetAgentId: focus ?? undefined });
    setDraft('');
  };

  const focused = focus ? byId[focus] : null;
  // 进房间后不自动开始，用户对全体说了第一句话才开始
  const opened = messages.some((m) => m.kind === 'user' && !m.targetId);
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
        <span className="mode-tag" style={{ background: mode.color }}>{mode.name}</span>
        <h1 title={theme}>主题：{theme || '说出第一句话后自动生成'}</h1>
        <span className="round-tag">R{round.n}/{config.maxRounds} · {round.label}</span>
        <span className={'live ' + session}>{session === 'running' ? '● LIVE' : session === 'finished' ? '■ 已结束' : '■ 已停止'}</span>
      </header>

      {/* 中左：场景动态演示 */}
      <section className="stage">
        <div className="stage-inner">
          <img className="stage-bg" src={scene.image} alt={scene.name} draggable={false} />
          {config.sceneId === 'debate' && <div className="debate-board">{theme || '辩题待定'}</div>}
          {config.participants.map((p) => {
            const st = status[p.agentId]?.state ?? 'idle';
            const seat = scene.seats[p.seatIndex];
            const msg = st === 'speaking' ? lastSpeech(p.agentId) : undefined;
            return (
              <button
                key={p.agentId}
                className={`seat st-${st}${focus === p.agentId ? ' focus' : ''}${focus && focus !== p.agentId ? ' dim' : ''}`}
                style={{ left: seat.x + '%', top: seat.y + '%', ['--ac' as string]: p.color }}
                onClick={() => setFocus(focus === p.agentId ? null : p.agentId)}
              >
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
          {rounds.length === 0 && <p className="empty">{focused ? focused.persona.name + ' 还没有发言' : opened ? '等待第一位发言…' : '在下面说出你的问题或任务，大家收到后才开始'}</p>}
          {rounds.map(([r, ms]) => (
            <div key={r} className="round-block">
              <div className="round-sep">{r === 0 ? '准备' : `第 ${r} 轮 · ${mode.roundLabels[r - 1] ?? ''}`}</div>
              {ms.map((m) => <Line key={m.id} m={m} byId={byId} />)}
            </div>
          ))}
          {!focused && tasks.length > 0 && mode.track === 'work' && (
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
        </div>
        <div className="send">
          <input
            className="px-input"
            value={draft}
            placeholder={session !== 'running' ? '讨论已结束' : focused ? `对 ${focused.persona.name} 说…` : opened ? '对全体说…（点成员可以单独对话）' : '对全体说出问题或任务后才开始…'}
            disabled={session !== 'running'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }}
          />
          <button className="px-btn primary" onClick={send} disabled={session !== 'running' || !draft.trim()}>发送</button>
        </div>
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
  if (m.kind === 'notice') return <div className="line notice"><p>⚠ {m.text}</p></div>;
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

