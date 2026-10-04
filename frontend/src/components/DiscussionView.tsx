import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentState, ChatMessage, DiscussionEngine, DiscussionResult, EngineEvent, Facing, MindView, Participant, PersonaVisual, SessionConfig, TaskEvent,
} from '../types';
import { sceneById } from '../data/scenes';
import { modeById, roundLabel } from '../data/modes';
import { nextConversationVariation } from '../data/conversationVariation';
import { engineFor } from '../engines/registry';
import { playReady, playSeat, playVoice, SoundToggle, useMuted, warmAudio } from '../sound';
import { PixelAvatar } from './PixelAvatar';
import { centroid, facingToward, type StagePoint, type StageView } from './stageFacing';
import { createBgm, playThinking, type Bgm } from './stageFx';
import { demoFlags } from '../demoFlags';

interface Status { state: AgentState; action: string }
interface Flight { id: string; fromSeat: number; toSeat: number; from: { x: number; y: number }; to: { x: number; y: number }; via?: { x: number; y: number }; color: string; title: string }
interface ErrorItem { id: string; agentId?: string; message: string; retry?: () => void }

const STATE_LABEL: Record<AgentState, string> = { idle: '待机', thinking: '思考', speaking: '发言', working: '工作', done: '完成' };
/** 入场时每个人落座的间隔 */
const SEAT_GAP = 750;
/** 心情会换掉的表情；人物自己的配饰（眼镜、围巾……）保留，心情平静时保留他自己原本的表情 */
const FACE_EXTRAS = new Set(['brows', 'sleepy', 'happy', 'grin', 'blush', 'sweat']);
const withFace = (v: PersonaVisual, mind?: MindView): PersonaVisual =>
  mind?.face.length ? { ...v, extras: [...(v.extras ?? []).filter((e) => !FACE_EXTRAS.has(e)), ...mind.face] } : v;
const SceneStage3D = lazy(() => import('./SceneStage3D').then((module) => ({ default: module.SceneStage3D })));

