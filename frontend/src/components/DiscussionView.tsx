import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentState, ChatMessage, DiscussionEngine, DiscussionResult, EngineEvent, Facing, MindView, Participant, PersonaVisual, Seat, SessionConfig, TaskEvent,
} from '../types';
import { placeAway, spotOf, walkMs, type Away } from '../data/stageRules';
import type { StageCue } from './SceneStage3D';
import { sceneById } from '../data/scenes';
import { modeById, roundLabel } from '../data/modes';
import { nextConversationVariation } from '../data/conversationVariation';
import { engineFor } from '../engines/registry';
import { playReady, playSeat, playVoice, SoundToggle, useMuted, warmAudio } from '../sound';
import { PixelAvatar } from './PixelAvatar';
import { OfficeBubbles, type OfficeSpeech } from './OfficeBubbles';
import { centroid, facingToward, type StagePoint, type StageView } from './stageFacing';
import { poseFromAgent } from './pixelActorMotion';
import { createBgm, playThinking, type Bgm } from './stageFx';
import { createStageGate } from '../mc/stageGate';

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
const PixelStage3D = lazy(() => import('./PixelStage3D').then((module) => ({ default: module.PixelStage3D })));
const McStage3D = lazy(() => import('./McStage3D').then((module) => ({ default: module.McStage3D })));

