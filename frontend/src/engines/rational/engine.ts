import type { ChatMessage, DiscussionEngine, EngineEvent, MindView, Participant, SessionConfig, StageGate } from '../../types';
import { chat, isAbort, type LlmMessage } from '../../llm/client';
// 情绪记账和娱乐/情感分析共用一套：情绪怎么涨落、好恶怎么回落只维护一份
import { cool, createMind, dominant, feel, level, like, type Mind as MindState } from '../live/mind';
import { RATIONAL_DEFAULTS } from './config';
import { DEBATE_MOODS, readDebateTemperament } from './moods';
import { debateSchedule, type DebateTurn } from './schedule';
import { actorMessages, actorPosition, directorMessages, summaryMessages, parseActor, parseDirector, parseSummary, replyMessages } from './prompt';

export type DebateChat = (messages: LlmMessage[], opt: { temperature: number; signal: AbortSignal }) => Promise<string>;
const browserChat: DebateChat = async (messages, opt) => (await chat(messages, opt)).text;
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
let seq = 0;
const uid = (prefix: string) => prefix + '-' + Date.now().toString(36) + '-' + seq++;

type UserInput = { text: string; targetAgentId?: string };
/** 辩手多了「这一句说完的心情」和「谁在追着他问」，其余沿用共用账本 */
type Mind = MindState & { pressure: number; confidence: number; pressedBy: Record<string, number> };
/** 此刻状态对发挥的影响：不只给表情，还写进发言人的提示词，让失常真的失常、爆发真的像爆发 */
function formLine(m: Mind, nameOf: (id: string) => string): string {
  const parts: string[] = [];
  const pressured = m.mood['压力'] ?? 0, confident = m.mood['信心'] ?? 0, angry = m.mood['火气'] ?? 0, hurt = m.mood['憋屈'] ?? 0;
  if (pressured >= 7) parts.push('你已经明显发挥失常：反应变慢、抓不住对方论点的要害、句子变短变急，可能漏掉本该回应的点');
  else if (pressured >= 4) parts.push('你有点紧张，发挥比平时打折扣，偶尔抓错重点');
  if (confident >= 8) parts.push('你今天状态特别好：思路清楚、临场反应快，甚至可能冒出平时想不到的精彩反驳（激发潜能）');
  else if (confident <= 1 && pressured >= 5) parts.push('信心见底又顶着压力：这一句大概率说得不漂亮，但绝境里也可能豁出去拼出意外的好表现');
  if (angry >= 7) parts.push('你情绪上头：说话冲、容易翻旧账、听不进对方道理，可能因激动露出口误');
  else if (angry >= 4) parts.push('你有点上头，语气比平时冲');
  if (hurt >= 7) parts.push('你被将死了：说不出完整有力的话，语气发虚，甚至想放弃这一轮的纠缠');
  const grudges = Object.entries(m.pressedBy).filter(([, n]) => n >= 2)
    .map(([id]) => nameOf(id)).filter(Boolean);
  if (grudges.length) parts.push('你特别想压过 ' + grudges.join('、') + '（他追着问过你）：面对他时求胜心切，容易盯着他打');
  return parts.join('；');
}
/** 别人看得出来的神情，和界面上的标签同一套（"被问住了""火力全开"）；心思看不出来 */
const demeanor = (m: Mind) => {
  const d = dominant(m, DEBATE_MOODS);
  // 没有任何情绪上档时就是平静
  return (d && level(d, m.mood[d.key])) || '平静';
};

class DebateRoom {
  private readonly turns: DebateTurn[];
  private readonly transcript: ChatMessage[] = [];
  private readonly minds = new Map<string, Mind>();
  private readonly privateTalk = new Map<string, string[]>();
  /** 每位辩手的私聊里，已经交给过公开发言的条数：之后的算“新私聊”，这一句就要体现；之前的作为整场有效的约定一直带着 */
  private readonly privateSeen = new Map<string, number>();
  private readonly queue: UserInput[] = [];
  private readonly pace: number;
  private readonly maxChars: number;
  private ctrl = new AbortController();
  private round = 0;
  private stopped = false;
  private finished = false;
  private paused = false;
  private draining: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  private retryWake: ((retry: boolean) => void) | null = null;
  private stageGate: StageGate | null = null;
  setStageGate(gate: StageGate | null) { this.stageGate = gate; }
  private async waitStage(request: () => Promise<void> | undefined) {
    if (!this.stageGate || (typeof document !== 'undefined' && document.hidden)) return;
    let done = false, elapsed = 0;
    void request()?.then(() => { done = true; }, () => { done = true; });
    while (!done && !this.stopped && elapsed < 4000) {
      if (typeof document !== 'undefined' && document.hidden) return;
      const start = Date.now(), active = !this.paused;
      await new Promise<void>(resolve => { const finish = () => { clearTimeout(timer); this.ctrl.signal.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, 20); this.ctrl.signal.addEventListener('abort', finish, { once: true }); });
      if (active && !this.paused) elapsed += Date.now() - start;
    }
  }