export function DiscussionView({ config, onExit, cinematicIntro }: {
  config: SessionConfig;
  onExit: () => void;
  /** demo cinematic：前约 20 秒场景聚焦，再展开工作区 */
  cinematicIntro?: boolean;
}) {
  const cinematic = Boolean(cinematicIntro ?? demoFlags.cinematic);
  const scene = sceneById(config.sceneId);
  const mode = modeById(config.mode);
  const engineRef = useRef<DiscussionEngine | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [round, setRound] = useState({ n: 0, label: '准备中' });
  const [session, setSession] = useState<'waiting' | 'running' | 'paused' | 'finished' | 'stopped'>('waiting');
  const [result, setResult] = useState<DiscussionResult | null>(null);
  const [tasks, setTasks] = useState<TaskEvent[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(cinematic);
  const [sceneFocus, setSceneFocus] = useState(cinematic);
  const [bubbleLinger, setBubbleLinger] = useState<Record<string, { text: string; until: number }>>({});
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [view3D, setView3D] = useState(Boolean(scene.model3d));
  const [threeReady, setThreeReady] = useState(false);
  const [threeError, setThreeError] = useState('');
  const [projectedSeats, setProjectedSeats] = useState<typeof scene.seats>([]);
  // 相机朝向和座位的世界坐标：三维里人物据此转身，二维用不到（保持原来的正面）
  const [stageView, setStageView] = useState<StageView | null>(null);
  const threeActive = Boolean(scene.model3d) && view3D && threeReady;
  const stageSeat = (index: number) => (threeActive ? projectedSeats[index] : undefined) ?? scene.seats[index];
  // 三维里大家围坐的那一点：每个人转身看向它，而不是一直正对镜头。
  // 二维场景没有世界坐标，facingOf 一律返回 S，保持原来的正面朝向。
  const conversationCenter = useMemo<StagePoint | null>(() => {
    if (!stageView) return null;
    const points = config.participants
      .map((p) => stageView.seats[p.seatIndex])
      .filter((seat): seat is StagePoint => Boolean(seat));
    return centroid(points);
  }, [stageView, config.participants]);
  const facingOf = (seatIndex: number): Facing => {
    if (!threeActive || !stageView || !conversationCenter) return 'S';
    const from = stageView.seats[seatIndex];
    return from ? facingToward(from, conversationCenter, stageView) : 'S';
  };
  // 娱乐、情感分析（导演 + 演员底盘）：每个人的内心、引擎给的段名（换话题 / 走到哪一步）
  const live = config.mode === 'entertainment' || config.mode === 'emotion';
  const [minds, setMinds] = useState<Record<string, MindView>>({});
  const [labels, setLabels] = useState<Record<number, string>>({});
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
  // 娱乐模式：入场时放背景音乐，讨论开始后压低音量；静音跟顶部音效开关走
  const showEntrance = config.mode === 'entertainment';
  const muted = useMuted();
  const bgmRef = useRef<Bgm | null>(null);
  useEffect(() => {
    if (!showEntrance) return;
    const bgm = createBgm();
    bgmRef.current = bgm;
    const t = window.setTimeout(() => bgm.start(), 200);
    return () => { clearTimeout(t); bgm.stop(); bgmRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { bgmRef.current?.setMuted(muted); }, [muted]);
  // 只有刚落座的人带落地动画；动画播完就去掉，之后状态切换不会再从天上掉一次
  const [landing, setLanding] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (seated === 0) return;
    const ids = config.participants.slice(0, seated).map((p) => p.agentId);
    setLanding((s) => new Set([...s, ...ids.filter((id) => !s.has(id))]));
    const t = window.setTimeout(() => setLanding(new Set()), 1000);
    return () => clearTimeout(t);
  }, [seated]);
  // 发言结束的人播放一次坐下（缩回座位）动画；demo cinematic 时末句气泡再挂一会儿
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
    // demo cinematic: linger after speaking ends (~1100ms last visible; mid-lines stay via status===speaking)
    if (cinematic) {
      for (const id of ended) {
        const msg = [...messages].reverse().find((m) => m.speakerId === id && m.kind !== 'task');
        if (!msg?.text) continue;
        const hold = 1100;
        const until = Date.now() + hold;
        setBubbleLinger((b) => ({ ...b, [id]: { text: msg.text, until } }));
        window.setTimeout(() => {
          setBubbleLinger((b) => {
            if (!b[id] || b[id].until > Date.now()) return b;
            const { [id]: _, ...rest } = b;
            return rest;
          });
        }, hold + 30);
      }
    }
  }, [status, messages, cinematic]);

  // demo cinematic：约 20 秒后从场景聚焦展开到整页
  useEffect(() => {
    if (!cinematic) return;
    setCollapsed(true);
    setSceneFocus(true);
    const t = window.setTimeout(() => {
      setSceneFocus(false);
      setCollapsed(false);
    }, 20000);
    return () => clearTimeout(t);
  }, [cinematic]);

  const byId = useMemo(() => Object.fromEntries(config.participants.map((p) => [p.agentId, p])), [config]);
  const seatOf = (id: string) => scene.seats[byId[id]?.seatIndex ?? 0];

  // 说话音效：每条发言一出字就叽咕一声（包括每轮第一个人）；流式输出时每长出一段再叽咕一下，同一条至少隔 350ms
  const voiceAt = useRef<Record<string, number>>({});
  const voiceLen = useRef<Record<string, number>>({});
  const chatter = (agentId: string, id: string, text: string) => {
    if (!byId[agentId] || !text) return; // 空气泡先不响，等第一段文字出来再响
    const now = Date.now();
    const first = voiceLen.current[id] === undefined;
    const grown = text.length - (voiceLen.current[id] ?? 0);
    if (!first && grown < 12) return;
    if (!first && now - (voiceAt.current[id] ?? 0) < 350) return;
    voiceAt.current[id] = now;
    voiceLen.current[id] = text.length;
    playVoice(agentId, Math.max(3, Math.min(8, Math.ceil(Math.max(grown, 12) / 8))));
  };
  const speakerOf = useRef<Record<string, string>>({});

  // 用户发完第一句（对项目的理解）后才启动引擎
  const startWith = (brief: string) => {
    warmAudio();
    const engine = engineFor(config.mode).create();
    engineRef.current = engine;
    skipIntro();
    bgmRef.current?.duck();
    setMessages([{ id: 'brief', round: 0, speakerId: 'user', text: brief, kind: 'user', at: Date.now() }]);
    setSession('running');
    const onEvent = (e: EngineEvent) => {
      switch (e.type) {
        case 'session': setSession(e.state); break;
        case 'round':
          setRound({ n: e.round, label: e.label });
          setLabels((l) => ({ ...l, [e.round]: e.label }));
          break;
        case 'mind': setMinds((ms) => ({ ...ms, [e.agentId]: e.mind })); break;
        case 'status':
          if (e.state === 'thinking' && showEntrance) playThinking();
          setStatus((s) => ({ ...s, [e.agentId]: { state: e.state, action: e.action } }));
          break;
        case 'message': {
          speakerOf.current[e.message.id] = e.message.speakerId;
          if (e.message.kind === 'speech' || e.message.kind === 'reply' || e.message.kind === 'react') chatter(e.message.speakerId, e.message.id, e.message.text);
          setMessages((m) => [...m, e.message]);
          break;
        }
        case 'message_update':
          chatter(speakerOf.current[e.id] ?? '', e.id, e.text);
          setMessages((m) => m.map((x) => (x.id === e.id ? { ...x, text: e.text, cut: e.cut ?? x.cut } : x)));
          break;
        case 'result': setResult(e.result); break;
        case 'error':
          setErrors((es) => [...es.filter((x) => x.id !== e.id), { id: e.id, agentId: e.agentId, message: e.message, retry: e.retry }]);
          break;
        case 'task': {
          setTasks((t) => [...t, e.task]);
          const p = byId[e.task.from];
          const a = scene.seats[p?.seatIndex ?? 0];
          const b = scene.seats[byId[e.task.to]?.seatIndex ?? 0];
          const f: Flight = { id: e.task.id, fromSeat: p?.seatIndex ?? 0, toSeat: byId[e.task.to]?.seatIndex ?? 0, from: a, to: b, via: scene.center, color: p?.color ?? '#d4b04c', title: e.task.title };
          setFlights((fs) => [...fs, f]);
          window.setTimeout(() => setFlights((fs) => fs.filter((x) => x.id !== f.id)), 1500);
          break;
        }
      }
    };
    try {
      engine.start({ ...config, conversationVariation: nextConversationVariation(config), theme: { ...config.theme, brief } }, onEvent);
    } catch (err) {
      onEvent({ type: 'error', id: 'start', message: '引擎启动失败：' + (err as Error).message });
    }
  };
  useEffect(() => () => engineRef.current?.stop(), []);

  // demo cinematic：入座后用主题自动开场，省掉 brief 输入
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!cinematic || !allSeated || session !== 'waiting' || autoStarted.current) return;
    autoStarted.current = true;
    const t = window.setTimeout(() => startWith(config.theme.title || '开始吧'), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cinematic, allSeated, session]);

  // 自动滚到底部
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, focus, result, errors]);

  const dismiss = (id: string) => setErrors((es) => es.filter((x) => x.id !== id));
  const retry = (e: ErrorItem) => { dismiss(e.id); e.retry?.(); };
  const hasError = (agentId: string) => errors.some((x) => x.agentId === agentId);

  const send = () => {
    warmAudio();
    const text = draft.trim();
    if (session === 'waiting') {
      if (!text) return;
      skipIntro();
      startWith(text);
      setDraft('');
      return;
    }
    if (!text || session === 'stopped') return;
    engineRef.current?.sendUserMessage({ text, targetAgentId: focus ?? undefined });
    setDraft('');
  };
  const togglePause = () => {
    if (session === 'running') engineRef.current?.pause();
    else if (session === 'paused') engineRef.current?.resume();
  };
  const canTalk = session === 'running' || session === 'paused' || session === 'finished';

  const focused = focus ? byId[focus] : null;
  const visible = focused
    ? messages.filter((m) => m.kind === 'notice' || m.speakerId === focus || (m.speakerId === 'user' && m.targetId === focus))
    : messages;
  // 按轮次分组
  const rounds = useMemo(() => {
    const g = new Map<number, ChatMessage[]>();
    visible.forEach((m) => { if (m.kind === 'system') return; g.set(m.round, [...(g.get(m.round) ?? []), m]); });
    return [...g.entries()].sort((a, b) => a[0] - b[0]);
  }, [visible]);

  const lastSpeech = (id: string) => [...messages].reverse().find((m) => m.speakerId === id && m.kind !== 'task' && !m.private);

  return (
    <div className={'room' + (collapsed ? ' collapsed' : '') + (sceneFocus ? ' scene-focus' : '') + (cinematic ? ' demo-discussion' : '')}>
      {/* 顶部：主题 */}
      <header className="room-theme">
        <button className="px-btn tiny" onClick={onExit}>◀</button>
        <span className="mode-tag" style={{ background: mode.color }} title={engineFor(config.mode).name + ' · ' + engineFor(config.mode).owner}>{mode.name}</span>
        <h1 title={config.theme.title}>主题：{config.theme.title}</h1>
        <SoundToggle />
        <span className="round-tag">{live ? `${round.label} · ${messages.filter((m) => m.kind === 'speech').length} 句` : `R${round.n}/${config.maxRounds} · ${round.label}`}</span>
        <span className={'live ' + session}>{{ waiting: '○ 等你开场', running: '● LIVE', paused: '⏸ 已暂停', finished: live ? '■ 散场了 · 再说话能接着聊' : '■ 已结束 · 可追问', stopped: '■ 已停止' }[session]}</span>
      </header>

      {/* 中左：场景动态演示 */}
      <section className="stage">
        <div className={'stage-inner' + (threeActive ? ' stage-3d-ready' : '')}>
          <img className="stage-bg" src={scene.image} alt={scene.name} draggable={false} />
          {view3D && scene.model3d && <Suspense fallback={null}><SceneStage3D
            scene={scene}
            onLoaded={(error) => {
              if (error) { setThreeError(error); setView3D(false); setThreeReady(false); }
              else { setThreeError(''); setThreeReady(true); }
            }}
            onSeatPositions={setProjectedSeats}
            onStageView={setStageView}
          /></Suspense>}
          {scene.model3d && <button
            className="stage-view-toggle"
            onClick={() => { setView3D(!view3D); setThreeReady(false); setThreeError(''); }}
            aria-label={view3D ? '切换到 2D 场景' : '切换到 3D 场景'}
            title={view3D ? '切换到 2D 场景' : '切换到 3D 场景'}
          >{view3D ? '◧ 2D' : '◈ 3D'}</button>}
          {threeActive && <span className="stage-view-hint">拖动旋转 · 滚轮缩放</span>}
          {threeError && <span className="stage-model-error" role="status">{threeError}</span>}
          {(scene.sourceSceneId ?? scene.id) === 'debate' && !threeActive && <div className="debate-board">{config.theme.title}</div>}
          {config.participants.map((p, i) => {
            if (i >= seated) return null;
            const st = status[p.agentId]?.state ?? 'idle';
            const seat = stageSeat(p.seatIndex);
            const liveSpeech = st === 'speaking' ? lastSpeech(p.agentId) : undefined;
            const linger = bubbleLinger[p.agentId];
            const lingerOk = linger && linger.until > Date.now();
            const msg = liveSpeech ?? (lingerOk ? { text: linger!.text } as ChatMessage : undefined);
            const mind = minds[p.agentId];
            return (
              <button
                key={p.agentId}
                className={`seat st-${st}${landing.has(p.agentId) ? ' arrive' : ''}${sitting.has(p.agentId) && st !== 'speaking' ? ' sitdown' : ''}${focus === p.agentId ? ' focus' : ''}${focus && focus !== p.agentId ? ' dim' : ''}${hasError(p.agentId) ? ' err' : ''}`}
                style={{ left: seat.x + '%', top: seat.y + '%', ['--ac' as string]: p.color }}
                data-demo-seat={p.persona.name}
                onClick={() => setFocus(focus === p.agentId ? null : p.agentId)}
                title={mind ? `${p.persona.name} · ${mind.emoji} ${mind.label}${mind.inner ? '\n心里：' + mind.inner : ''}` : undefined}
              >
                {landing.has(p.agentId) && <span className="landing" />}
                {hasError(p.agentId) && <span className="err-badge" title="发言失败，在右侧工作区可以重试">!</span>}
                {mind && mind.label !== '平静' && <span key={mind.emoji} className="mood-badge">{mind.emoji}</span>}
                {st === 'thinking' && (
                  <span className={'thought' + (seat.y < 30 ? ' below' : '')} aria-label="思考中">
                    <span className="cloud"><i /><i /><i /></span>
                    <b className="puff p1" /><b className="puff p2" />
                  </span>
                )}
                {msg && <span className={'bubble' + (seat.y < 30 ? ' below' : '') + (!liveSpeech && lingerOk ? ' linger' : '')}>{msg.text}</span>}
                {st === 'working' && <span className="work-icon">⌨</span>}
                <span className="body"><PixelAvatar v={withFace(p.persona.visual, mind)} size={st === 'speaking' ? 44 : 36} standing={st === 'speaking'} facing={facingOf(p.seatIndex)} /></span>
                <span className="nameplate">{p.isLead ? '★' : ''}{p.persona.name}</span>
              </button>
            );
          })}
          {flights.map((f) => {
            const from = threeActive ? stageSeat(f.fromSeat) : f.from;
            const to = threeActive ? stageSeat(f.toSeat) : f.to;
            const via = threeActive ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 10 } : f.via ?? f.to;
            return <span
              key={f.id}
              className="flight"
              style={{
                ['--fx' as string]: from.x + '%', ['--fy' as string]: from.y + '%',
                ['--mx' as string]: via.x + '%', ['--my' as string]: via.y + '%',
                ['--tx' as string]: to.x + '%', ['--ty' as string]: to.y + '%',
                ['--fc' as string]: f.color,
              }}
            ><i /></span>;
          })}
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
          {session === 'paused' && <div className="stage-banner wait">已暂停 · 可以先说你的想法，点「继续」接着讨论</div>}
        </div>
      </section>

      {/* 右：工作区 */}
      <aside className="work">
        <button className="collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? '展开工作区' : '收起工作区'}>{collapsed ? '<' : '>'}</button>
        <div className="work-head">
          {focused ? (
            <>
              <span className="wh-dot" style={{ background: focused.color }} />
              <strong>工作区 · {focused.persona.name} {live ? '的发言和私聊' : '的每轮发言'}</strong>
              <button className="px-btn tiny" data-demo="back-all" onClick={() => setFocus(null)}>返回全部</button>
            </>
          ) : (
            <strong>工作区 · 全部对话</strong>
          )}
        </div>
        {focused && <PersonaStrip p={focused} status={status[focused.agentId]} />}
        {focused && minds[focused.agentId] && <MindPanel mind={minds[focused.agentId]} />}
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
              <div className="round-sep">
                {r === 0 ? '开场 · 你的理解' : live ? (labels[r] ?? '开聊') : `第 ${r} 轮 · ${roundLabel(config.mode, r, config.maxRounds)}`}
              </div>
              {ms.map((m) => <Line key={m.id} m={m} byId={byId} />)}
            </div>
          ))}
          {config.participants
            .filter((p) => status[p.agentId]?.state === 'thinking' && (!focus || focus === p.agentId))
            .map((p) => (
              <div key={'thinking-' + p.agentId} className="line thinking-line" style={{ ['--ac' as string]: p.color }}>
                <span className="l-avatar"><PixelAvatar v={withFace(p.persona.visual, minds[p.agentId])} size={28} /></span>
                <div>
                  <div className="who">{p.persona.name}<i>{live ? status[p.agentId]?.action ?? '想说话' : '思考中'}</i></div>
                  <p className="typing"><i /><i /><i /></p>
                </div>
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
          {result && !focused && <ResultCard r={result} live={live} />}
          {errors.filter((e) => !focused || !e.agentId || e.agentId === focus).map((e) => (
            <div key={e.id} className="err-line" role="alert">
              <b>{e.agentId ? (byId[e.agentId]?.persona.name ?? e.agentId) + ' 这次发言失败' : '讨论出错'}</b>
              <p>{e.message}</p>
              <div className="err-actions">
                {/* 暂停中、讨论结束后的追问失败也要能重试，不然引擎一直停在出错那一步 */}
                {e.retry && canTalk && <button className="px-btn tiny primary" onClick={() => retry(e)}>重试</button>}
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
              placeholder={!canTalk ? '讨论已停止'
                : session === 'finished' ? (focused ? `讨论结束了，继续私下问 ${focused.persona.name}…` : live ? '散场了，再说一句大家能接着聊（点成员可以私下说）' : '讨论结束了，还可以继续追问（点成员可以私下问）')
                : focused ? `私下对 ${focused.persona.name} 说…（只有他看得到${live ? '，会改变他的心情和打算' : ''}）`
                : live ? '对全体说…（@名字 点名；点成员可以私下说）' : '对全体说…（点成员可以私下说）'}
              disabled={!canTalk}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }}
            />
            <button className="px-btn primary" onClick={send} disabled={!canTalk || !draft.trim()}>发送</button>
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
                data-demo-member={p.persona.name}
                onClick={() => setFocus(focus === p.agentId ? null : p.agentId)}
              >
                <span className="m-avatar"><PixelAvatar v={withFace(p.persona.visual, minds[p.agentId])} size={40} /></span>
                <span className="m-info">
                  <strong>{p.isLead && '★'}{p.persona.name}{p.side && <i className={'side side-' + p.side}>{{ pro: '正', con: '反', host: '主' }[p.side]}</i>}</strong>
                  <small>{p.persona.personalities.find((x) => x.id === p.personalityId)?.label} · {count} 条</small>
                  <em><b className="dot" />{STATE_LABEL[st.state]} · {st.action}</em>
                </span>
              </button>
            );
          })}
        </div>
        {(session === 'running' || session === 'paused') && (
          <button className={'px-btn ' + (session === 'paused' ? 'primary' : 'danger')} data-demo="pause" onClick={togglePause}>
            {session === 'paused' ? '▶ 继续' : '⏸ 暂停'}
          </button>
        )}
      </footer>
    </div>
  );
}

