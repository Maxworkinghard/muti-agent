import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentState, ChatMessage, DiscussionEngine, DiscussionResult, EngineEvent, MindView, SessionConfig, TaskEvent,
} from '../types';
import { placeAway, spotOf, walkMs, type Away } from '../data/stageRules';
import { sceneById } from '../data/scenes';
import { modeById, roundLabel } from '../data/modes';
import { nextConversationVariation } from '../data/conversationVariation';
import { engineFor } from '../engines/registry';
import { SoundToggle, warmAudio } from '../sound';
import { PixelAvatar } from './PixelAvatar';
import { OfficeBubbles, type OfficeSpeech } from './OfficeBubbles';
import { playThinking } from './stageFx';
import { createStageGate } from '../mc/stageGate';
import { STATE_LABEL, withFace, type ErrorItem, type Flight, type SessionPhase, type Status } from './discussionUtils';
import { useChatter, useEntrance, useLandingSitting, useWalkAnimations } from './discussionHooks';
import { Line, MindPanel, PersonaStrip, ResultCard } from './discussionComponents';

const McStage3D = lazy(() => import('./McStage3D').then((module) => ({ default: module.McStage3D })));

export function DiscussionView({ config, onExit }: { config: SessionConfig; onExit: () => void }) {
  const scene = sceneById(config.sceneId);
  const mode = modeById(config.mode);
  const engineRef = useRef<DiscussionEngine | null>(null);
  const mcEventsRef = useRef<EngineEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [round, setRound] = useState({ n: 0, label: '准备中' });
  const [session, setSession] = useState<SessionPhase>('waiting');
  const [result, setResult] = useState<DiscussionResult | null>(null);
  const [mcTheme, setMcTheme] = useState(config.theme.title);
  const [tasks, setTasks] = useState<TaskEvent[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  // 工作模式：谁离开了工位、正走在路上（只在有 stations 的二维场景里画出来）。
  // awayRef 和后端 work.ts 一样按事件顺序推算位置，同一批里连着几条走动也不会拿到旧值
  const [away, setAway] = useState<Record<string, Away>>({});
  const awayRef = useRef<Record<string, Away>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [view3D, setView3D] = useState(Boolean(scene.mcStage));
  const [threeReady, setThreeReady] = useState(false);
  const [threeError, setThreeError] = useState('');
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
  // 正面坐姿的二维场景：人物全身坐在底图的椅子上，大小按舞台宽度等比缩放
  const sitCast = !mcActive && scene.posture === 'sit';
  // 办公室这类标了 stations 的二维场景：工作模式里人会离开工位走动；我的世界房间不画这层二维人物
  const walkCast = !mcActive && Boolean(scene.stations);
  const actorWidth = scene.actorWidth ?? 0.15;
  const seatEls = useRef(new Map<number, HTMLElement>());
  const { walking, setWalking, walkStarts, walkEnabled } = useWalkAnimations({ walkCast, session, away, participants: config.participants, seatEls });
  // 娱乐、情感分析（导演 + 演员底盘）：每个人的内心、引擎给的段名（换话题 / 走到哪一步）
  const live = config.mode === 'entertainment' || config.mode === 'emotion';
  const [minds, setMinds] = useState<Record<string, MindView>>({});
  const [labels, setLabels] = useState<Record<number, string>>({});
  const logRef = useRef<HTMLDivElement>(null);
  // 娱乐模式：入场时放背景音乐，讨论开始后压低音量；静音跟顶部音效开关走
  const showEntrance = config.mode === 'entertainment';
  const { seated, allSeated, skipIntro, muted, bgmRef } = useEntrance({ count: config.participants.length, showEntrance });
  const { landing, sitting } = useLandingSitting({ seated, status, participants: config.participants });
  const entering = !allSeated && seated > 0 ? config.participants[seated - 1] : null;

  const byId = useMemo(() => Object.fromEntries(config.participants.map((p) => [p.agentId, p])), [config]);

  const { chatter, speakerOf } = useChatter({ mcStage: Boolean(scene.mcStage), byId });

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
          const f: Flight = { id: e.task.id, from: a, to: b, via, color: p?.color ?? '#d4b04c' /* --c-yellow */, title: e.task.title };
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
        <div className={'stage-inner' + (mcActive ? ' stage-3d-ready' : '') + (sitCast ? ' sit-cast' : '') + (walkCast ? ' walk-cast' : '')}
          style={sitCast ? { ['--aw' as string]: actorWidth } : undefined}>
          <img className="stage-bg" src={scene.image} alt={scene.name} draggable={false} />
          {scene.mcStage && (view3D || mcLoadedRef.current) && <Suspense fallback={null}><McStage3D
            sceneKind={scene.mcStage}
            visible={view3D}
            events={mcEventsRef.current}
            participants={config.participants} status={status} round={round} totalRounds={config.maxRounds}
            session={session} messages={messages} minds={minds} focus={focus} errors={errors} result={result}
            theme={mcTheme} muted={muted} onFocus={setFocus}
            onStageDone={(kind, key) => mcGateRef.current?.done(kind, key)}
            onLoaded={(error) => {
              mcLoadedRef.current = !error;
              if (error) { setThreeError(error); setView3D(false); setThreeReady(false); }
              else { setThreeError(''); setThreeReady(true); skipIntro(); }
            }}
          /></Suspense>}
          {scene.mcStage && <button
            className="stage-view-toggle"
            onClick={() => { setView3D(!view3D); setThreeReady(!view3D && mcLoadedRef.current); setThreeError(''); }}
            aria-label={view3D ? '切换到 2D 场景' : '切换到 3D 场景'}
            title={view3D ? '切换到 2D 场景' : '切换到 3D 场景'}
          >{view3D ? '◧ 2D' : '◈ 3D'}</button>}
          {threeError && <span className="stage-model-error" role="status">{threeError}</span>}
          {(scene.sourceSceneId ?? scene.id) === 'debate' && !mcActive && <div className="debate-board">{config.theme.title}</div>}
          {!mcActive && config.participants.map((p, i) => {
            if (i >= seated) return null;
            const st = status[p.agentId]?.state ?? 'idle';
            // 工作模式里离开了工位的人：站在同事旁、站会圈里，或坐在会议室；走在路上时也一直站着
            const off = walkCast ? away[p.agentId] : undefined;
            const upright = walkCast && ((off && !off.sit) || walking.has(p.agentId));
            const seat = off ? { ...scene.seats[p.seatIndex], x: off.x, y: off.y } : scene.seats[p.seatIndex];
            const msg = st === 'speaking' ? lastSpeech(p.agentId) : undefined;
            const mind = minds[p.agentId];
            // 发言的人站起来；正面坐姿的场景里人坐在椅子上说话，不站起来
            const standing = (st === 'speaking' && !sitCast && !off?.sit) || upright;
            const base = standing ? 44 : 36;
            // 气泡和思考云默认在头顶；头顶离舞台上沿不够一个气泡高时翻到身下。
            // 正面坐姿的头顶在座位点上方 3/4 个身高（身高 = 宽 × 22/16，舞台高 = 宽 / 1.5，合起来约 宽占比 × 155 个百分点）
            const below = sitCast ? seat.y - actorWidth * 155 < 18 : seat.y < (upright ? 40 : 30);
            return (
              <button
                key={p.agentId}
                ref={(el) => { if (el) seatEls.current.set(p.seatIndex, el); else seatEls.current.delete(p.seatIndex); }}
                className={`seat st-${st}${upright ? ' away' : ''}${walkCast && walking.has(p.agentId) ? ' walking' : ''}${landing.has(p.agentId) ? ' arrive' : ''}${sitting.has(p.agentId) && st !== 'speaking' ? ' sitdown' : ''}${focus === p.agentId ? ' focus' : ''}${focus && focus !== p.agentId ? ' dim' : ''}${hasError(p.agentId) ? ' err' : ''}`}
                style={{ left: seat.x + '%', top: seat.y + '%', ['--ac' as string]: p.color }}
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
                <span className="body"><PixelAvatar v={withFace(p.persona.visual, mind)} size={Math.round(base * (seat.scale ?? 1))} standing={standing}
                  pose={sitCast ? 'sit' : undefined} chair={sitCast ? false : undefined} /></span>
                <span className="nameplate">{p.isLead ? '★' : ''}{p.persona.name}</span>
              </button>
            );
          })}
          {walkCast && <OfficeBubbles speeches={officeSpeeches} onFocus={(id) => setFocus(focus === id ? null : id)} />}
          {!mcActive && flights.map((f) => {
            const { from, to } = f;
            const via = f.via ?? to;
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
          {!mcActive && session === 'finished' && <div className="stage-banner">讨论结束 · 结果已写入工作区</div>}
          {!mcActive && entering && (
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
          {!mcActive && !allSeated && <button className="px-btn tiny intro-skip" onClick={skipIntro}>跳过入场 ▶▶</button>}
          {!mcActive && session === 'waiting' && allSeated && <div className="stage-banner wait">大家已就座 · 等你一句话就开始</div>}
          {!mcActive && session === 'paused' && <div className="stage-banner wait">已暂停 · 可以先说你的想法，点「继续」接着讨论</div>}
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