  constructor(private cfg: SessionConfig, private emit: (e: EngineEvent) => void, private chatFn: DebateChat) {
    this.turns = debateSchedule(cfg);
    this.maxChars = Math.min(400, Math.max(50, Math.round(cfg.maxChars ?? 150)));
    const rawPace = cfg.engineOptions?.pace;
    this.pace = typeof rawPace === 'number' && Number.isFinite(rawPace) ? Math.max(0, Math.min(10, rawPace)) : Number(RATIONAL_DEFAULTS.pace);
  }

  start() {
    this.emit({ type: 'session', state: 'running' });
    for (const p of this.cfg.participants) {
      const base = createMind(p, readDebateTemperament(p), DEBATE_MOODS, {});
      this.minds.set(p.agentId, { ...base, pressure: 2, confidence: 5, pressedBy: {} });
      this.status(p, 'idle', '就座');
      this.showMind(p);
    }
    // 这句话已由讨论页显示；引擎只把它放进每个人将看到的公开记录。
    this.transcript.push({ id: uid('u'), round: 0, speakerId: 'user', text: this.cfg.theme.brief?.trim() || this.cfg.theme.title, kind: 'user', at: Date.now() });
    void this.run().catch((e) => {
      if (this.stopped) return;
      this.emit({ type: 'error', id: uid('err'), message: '辩论中断：' + errorText(e) });
      this.stop();
    });
  }

  sendUserMessage(input: UserInput) {
    if (this.stopped || !input.text.trim()) return;
    const target = this.cfg.participants.find((p) => p.agentId === input.targetAgentId);
    const text = input.text.trim();
    if (target) {
      const history = this.privateTalk.get(target.agentId) ?? [];
      history.push('用户：' + text);
      this.privateTalk.set(target.agentId, history);
    }
    const message = { id: uid('u'), round: this.round, speakerId: 'user', text, kind: 'user' as const,
      targetId: target?.agentId, private: !!target || undefined, at: Date.now() };
    if (!target) this.transcript.push(message);
    this.emit({ type: 'message', message });
    this.queue.push({ text, targetAgentId: target?.agentId });
    this.wake?.();
    if (this.finished) void this.drainUser();
  }

  pause() {
    if (this.stopped || this.finished || this.paused) return;
    this.paused = true;
    this.emit({ type: 'session', state: 'paused' });
  }

  resume() {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    this.emit({ type: 'session', state: 'running' });
    this.wake?.();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.ctrl.abort();
    this.retryWake?.(false);
    this.wake?.();
    this.emit({ type: 'session', state: 'stopped' });
  }

  private async run() {
    for (const turn of this.turns) {
      await this.gate();
      await this.drainUser();
      if (this.stopped) return;
      if (this.round !== turn.round) {
        this.round = turn.round;
        this.emit({ type: 'round', round: this.round, label: turn.stage });
        await this.waitStage(() => this.stageGate?.round(this.round));
      }
      const ok = await this.withRetry(() => this.speak(turn), turn.speaker.persona.name + '发言', turn.speaker.agentId);
      if (!ok || this.stopped) return;
    }
    await this.drainUser();
    if (this.stopped) return;
    const result = await this.withRetry(() => this.summarize(), '赛后总结');
    if (!result || this.stopped) return;
    this.emit({ type: 'result', result });
    this.finished = true;
    for (const p of this.cfg.participants) this.status(p, 'done', '完成');
    this.emit({ type: 'session', state: 'finished' });
    if (this.queue.length) void this.drainUser();
  }