function Line({ m, byId }: { m: ChatMessage; byId: Record<string, Participant> }) {
  if (m.kind === 'notice') return <div className="line notice"><p>⚠ {m.text}</p></div>;
  if (m.kind === 'react') {
    const p = byId[m.speakerId];
    return p ? <div className="line react" style={{ ['--ac' as string]: p.color }}><b>{p.persona.name}</b><span>{m.text}</span></div> : null;
  }
  if (m.speakerId === 'user') {
    const to = m.targetId ? byId[m.targetId]?.persona.name : '全体';
    return (
      <div className={'line user' + (m.private ? ' private' : '')}>
        <div className="who">你 → {to}{m.private && <i>私聊</i>}</div><p>{m.text}</p>
      </div>
    );
  }
  const p = byId[m.speakerId];
  if (!p) return null;
  return (
    <div className={'line ' + m.kind + (m.private ? ' private' : '') + (m.cut ? ' cut' : '')} style={{ ['--ac' as string]: p.color }}>
      <span className="l-avatar"><PixelAvatar v={p.persona.visual} size={28} /></span>
      <div>
        <div className="who">
          {p.persona.name}{m.tag && <em className="line-tag">{m.tag}</em>}{m.cut && <em className="line-tag">被打断</em>}
          {m.kind === 'reply' && <i>{m.private ? '私下回复你' : '回复你'}</i>}
        </div>
        {m.quote && <div className="quote">↪ {m.quote.name}：{m.quote.text}</div>}
        <p>{m.text}</p>
      </div>
    </div>
  );
}