export function DiscussionView({ config, onExit }: { config: SessionConfig; onExit: () => void }) {
  const scene = sceneById(config.sceneId);
  const mode = modeById(config.mode);
  const engineRef = useRef<DiscussionEngine | null>(null);
  const mcEventsRef = useRef<EngineEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [round, setRound] = useState({ n: 0, label: '准备中' });
  const [session, setSession] = useState<'waiting' | 'running' | 'paused' | 'finished' | 'stopped'>('waiting');
  const [result, setResult] = useState<DiscussionResult | null>(null);
  const [mcTheme, setMcTheme] = useState(config.theme.title);
  const [tasks, setTasks] = useState<TaskEvent[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  // 工作模式：谁离开了工位、正走在路上（只在有 stations 的二维场景里画出来）。
  // awayRef 和后端 work.ts 一样按事件顺序推算位置，同一批里连着几条走动也不会拿到旧值
  const [away, setAway] = useState<Record<string, Away>>({});
  const awayRef = useRef<Record<string, Away>>({});
  const [walking, setWalking] = useState<Set<string>>(new Set());
  const walks = useRef(new Map<string, Animation>());
  const walkStarts = useRef(new Map<string, { left: string; top: string; ms: number }>());
  const [focus, setFocus] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [view3D, setView3D] = useState(Boolean(scene.model3d || scene.mcStage));
  const [threeReady, setThreeReady] = useState(false);
  const [threeError, setThreeError] = useState('');
  // 新建的 3D 房间默认站进屋里、镜头跟拍；切到俯视或接手镜头时提示文案跟着改
  const [camMode, setCamMode] = useState<'inside' | 'overview'>('inside');
  const [followCam, setFollowCam] = useState(true);
  const [projectedSeats, setProjectedSeats] = useState<typeof scene.seats>([]);
  // 相机朝向和座位的世界坐标：三维里人物据此转身，二维用不到（保持原来的正面）
  const [stageView, setStageView] = useState<StageView | null>(null);
  const threeActive = Boolean(scene.model3d || scene.mcStage) && view3D && threeReady;
  const mcActive = Boolean(scene.mcStage) && view3D && threeReady;
  const mcGateRef = useRef<ReturnType<typeof createStageGate> | null>(null);
  const mcLoadedRef = useRef(false);
  useEffect(() => {
    if (!mcActive) { engineRef.current?.setStageGate?.(null); mcGateRef.current?.dispose(); mcGateRef.current = null; return; }
    const bridge = createStageGate(); mcGateRef.current = bridge; engineRef.current?.setStageGate?.(bridge.gate);
    const visibility = () => { if (document.hidden) bridge.release(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); bridge.dispose(); engineRef.current?.setStageGate?.(null); mcGateRef.current = null; };
  }, [mcActive]);
  const pixelActive = threeActive && scene.pixelStage === 'debate';
  const worldActive = threeActive && !pixelActive && !mcActive;
  const stageSeat = (index: number) => (threeActive ? projectedSeats[index] : undefined) ?? scene.seats[index];
  // 正面坐姿的二维场景：人物全身坐在底图的椅子上，大小按舞台宽度等比缩放
  const sitCast = !threeActive && scene.posture === 'sit';
  // 办公室这类标了 stations 的二维场景：工作模式里人会离开工位走动；三维里位置由镜头每帧写入，大家留在座位上
  const walkCast = !threeActive && Boolean(scene.stations);
  const walkEnabled = useRef(walkCast);
  walkEnabled.current = walkCast;
  const actorWidth = scene.actorWidth ?? 0.15;
  // 三维里镜头一直在动，人物位置每帧都变：直接写到座位元素上，不走 React 状态（否则整页每帧重渲染）。
  // React 状态只低频同步，给气泡翻到下方、传递动画这些用。
  const innerRef = useRef<HTMLDivElement>(null);
  const seatEls = useRef(new Map<number, HTMLElement>());
  useLayoutEffect(() => {
    if (!walkCast) {
      walkStarts.current.clear();
      if (walks.current.size) {
        for (const animation of walks.current.values()) { animation.onfinish = null; animation.cancel(); }
        walks.current.clear();
        setWalking(new Set());
      }
      return;
    }
    for (const [id, from] of walkStarts.current) {
      const participant = config.participants.find((p) => p.agentId === id);
      const el = participant && seatEls.current.get(participant.seatIndex);
      if (!el) continue;
      const previous = walks.current.get(id);
      if (previous) { previous.onfinish = null; previous.cancel(); }
      // 走多久按距离算（stageRules.walkMs），和后端等人走到再开口用的是同一个数
      const animation = el.animate([{ left: from.left, top: from.top }, { left: el.style.left, top: el.style.top }], {
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : from.ms, easing: 'linear',
      });
      walks.current.set(id, animation);
      if (session === 'paused') animation.pause();
      animation.onfinish = () => {
        walks.current.delete(id);
        setWalking((w) => { const next = new Set(w); next.delete(id); return next; });
      };
    }
    walkStarts.current.clear();
  }, [away, walkCast]);
  useEffect(() => {
    for (const animation of walks.current.values()) {
      if (session === 'paused') animation.pause();
      else if (session === 'stopped') animation.cancel();
      else animation.play();
    }
    if (session === 'stopped') setWalking(new Set());
  }, [session]);
  useEffect(() => () => { for (const animation of walks.current.values()) animation.cancel(); }, []);
  const seatPos = useRef<Seat[]>([]);
  const syncTimer = useRef(0);
  const placeSeats = useCallback(() => {
    for (const [index, el] of seatEls.current) {
      const seat = seatPos.current[index];
      if (!seat) continue;
      el.style.left = seat.x + '%';
      el.style.top = seat.y + '%';
      el.style.setProperty('--s', String(seat.scale ?? 1));
    }
  }, []);
  const onSeatPositions = useCallback((positions: Seat[]) => {
    seatPos.current = positions;
    placeSeats();
    if (!syncTimer.current) {
      syncTimer.current = window.setTimeout(() => { syncTimer.current = 0; setProjectedSeats(seatPos.current); }, 150);
    }
  }, [placeSeats]);
  useEffect(() => () => clearTimeout(syncTimer.current), []);
  useLayoutEffect(() => { if (threeActive) placeSeats(); });
  // 三维里大家围坐的那一点：每个人转身看向它，而不是一直正对镜头。
  // 二维场景没有世界坐标，facingOf 一律返回 S，保持原来的正面朝向。
  const conversationCenter = useMemo<StagePoint | null>(() => {
    if (!stageView) return null;
    const points = config.participants
      .map((p) => stageView.seats[p.seatIndex])
      .filter((seat): seat is StagePoint => Boolean(seat));
    return centroid(points);
  }, [stageView, config.participants]);
  // 谁最近一次开始想、开始说：同时有几个人时镜头跟最新的那个
  const activeAt = useRef<Record<string, number>>({});
  const latest = (state: AgentState) => config.participants
    .filter((p) => status[p.agentId]?.state === state)
    .sort((a, b) => (activeAt.current[b.agentId] ?? 0) - (activeAt.current[a.agentId] ?? 0))[0];
  const speaker = latest('speaking');
  const thinker = latest('thinking');
  const cast = useMemo(() => config.participants.map((p) => p.seatIndex), [config.participants]);
  // 镜头拍谁：你点开的人 > 正在说的人 > 正在想的人 > 全景
  const focusedSeat = focus ? config.participants.find((p) => p.agentId === focus)?.seatIndex : undefined;
  const cue: StageCue = focusedSeat !== undefined ? { seat: focusedSeat, shot: 'speak' }
    : speaker ? { seat: speaker.seatIndex, shot: 'speak' }
    : thinker ? { seat: thinker.seatIndex, shot: 'think' }
    : { seat: null, shot: 'wide' };
  // 只给三维镜头补充交流对象；原二维人物和讨论状态不变。
  const previousSpeaker = [...messages].reverse().find((m) => m.speakerId !== speaker?.agentId && m.speakerId !== 'user' && (m.kind === 'speech' || m.kind === 'reply'));
  if (previousSpeaker) cue.listener = config.participants.find((p) => p.agentId === previousSpeaker.speakerId)?.seatIndex;
  // 有人在说话时，听的人转头看他，他自己看着听他说话的那群人；没人说话时大家看向围坐的中心
  const facingOf = (seatIndex: number): Facing => {
    if (!threeActive || !stageView || !conversationCenter) return 'S';
    const from = stageView.seats[seatIndex];
    if (!from) return 'S';
    const talking = speaker ? stageView.seats[speaker.seatIndex] : undefined;
    if (speaker && talking) {
      if (seatIndex !== speaker.seatIndex) return facingToward(from, talking, stageView);
      const audience = centroid(config.participants
        .filter((p) => p.seatIndex !== seatIndex)
        .map((p) => stageView.seats[p.seatIndex])
        .filter((seat): seat is StagePoint => Boolean(seat)));
      if (audience) return facingToward(from, audience, stageView);
    }
    return facingToward(from, conversationCenter, stageView);
  };
  // 娱乐、情感分析（导演 + 演员底盘）：每个人的内心、引擎给的段名（换话题 / 走到哪一步）
  const live = config.mode === 'entertainment' || config.mode === 'emotion';
  const [minds, setMinds] = useState<Record<string, MindView>>({});
  const pixelCast = useMemo(() => config.participants.map((p) => ({
    id: p.agentId,
    seatIndex: p.seatIndex,
    host: p.side === 'host',
    visual: withFace(p.persona.visual, minds[p.agentId]),
    pose: poseFromAgent(status[p.agentId]?.state, p.side === 'host'),
  })), [config.participants, minds, status]);
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

  // 说话音效：每条发言一出字就叽咕一声（包括每轮第一个人）；流式输出时每长出一段再叽咕一下，同一条至少隔 350ms
  const voiceAt = useRef<Record<string, number>>({});
  const voiceLen = useRef<Record<string, number>>({});
  const chatter = (agentId: string, id: string, text: string) => {
    if (scene.mcStage) return;
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
    engine.setStageGate?.(mcActive ? mcGateRef.current?.gate ?? null : null);
    skipIntro();
    bgmRef.current?.duck();
    setMessages([{ id: 'brief', round: 0, speakerId: 'user', text: brief, kind: 'user', at: Date.now() }]);
    setSession('running');
    const onEvent = (e: EngineEvent) => {
      if (scene.mcStage) mcEventsRef.current.push(e);
      switch (e.type) {
        case 'session': setSession(e.state); break;
        case 'round':
          setRound({ n: e.round, label: e.label });
          setLabels((l) => ({ ...l, [e.round]: e.label }));
          break;
        case 'mind': setMinds((ms) => ({ ...ms, [e.agentId]: e.mind })); break;
        case 'status':
          if (e.state === 'thinking' && showEntrance) playThinking();
          if (e.state === 'thinking' || e.state === 'speaking') activeAt.current[e.agentId] = Date.now();
          setStatus((s) => ({ ...s, [e.agentId]: { state: e.state, action: e.action } }));
          break;
        case 'message': {
          const msg = e.message;
          speakerOf.current[msg.id] = msg.speakerId;
          if (msg.kind === 'speech' || msg.kind === 'reply' || msg.kind === 'react') chatter(msg.speakerId, msg.id, msg.text);
          setMessages((m) => [...m, msg]);
          break;
        }
        case 'message_update':
          chatter(speakerOf.current[e.id] ?? '', e.id, e.text);
          setMessages((m) => m.map((x) => (x.id === e.id ? { ...x, text: e.text, cut: e.cut ?? x.cut } : x)));
          break;
        case 'result': setResult(e.result); break;
        case 'theme': if (scene.mcStage) setMcTheme(e.title); break;
        case 'error':
          setErrors((es) => [...es.filter((x) => x.id !== e.id), { id: e.id, agentId: e.agentId, message: e.message, retry: e.retry }]);
          break;
        case 'task': {
          setTasks((t) => [...t, e.task]);
          const p = byId[e.task.from];
          const a = scene.seats[p?.seatIndex ?? 0];
          const b = scene.seats[byId[e.task.to]?.seatIndex ?? 0];
          // 派活和交付经过中央交换台；送审是直接递到同事桌上，从两人中间上方划过去
          const via = e.task.status === 'review' ? { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 8 } : scene.center;
          const f: Flight = { id: e.task.id, fromSeat: p?.seatIndex ?? 0, toSeat: byId[e.task.to]?.seatIndex ?? 0, from: a, to: b, via, color: p?.color ?? '#d4b04c', title: e.task.title };
          setFlights((fs) => [...fs, f]);
          window.setTimeout(() => setFlights((fs) => fs.filter((x) => x.id !== f.id)), 1500);
          break;
        }
        case 'move': {
          const id = e.agentId;
          const person = byId[id];
          if (!person) break;
          const next = placeAway(scene, config.participants, awayRef.current, id, e.to);
          const ms = walkMs(spotOf(scene, person, awayRef.current), spotOf(scene, person, next));
          awayRef.current = next;
          const el = seatEls.current.get(person.seatIndex);
          if (el && walkEnabled.current && ms > 0) {
            const style = getComputedStyle(el); walkStarts.current.set(id, { left: style.left, top: style.top, ms });
            setWalking((w) => new Set(w).add(id));
          }
          setAway(next);
          break;
        }
      }
    };
    // 娱乐模式的场景带了说明（比如座位分工）时，开场由导演按场景里的分工安排（比如主持人先开口），
    // 不再随机指定首位发言者和切入点；其他情况照旧每场随机开局
    const variation = config.scene && config.mode === 'entertainment' ? undefined : nextConversationVariation(config);
    try {
      engine.start({ ...config, conversationVariation: variation, theme: { ...config.theme, brief } }, onEvent);
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
    ? messages.filter((m) => m.kind === 'notice' || m.speakerId === focus || m.targetId === focus)
    : messages;
  // 按轮次分组
  const rounds = useMemo(() => {
    const g = new Map<number, ChatMessage[]>();
    visible.forEach((m) => { if (m.kind === 'system') return; g.set(m.round, [...(g.get(m.round) ?? []), m]); });
    return [...g.entries()].sort((a, b) => a[0] - b[0]);
  }, [visible]);

  // 气泡里放说出的话和交出来的第一版；派活、送审这类流程记录不算
  const lastSpeech = (id: string) => [...messages].reverse().find((m) => m.speakerId === id && m.kind !== 'task');
  const officeSpeeches: OfficeSpeech[] = walkCast ? config.participants.flatMap((p) => {
    const m = status[p.agentId]?.state === 'speaking' ? lastSpeech(p.agentId) : undefined;
    if (!m || (focus && focus !== p.agentId)) return [];
    const anchor = away[p.agentId] ?? scene.seats[p.seatIndex];
    return [{ id: p.agentId, name: p.persona.name, to: m.targetId && byId[m.targetId]?.persona.name, tag: m.tag,
      text: m.text, color: p.color, x: anchor.x, y: anchor.y }];
  }) : [];

  return (
    <div className={'room' + (collapsed ? ' collapsed' : '') + (session === 'paused' ? ' paused' : '')}>
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
        <div ref={innerRef} className={'stage-inner' + (threeActive ? ' stage-3d-ready' : '') + (pixelActive ? ' pixel-cast' : '') + (worldActive ? ' world-cast' : '') + (sitCast ? ' sit-cast' : '') + (walkCast ? ' walk-cast' : '')}
          style={sitCast ? { ['--aw' as string]: actorWidth } : undefined}>
          <img className="stage-bg" src={scene.image} alt={scene.name} draggable={false} />
          {(view3D || (scene.mcStage && mcLoadedRef.current)) && (scene.model3d || scene.mcStage) && <Suspense fallback={null}>{scene.mcStage ? <McStage3D
            visible={view3D}
            events={mcEventsRef.current}
            participants={config.participants} status={status} round={round} totalRounds={config.maxRounds}
            session={session} messages={messages} minds={minds} focus={focus} errors={errors} result={result}
            theme={mcTheme} muted={muted} onFocus={setFocus}
            onStageDone={(kind, key) => mcGateRef.current?.done(kind, key)}
            onLoaded={(error) => {
              mcLoadedRef.current = !error;
              if (error) { setThreeError(error); setView3D(false); setThreeReady(false); }
              else { setThreeError(''); setThreeReady(true); }
            }}
          /> : scene.pixelStage === 'debate' ? <PixelStage3D
            scene={scene}
            cast={pixelCast}
            onLoaded={(error) => {
              if (error) { setThreeError(error); setView3D(false); setThreeReady(false); }
              else { setThreeError(''); setThreeReady(true); }
            }}
            onSeatPositions={onSeatPositions}
            onStageView={setStageView}
          /> : <SceneStage3D
            scene={scene}
            cast={cast}
            actors={pixelCast.slice(0, seated)}
            cue={cue}
            onLoaded={(error) => {
              if (error) { setThreeError(error); setView3D(false); setThreeReady(false); }
              else { setThreeError(''); setThreeReady(true); }
            }}
            onSeatPositions={onSeatPositions}
            onStageView={setStageView}
            onModeChange={setCamMode}
            onFollowChange={setFollowCam}
          />}</Suspense>}
          {(scene.model3d || scene.mcStage) && <button
            className="stage-view-toggle"
            onClick={() => { setView3D(!view3D); setThreeReady(Boolean(scene.mcStage) && !view3D && mcLoadedRef.current); setThreeError(''); setCamMode('inside'); }}
            aria-label={view3D ? '切换到 2D 场景' : '切换到 3D 场景'}
            title={view3D ? '切换到 2D 场景' : '切换到 3D 场景'}
          >{view3D ? '◧ 2D' : '◈ 3D'}</button>}
          {threeActive && !mcActive && <span className="stage-view-hint">{pixelActive ? '拖动转头 · 滚轮拉近'
            : camMode === 'overview' ? '拖动旋转 · 滚轮缩放'
            : followCam ? '镜头跟着说话的人 · 拖动画面可自己看' : '拖动转头 · 滚轮推拉 · 点「跟拍」交还镜头'}</span>}
          {threeError && <span className="stage-model-error" role="status">{threeError}</span>}
          {(scene.sourceSceneId ?? scene.id) === 'debate' && !threeActive && <div className="debate-board">{config.theme.title}</div>}
          {!mcActive && config.participants.map((p, i) => {
            if (i >= seated) return null;
            const st = status[p.agentId]?.state ?? 'idle';
            // 工作模式里离开了工位的人：站在同事旁、站会圈里，或坐在会议室；走在路上时也一直站着
            const off = walkCast ? away[p.agentId] : undefined;
            const upright = walkCast && ((off && !off.sit) || walking.has(p.agentId));
            const seat = off ? { ...stageSeat(p.seatIndex), x: off.x, y: off.y } : stageSeat(p.seatIndex);
            const msg = st === 'speaking' ? lastSpeech(p.agentId) : undefined;
            const mind = minds[p.agentId];
            // 二维里发言的人站起来；三维里人坐在桌后，站起来的全身像会像站在桌面上，
            // 所以三维里保持半身，靠镜头推近、说话时跳动和脚下光圈来表现谁在说
            // 正面坐姿的场景里人坐在椅子上说话，也不站起来
            const standing = (st === 'speaking' && !threeActive && !sitCast && !off?.sit) || upright;
            const base = standing ? 44 : 36;
            // 气泡和思考云默认在头顶；头顶离舞台上沿不够一个气泡高时翻到身下。
            // 三维里人物随镜头放大缩小，按头顶的实际像素位置算，不只看锚点；
            // 正面坐姿的头顶在座位点上方 3/4 个身高（身高 = 宽 × 22/16，舞台高 = 宽 / 1.5，合起来约 宽占比 × 155 个百分点）
            const below = threeActive
              ? (seat.y / 100) * (innerRef.current?.clientHeight ?? 600) - base * (seat.scale ?? 1) < 110
              : sitCast ? seat.y - actorWidth * 155 < 18 : seat.y < (upright ? 40 : 30);
            return (
              <button
                key={p.agentId}
                ref={(el) => { if (el) seatEls.current.set(p.seatIndex, el); else seatEls.current.delete(p.seatIndex); }}
                className={`seat st-${st}${upright ? ' away' : ''}${walkCast && walking.has(p.agentId) ? ' walking' : ''}${landing.has(p.agentId) ? ' arrive' : ''}${sitting.has(p.agentId) && st !== 'speaking' ? ' sitdown' : ''}${focus === p.agentId ? ' focus' : ''}${focus && focus !== p.agentId ? ' dim' : ''}${hasError(p.agentId) ? ' err' : ''}`}
                // 三维里的位置和大小由镜头每帧直接写入（placeSeats），这里不交给 React，免得重渲染时拿旧值覆盖
                style={threeActive ? { ['--ac' as string]: p.color } : { left: seat.x + '%', top: seat.y + '%', ['--ac' as string]: p.color }}
                onClick={() => setFocus(focus === p.agentId ? null : p.agentId)}
                title={mind ? `${p.persona.name} · ${mind.emoji} ${mind.label}${mind.inner ? '\n心里：' + mind.inner : ''}` : undefined}
              >
                {landing.has(p.agentId) && <span className="landing" />}
                {hasError(p.agentId) && <span className="err-badge" title="发言失败，在右侧工作区可以重试">!</span>}
                {mind && mind.label !== '平静' && <span key={mind.emoji} className="mood-badge">{mind.emoji}</span>}
                {st === 'thinking' && (
                  <span className={'thought' + (below ? ' below' : '')} aria-label="思考中">
                    <span className="cloud"><i /><i /><i /></span>
                    <b className="puff p1" /><b className="puff p2" />
                  </span>
                )}
                {msg && !walkCast && <span className={'bubble' + (below ? ' below' : '')}>{msg.text}</span>}
                {st === 'working' && <span className="work-icon">⌨</span>}
                {/* 三维里的大小由 CSS 变量 --s 按镜头远近缩放，这里只给基准尺寸 */}
                {!pixelActive && <span className="body">{!worldActive && <PixelAvatar v={withFace(p.persona.visual, mind)} size={threeActive ? base : Math.round(base * (seat.scale ?? 1))} standing={standing} facing={facingOf(p.seatIndex)}
                  pose={sitCast ? 'sit' : undefined} chair={sitCast ? false : undefined} />}</span>}
                <span className="nameplate">{p.isLead ? '★' : ''}{p.persona.name}</span>
              </button>
            );
          })}
          {walkCast && <OfficeBubbles speeches={officeSpeeches} onFocus={(id) => setFocus(focus === id ? null : id)} />}
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
              <button className="px-btn tiny" onClick={() => setFocus(null)}>返回全部</button>
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
                  <span className="task-route"><b>{byId[t.from]?.persona.name}</b> → <b>{byId[t.to]?.persona.name}</b> · {t.title}</span>
                  <em>{t.status === 'assigned' ? '已派发' : t.status === 'handoff' ? '交接' : t.status === 'review' ? '送审' : '交付'}</em>
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
          <button className={'px-btn ' + (session === 'paused' ? 'primary' : 'danger')} onClick={togglePause}>
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
    <div className={'line ' + m.kind + (m.doc ? ' doc' : '') + (m.private ? ' private' : '') + (m.cut ? ' cut' : '')} style={{ ['--ac' as string]: p.color }}>
      <span className="l-avatar"><PixelAvatar v={p.persona.visual} size={28} /></span>
      <div>
        <div className="who">
          {p.persona.name}{m.targetId && m.targetId !== 'user' && byId[m.targetId] && <> → {byId[m.targetId].persona.name}</>}{m.tag && <em className="line-tag">{m.tag}</em>}{m.cut && <em className="line-tag">被打断</em>}
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
    ['待验证', r.openQuestions, 'blue'], ['建议', r.suggestions, 'purple'], ['交付物', r.deliverables, 'yellow'],
  ];
  return (
    <div className="result">
      <div className="round-sep">讨论结果</div>
      {r.summary && <div className="res res-blue"><b>{live ? '这场聊下来' : '讨论总结'}</b><p className="summary-text">{r.summary}</p></div>}
      {sec.filter(([, v]) => v?.length).map(([k, v, c]) => (
        <div key={k} className={'res res-' + c}><b>{k}</b><ul>{v!.map((x) => <li key={x}>{x}</li>)}</ul></div>
      ))}
    </div>
  );
}