  private async speak(turn: DebateTurn): Promise<boolean> {
    const p = turn.speaker;
    this.status(p, 'thinking', '组织论点');
    const transcript = this.publicText();
    const mind = this.minds.get(p.agentId)!;
    // 私聊整场有效：之前的私聊作为约定一直带着；上次公开发言之后的新私聊，这一句就要体现
    const talk = this.privateTalk.get(p.agentId) ?? [];
    const seenUpTo = talk.length;
    const from = this.privateSeen.get(p.agentId) ?? 0;
    const privateOld = talk.slice(0, from).slice(-12).join('\n');
    const privateNew = talk.slice(from).slice(-12).join('\n');
    const directorTemp = Number(this.cfg.engineOptions?.directorTemperature ?? RATIONAL_DEFAULTS.directorTemperature);
    const actorTemp = Number(this.cfg.engineOptions?.temperature ?? RATIONAL_DEFAULTS.temperature);
    const cue = await this.askJson(() => directorMessages(this.cfg, turn, transcript, this.mindText(p), this.privateNotes(p)), parseDirector, directorTemp);
    const speech = await this.askJson(() => actorMessages(this.cfg, turn, cue, transcript, mind.inner, this.maxChars, privateNew, privateOld),
      (text) => parseActor(text, actorPosition(p), this.maxChars), actorTemp);
    if (this.stopped) return false;
    // 新私聊已经交给这一句，之后并入“之前的约定”；生成期间新来的私聊留给下一次
    this.privateSeen.set(p.agentId, seenUpTo);
    mind.stance = cue.stance || mind.stance;
    mind.plan = cue.plan || mind.plan;
    mind.inner = speech.inner || mind.inner;
    // 社交情绪：嫉妒、敬佩、同情 —— 记进对人的账本（rel），下次他面对这个人时心态就不一样
    if (cue.toward) {
      const target = this.cfg.participants.find((x) => x.persona.name === cue.toward!.agent && x.agentId !== p.agentId);
      if (target) {
        like(mind, target.agentId, cue.toward.value);
        mind.inner = (mind.inner ? mind.inner + '；' : '') + '对' + target.persona.name + '（' + (cue.toward.reason || (cue.toward.value > 0 ? '心服' : '有想法')) + '）';
      }
    }
    // 导演给的是「这一句的情绪变化」：压力、信心和火气/憋屈一起记进共用账本
    this.feelStep(mind, {
      压力: cue.pressure,
      信心: cue.confidence,
      火气: cue.tone.includes('激动') || cue.tone.includes('强硬') ? 1 : 0,
      憋屈: cue.pressure >= 2 ? 1 : 0,
    });
    // 被点名质询的人，这一轮压力明显更高（追着问就是压力来源）
    if (turn.target) {
      const target = this.minds.get(turn.target.agentId);
      if (target) {
        target.pressedBy[p.agentId] = (target.pressedBy[p.agentId] ?? 0) + 1;
        this.feelStep(target, { 压力: 1.5, 火气: 0.5 });
      }
    }
    this.showMind(p);
    if (turn.target) { const t = this.cfg.participants.find((x) => x.agentId === turn.target!.agentId); if (t) this.showMind(t); }
    this.status(p, 'speaking', turn.tag);
    await this.waitStage(() => this.stageGate?.speech(p.agentId));
    for (let i = 0; i < speech.say.length; i++) {
      await this.display(p, speech.say[i], turn.tag, turn.target?.agentId);
      if (this.stopped) break;
      await this.gate();
      if (this.stopped || this.queue.length) break;
    }
    if (!this.stopped) this.status(p, 'idle', '倾听');
    // 和底盘一致：每经过一次发言，所有人的情绪往平时的状态回落一点
    for (const other of this.cfg.participants) {
      const om = this.minds.get(other.agentId)!;
      cool(om, DEBATE_MOODS);
      if (other.agentId !== p.agentId) this.showMind(other);
    }
    return !this.stopped;
  }

  /** 记一步情绪，和底盘 live/engine 的 moodStep 同一套限幅：每步每种最多 ±2，整体最多 ±3 */
  private feelStep(m: Mind, delta: Record<string, number>) {
    const before = { ...m.mood };
    const raw: Record<string, number> = {};
    for (const [k, v] of Object.entries(delta)) {
      const mapped = k === '压力' ? '压力' : k;
      raw[mapped] = clamp(v, -2, 2);
    }
    feel(m, raw, DEBATE_MOODS);
    for (const d of DEBATE_MOODS) m.mood[d.key] = clamp(m.mood[d.key], before[d.key] - 3, before[d.key] + 3);
    // 压力、信心是辩论自己的一套数值，和 mood 同步维护
    m.pressure = clamp(m.mood['压力'] ?? m.pressure, 0, 10);
    m.confidence = clamp(m.mood['信心'] ?? m.confidence, 0, 10);
  }