/** 点开某个人时看到的内心：情绪、态度、打算、心里话、对谁有意见 */
function MindPanel({ mind }: { mind: MindView }) {
  return (
    <div className="mind-panel">
      <div className="mood-bars">
        {mind.mood.map((x) => (
          <span key={x.key} className="mood-bar" style={{ ['--mc' as string]: x.color }}>
            {x.key}<i><b style={{ width: x.value * 10 + '%' }} /></i>{Math.round(x.value)}
          </span>
        ))}
      </div>
      <dl>
        <dt>心情</dt><dd>{mind.emoji} {mind.label}</dd>
        {mind.style && <><dt>说话</dt><dd>{mind.style}</dd></>}
        {mind.stance && <><dt>态度</dt><dd>{mind.stance}</dd></>}
        {mind.plan && <><dt>打算</dt><dd>{mind.plan}</dd></>}
        {mind.inner && <><dt>心里</dt><dd>{mind.inner}</dd></>}
        {mind.toward.length > 0 && (
          <><dt>对人</dt><dd>{mind.toward.map((t) => (
            <span key={t.id} className={'rel ' + (t.value > 0 ? 'good' : 'bad')}>{t.name} {t.value > 0 ? '+' : ''}{t.value}</span>
          ))}</dd></>
        )}
        {mind.whisper && <><dt>你说过</dt><dd className="whisper">“{mind.whisper}”</dd></>}
      </dl>
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

function ResultCard({ r, live }: { r: DiscussionResult; live?: boolean }) {
  const sec: Array<[string, string[] | undefined, string]> = [
    ['共识', r.consensus, 'green'], ['分歧', r.disagreements, 'orange'],
    [r.verdict ? '被回避的质询' : '待验证', r.openQuestions, 'blue'], ['建议', r.suggestions, 'purple'], ['交付物', r.deliverables, 'yellow'],
  ];
  const v = r.verdict;
  return (
    <div className="result">
      <div className="round-sep">讨论结果</div>
      {v && (
        <div className="res res-yellow verdict">
          <b>裁判判定{v.judge ? ' · ' + v.judge : ''}</b>
          {v.motion && <p className="summary-text">辩题：{v.motion.motion}<br />正方：{v.motion.pro}<br />反方：{v.motion.con}</p>}
          <p className="verdict-score">
            <span className="side side-pro">正方 {v.proScore ?? '-'}</span>
            <strong>{v.winner === '平局' ? '平局' : (v.winner ?? '未判定') + ' 胜'}</strong>
            <span className="side side-con">反方 {v.conScore ?? '-'}</span>
          </p>
          {v.reason && <p className="summary-text">{v.reason}</p>}
        </div>
      )}
      {r.summary && <div className="res res-blue"><b>{v ? '赛后总结' : live ? '这场聊下来' : '主持人总结'}</b><p className="summary-text">{r.summary}</p></div>}
      {sec.filter(([, v]) => v?.length).map(([k, v, c]) => (
        <div key={k} className={'res res-' + c}><b>{k}</b><ul>{v!.map((x) => <li key={x}>{x}</li>)}</ul></div>
      ))}
    </div>
  );
}
