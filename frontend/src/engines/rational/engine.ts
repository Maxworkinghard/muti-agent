import type { ChatMessage, DiscussionEngine, EngineEvent, MindView, Participant, SessionConfig } from '../../types';
import { chat, isAbort, type LlmMessage } from '../../llm/client';
import { RATIONAL_DEFAULTS } from './config';
import { debateSchedule, type DebateTurn } from './schedule';
import { actorMessages, actorPosition, directorMessages, judgeMessages, parseActor, parseDirector, parseJudge, replyMessages } from './prompt';

export type DebateChat = (messages: LlmMessage[], opt: { temperature: number; signal: AbortSignal }) => Promise<string>;
const browserChat: DebateChat = async (messages, opt) => (await chat(messages, opt)).text;
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
let seq = 0;
const uid = (prefix: string) => prefix + '-' + Date.now().toString(36) + '-' + seq++;

type UserInput = { text: string; targetAgentId?: string };
type Mind = { inner: string; stance: string; plan: string; pressure: number; confidence: number };

class DebateRoom {
  private readonly turns: DebateTurn[];
  private readonly transcript: ChatMessage[] = [];
  private readonly minds = new Map<string, Mind>();
  private readonly privateTalk = new Map<string, string[]>();
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

  constructor(private cfg: SessionConfig, private emit: (e: EngineEvent) => void, private chatFn: DebateChat) {
    this.turns = debateSchedule(cfg);
    this.maxChars = Math.min(400, Math.max(50, Math.round(cfg.maxChars ?? 150)));
    const rawPace = cfg.engineOptions?.pace;
    this.pace = typeof rawPace === 'number' && Number.isFinite(rawPace) ? Math.max(0, Math.min(10, rawPace)) : Number(RATIONAL_DEFAULTS.pace);
  }