  private async summarize() {
    const temperature = Number(this.cfg.engineOptions?.summaryTemperature ?? RATIONAL_DEFAULTS.summaryTemperature);
    return this.askJson(() => summaryMessages(this.cfg, this.publicText()), parseSummary, temperature);
  }

  private async askJson<T>(messages: () => LlmMessage[], parse: (text: string) => T | null, temperature: number): Promise<T> {
    const prompt = messages();
    for (let i = 0; i < 2; i++) {
      const attempt = i ? [...prompt, { role: 'user' as const, content: '上次格式或内容不符合要求。请只输出系统指定的 JSON 字段，并遵守本场任务的约束。' }] : prompt;
      const text = await this.chatFn(attempt, { temperature, signal: this.ctrl.signal });
      const parsed = parse(text);
      if (parsed) return parsed;
    }
    throw new Error('模型两次都没有按本轮要求回答');
  }

  private async display(p: Participant, text: string, tag?: string, targetId?: string) {
    const message: ChatMessage = { id: uid('m'), round: this.round, speakerId: p.agentId, text, kind: 'speech', tag, targetId, at: Date.now() };
    this.transcript.push(message);
    this.emit({ type: 'message', message: { ...message, text: '' } });
    const chunk = Math.max(1, Math.ceil(text.length / 22));
    for (let shown = chunk; shown < text.length && !this.stopped; shown += chunk) {
      this.emit({ type: 'message_update', id: message.id, text: text.slice(0, shown) });
      if (this.pace) await new Promise((resolve) => setTimeout(resolve, 65 * this.pace));
    }
    if (!this.stopped) this.emit({ type: 'message_update', id: message.id, text });
  }

  private async gate() {
    while (this.paused && !this.stopped) {
      if (this.queue.length) await this.drainUser();
      else await new Promise<void>((resolve) => { this.wake = resolve; });
      this.wake = null;
    }
  }

  private async drainUser(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = (async () => {
      while (this.queue.length && !this.stopped) {
        const input = this.queue.shift()!;
        const target = this.cfg.participants.find((p) => p.agentId === input.targetAgentId);
        const p = target ?? this.cfg.participants.find((x) => x.side === 'host') ?? this.cfg.participants[0];
        const ok = await this.withRetry(() => this.reply(p, input.text, !!target), p.persona.name + '回应用户', p.agentId);
        if (!ok) break;
      }
    })().finally(() => {
      this.draining = null;
      if (this.finished && this.queue.length && !this.stopped) void this.drainUser();
    });
    return this.draining;
  }

  private async reply(p: Participant, text: string, privateReply: boolean): Promise<boolean> {
    this.status(p, 'thinking', privateReply ? '准备私下回答' : '准备回应用户');
    const history = this.privateTalk.get(p.agentId)?.slice(-12).join('\n') ?? '';
    const answer = (await this.chatFn(replyMessages(this.cfg, p, text, this.publicText(), history, privateReply), {
      temperature: 0.8, signal: this.ctrl.signal,
    })).trim().slice(0, this.maxChars);
    if (!answer) throw new Error('模型没有给出回答');
    if (this.stopped) return false;
    if (privateReply) this.privateTalk.get(p.agentId)?.push(p.persona.name + '：' + answer);
    if (!privateReply) {
      this.status(p, 'speaking', '回应用户');
      await this.waitStage(() => this.stageGate?.speech(p.agentId));
      if (this.stopped) return false;
    }
    const message: ChatMessage = { id: uid('r'), round: this.round, speakerId: p.agentId, text: answer, kind: 'reply',
      targetId: 'user', private: privateReply || undefined, tag: this.finished ? '赛后追问' : undefined, at: Date.now() };
    if (!privateReply) this.transcript.push(message);
    this.emit({ type: 'message', message });
    this.status(p, this.finished ? 'done' : 'idle', this.finished ? '完成' : '倾听');
    return true;
  }

  /** agentId：这次是谁出错，舞台上他头顶亮「!」，不会一直显示在思考 */
  private async withRetry<T>(action: () => Promise<T>, label: string, agentId?: string): Promise<T | null> {
    while (!this.stopped) {
      try { return await action(); }
      catch (e) {
        if (this.stopped || isAbort(e)) return null;
        const again = await new Promise<boolean>((resolve) => {
          this.retryWake = resolve;
          this.emit({ type: 'error', id: uid('err'), agentId, message: label + '失败：' + errorText(e),
            retry: () => { if (this.retryWake === resolve) this.retryWake = null; resolve(true); } });
        });
        if (!again) return null;
      }
    }
    return null;
  }

  private publicText() {
    return this.transcript.map((m) => (m.speakerId === 'user' ? '用户' : this.cfg.participants.find((p) => p.agentId === m.speakerId)?.persona.name ?? m.speakerId) + '：' + m.text).join('\n');
  }

  /** 下一位发言人和用户的私下约定（最近两个来回）。只在安排他自己发言时给导演，安排别人时导演也看不到 */
  private privateNotes(speaker: Participant) {
    return (this.privateTalk.get(speaker.agentId) ?? []).slice(-4).join(' / ');
  }

  /**
   * 给导演看的人物状态。导演每次只安排下一位发言人，所以只给这个人自己的心思；
   * 其他人只给看得出来的神情（"被问住了""火力全开"，导演据此决定要不要继续追着问）：
   * 他们心里想什么、打算干嘛，发言人只能从公开记录去猜，不能读心
   */
  private mindText(speaker: Participant) {
    return this.cfg.participants.map((p) => {
      const m = this.minds.get(p.agentId)!;
      if (p.agentId !== speaker.agentId) return `${p.persona.name}：神情「${demeanor(m)}」（只看得出神情，心里怎么想不知道）`;
      // 带上档位说法，发言人清楚自己现在的状态
      const feelings = DEBATE_MOODS.map((d) => {
        const w = level(d, m.mood[d.key]);
        return d.key + ' ' + Math.round(m.mood[d.key]) + '/10' + (w ? '（' + w + '）' : '');
      }).join('，');
      const pressed = Object.entries(m.pressedBy).filter(([, n]) => n > 0)
        .map(([id, n]) => (this.cfg.participants.find((x) => x.agentId === id)?.persona.name ?? id) + ' 质询过 ' + n + ' 次').join('；');
      const form = p.agentId === speaker.agentId ? formLine(m, (id) => this.cfg.participants.find((x) => x.agentId === id)?.persona.name ?? '') : '';
      return `${p.persona.name}（下一位发言人）：真实态度 ${m.stance || '尚未表态'}；打算 ${m.plan || '暂无'}；${feelings}${pressed ? '；' + pressed : ''}；内心 ${m.inner || '暂无'}${form ? '；【此刻状态对发挥的影响】' + form : ''}`;
    }).join('\n');
  }

  /**
   * 界面上的内心面板：情绪走和娱乐/情感分析同一套 view()，四种情绪各对应一套表情。
   * 对谁有意见按「谁追着他问」折算 —— 辩论里的好恶就是被质询的次数。
   */
  private showMind(p: Participant) {
    const m = this.minds.get(p.agentId)!;
    const nameOf = (id: string) => id === 'user' ? '你' : this.cfg.participants.find((x) => x.agentId === id)?.persona.name ?? id;
    const toward = Object.entries(m.pressedBy)
      .map(([id, times]) => ({ id, name: nameOf(id), value: -Math.min(2, times) }))
      .filter((x) => x.value <= -2)
      .sort((a, b) => a.value - b.value)
      .slice(0, 5);
    const d = dominant(m, DEBATE_MOODS);
    const view: MindView = {
      mood: DEBATE_MOODS.map((x) => ({ key: x.key, value: Math.round(m.mood[x.key] * 10) / 10, color: x.color })),
      // 和导演看到的神情同一套；没有任何情绪上档时就是平静，脸上不加东西
      label: demeanor(m),
      emoji: d ? d.emoji : '😐',
      face: d ? d.face : [],
      inner: m.inner || undefined, stance: m.stance || undefined, plan: m.plan || undefined,
      toward,
    };
    this.emit({ type: 'mind', agentId: p.agentId, mind: view });
  }

  private status(p: Participant, state: 'idle' | 'thinking' | 'speaking' | 'done', action: string) {
    this.emit({ type: 'status', agentId: p.agentId, state, action });
  }
}

/** 独立的辩论模式：自己的导演、辩手、赛后总结与轮次，不依赖娱乐引擎或 Python 服务。 */
export function createRationalEngine(chatFn: DebateChat = browserChat): DiscussionEngine {
  let room: DebateRoom | null = null;
  let stageGate: StageGate | null = null;
  return {
    setStageGate(gate) { stageGate = gate; room?.setStageGate(gate); },
    start(cfg, emit) { room?.stop(); room = new DebateRoom(cfg, emit, chatFn); room.setStageGate(stageGate); room.start(); },
    sendUserMessage(input) { room?.sendUserMessage(input); },
    pause() { room?.pause(); },
    resume() { room?.resume(); },
    stop() { room?.stop(); },
  };
}