  start() {
    this.emit({ type: 'session', state: 'running' });
    for (const p of this.cfg.participants) {
      this.minds.set(p.agentId, { inner: '', stance: '', plan: '', pressure: 2, confidence: 5 });
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
      }
      const ok = await this.withRetry(() => this.speak(turn), turn.speaker.persona.name + '发言');
      if (!ok || this.stopped) return;
    }
    await this.drainUser();
    if (this.stopped) return;
    const result = await this.withRetry(() => this.judge(), '裁判判定');
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
    const directorTemp = Number(this.cfg.engineOptions?.directorTemperature ?? RATIONAL_DEFAULTS.directorTemperature);
    const actorTemp = Number(this.cfg.engineOptions?.temperature ?? RATIONAL_DEFAULTS.temperature);
    const cue = await this.askJson(() => directorMessages(this.cfg, turn, transcript, this.mindText()), parseDirector, directorTemp);
    const speech = await this.askJson(() => actorMessages(this.cfg, turn, cue, transcript, mind.inner, this.maxChars),
      (text) => parseActor(text, actorPosition(p), this.maxChars), actorTemp);
    if (this.stopped) return false;
    mind.stance = cue.stance || mind.stance;
    mind.plan = cue.plan || mind.plan;
    mind.inner = speech.inner || mind.inner;
    mind.pressure = Math.max(0, Math.min(10, mind.pressure + cue.pressure));
    mind.confidence = Math.max(0, Math.min(10, mind.confidence + cue.confidence));
    this.showMind(p);
    this.status(p, 'speaking', turn.tag);
    for (let i = 0; i < speech.say.length; i++) {
      await this.display(p, speech.say[i], i === 0 ? turn.tag : undefined);
      if (this.stopped) break;
      await this.gate();
      if (this.stopped || this.queue.length) break;
    }
    if (!this.stopped) this.status(p, 'idle', '倾听');
    return !this.stopped;
  }

  private async judge() {
    const temperature = Number(this.cfg.engineOptions?.judgeTemperature ?? RATIONAL_DEFAULTS.judgeTemperature);
    return this.askJson(() => judgeMessages(this.cfg, this.publicText()), (text) => parseJudge(text, this.cfg), temperature);
  }

  private async askJson<T>(messages: () => LlmMessage[], parse: (text: string) => T | null, temperature: number): Promise<T> {
    const prompt = messages();
    for (let i = 0; i < 2; i++) {
      const attempt = i ? [...prompt, { role: 'user' as const, content: '上次格式或立场不符合要求。请严格按系统指定的 JSON 字段和本场阵营重新回答。' }] : prompt;
      const text = await this.chatFn(attempt, { temperature, signal: this.ctrl.signal });
      const parsed = parse(text);
      if (parsed) return parsed;
    }
    throw new Error('模型两次都没有按本轮要求回答');
  }

  private async display(p: Participant, text: string, tag?: string) {
    const message: ChatMessage = { id: uid('m'), round: this.round, speakerId: p.agentId, text, kind: 'speech', tag, at: Date.now() };
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
        const ok = await this.withRetry(() => this.reply(p, input.text, !!target), p.persona.name + '回应用户');
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
    const message: ChatMessage = { id: uid('r'), round: this.round, speakerId: p.agentId, text: answer, kind: 'reply',
      targetId: 'user', private: privateReply || undefined, tag: this.finished ? '赛后追问' : undefined, at: Date.now() };
    if (!privateReply) this.transcript.push(message);
    this.emit({ type: 'message', message });
    this.status(p, this.finished ? 'done' : 'idle', this.finished ? '完成' : '倾听');
    return true;
  }

  private async withRetry<T>(action: () => Promise<T>, label: string): Promise<T | null> {
    while (!this.stopped) {
      try { return await action(); }
      catch (e) {
        if (this.stopped || isAbort(e)) return null;
        const again = await new Promise<boolean>((resolve) => {
          this.retryWake = resolve;
          this.emit({ type: 'error', id: uid('err'), message: label + '失败：' + errorText(e),
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

  private mindText() {
    return this.cfg.participants.map((p) => {
      const m = this.minds.get(p.agentId)!;
      return `${p.persona.name}：真实态度 ${m.stance || '尚未表态'}；打算 ${m.plan || '暂无'}；紧张 ${m.pressure}/10；信心 ${m.confidence}/10；内心 ${m.inner || '暂无'}`;
    }).join('\n');
  }

  private showMind(p: Participant) {
    const m = this.minds.get(p.agentId)!;
    const view: MindView = {
      mood: [
        { key: '紧张', value: m.pressure, color: 'var(--c-orange)' },
        { key: '信心', value: m.confidence, color: 'var(--c-blue)' },
      ],
      label: m.pressure >= 7 ? '压力很大' : m.confidence >= 7 ? '有底气' : '平静',
      emoji: m.pressure >= 7 ? '😓' : m.confidence >= 7 ? '🙂' : '😐',
      face: m.pressure >= 7 ? ['sweat'] : m.confidence >= 7 ? ['happy'] : [],
      inner: m.inner || undefined, stance: m.stance || undefined, plan: m.plan || undefined,
      toward: [],
    };
    this.emit({ type: 'mind', agentId: p.agentId, mind: view });
  }

  private status(p: Participant, state: 'idle' | 'thinking' | 'speaking' | 'done', action: string) {
    this.emit({ type: 'status', agentId: p.agentId, state, action });
  }
}

/** 独立的辩论模式：自己的导演、辩手、裁判与轮次，不依赖娱乐引擎或 Python 服务。 */
export function createRationalEngine(chatFn: DebateChat = browserChat): DiscussionEngine {
  let room: DebateRoom | null = null;
  return {
    start(cfg, emit) { room?.stop(); room = new DebateRoom(cfg, emit, chatFn); room.start(); },
    sendUserMessage(input) { room?.sendUserMessage(input); },
    pause() { room?.pause(); },
    resume() { room?.resume(); },
    stop() { room?.stop(); },
  };
}
