import type { AgentState, ChatMessage, DiscussionEngine, EngineEvent, SessionConfig } from '../../types';
import { chat, isAbort } from '../../llm/client';
import { openingDirection } from '../../data/conversationVariation';
import { extractJson } from './json';
import { cool, createMind, feel, heat, like, moodLabel, moodWords, relationWord, view, type Mind } from './mind';
import {
  readLiveOptions, readReactions, REACT_KINDS,
  type Candidate, type ChatFn, type Cue, type DebugEvent, type Line, type LiveKit, type LiveOptions, type Speech,
} from './types';

let seq = 0;
const uid = (p: string) => p + '-' + Date.now().toString(36) + '-' + (seq++).toString(36);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const QUOTE_PAIRS: Record<string, string> = { '“': '”', '「': '」', '『': '』', '"': '"', "'": "'" };
/**
 * 整句被一对引号包着（“……”「……」）时去掉这对引号；句子里本来就有的引号（引用别人的原话）不动，
 * 比如「故意」是你补的、那我给你一句能直接发的：“……”
 */
function unwrapQuotes(t: string) {
  const close = QUOTE_PAIRS[t[0]];
  if (!close || t.length < 2 || t[t.length - 1] !== close) return t;
  const inner = t.slice(1, -1);
  // 里面还有同样的引号，首尾就不是一对（「故意」是你补的「理由」），不动
  return inner.includes(t[0]) || inner.includes(close) ? t : inner.trim();
}

/** 说话时每秒刷新几次 */
const FPS = 12;
/** 说话速度：每秒几个字（再乘嘴快和上头程度） */
const CPS = 9;
/** 限速：导演每一步给一个人每种情绪最多改 2，按性情放大后最多变 3 */
const STEP_MOOD = 2;
const STEP_MOOD_MAX = 3;
/** 到了插嘴的地方、插嘴的人还没组织好话时，说话的人最多停多久 */
const MAX_CUT_WAIT = 4000;
/** 导演改的说话状态，过这么多次发言自动回到平时的样子（导演再写一次就续上），免得一次判断锁住一个人 */
const STYLE_TTL = 6;

/** 条件变量：状态一变就叫醒等着的循环，醒来后自己再看条件 */
class Signal {
  private waiters = new Set<() => void>();
  notify() {
    const ws = [...this.waiters];
    this.waiters.clear();
    ws.forEach((w) => w());
  }
  wait(ms?: number) {
    return new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = () => { if (timer !== undefined) clearTimeout(timer); this.waiters.delete(done); resolve(); };
      if (ms !== undefined) timer = setTimeout(done, Math.max(0, ms));
      this.waiters.add(done);
    });
  }
}

/** 准备好的下一句：导演的安排 + 角色自己说出来的话和自己报的心思（没人说就是冷场） */
interface Plan { cue: Cue; m: Mind | null; say: string[]; inner: string; speech?: Speech }

/** 正在准备的下一句；ver 对不上（期间有人说话、你插话、私聊改了谁的心思）就作废重来 */
interface Pending { ver: number; ctrl: AbortController; promise: Promise<Plan>; cue?: Cue; plan?: Plan }

/** 正在说的一段话 */
interface Speaking { m: Mind; lines: Line[]; at: number; cut: boolean }

/**
 * 导演 + 演员，权力分开：
 * - 导演（一次模型调用）看全局，只提名这一步可能接话的 1~3 个人和各自的话头，管节奏、旁人的情绪、全场走到哪；
 * - 谁真的开口由引擎按各人此刻的冲动抽（话多不多、情绪多热、是不是冲他来的、刚说完没有），硬规则（点名、用户在等）优先；
 * - 演员（这个角色自己的调用）拿着自己的人设决定怎么说，导演的话头只是建议，可以不照着来；
 *   他对这件事的看法、打算、说完这句的心情都由他自己报，导演只能看；
 * - 引擎记账（情绪、说话状态、态度、好恶）、限速、执行，每次把账喂回给导演和演员。
 * 一个人在说的时候，下一句已经在准备（流水线）；导演也可以提名人插嘴，在对方原话的那几个字处截断。
 */
class LiveRoom {
  private opts: LiveOptions;
  private minds = new Map<string, Mind>();
  private nameToId = new Map<string, string>();
  private lines: Line[] = [];
  private lineNo = 0;
  /** 第几次发言（用户说话也算，一次连发几条算一次） */
  private step = 0;
  /** 版本：记录或谁的心思一变就加一，准备到一半的下一句作废 */
  private ver = 0;
  private pending: Pending | null = null;
  private speaking: Speaking | null = null;
  /** 最近发生的事（给导演看）：你说了什么、私聊了谁、冷场…… */
  private events: Array<{ step: number; text: string }> = [];
  private arc = '开聊';
  private arcNote = '';
  private round = 1;
  private roundLabel = '开聊';
  /** 分步的模式（kit.stages）：现在在第几步、这一步从第几次发言开始 */
  private stage = 0;
  private stageStep = 0;
  /** 分步的模式没走完就冷场了：大家在等你开口，你说话（或点继续）之前谁也不说 */
  private idle = false;
  private silence = 0;
  private mentioned = new Set<string>();
  /** 你说的话还没人接 */
  private userWaiting = false;
  /** 正在说的时候你开口了：这一条说完就停 */
  private userSpoke = false;
  private lastInterrupt = -10;
  private budget: number;
  private paused = false;
  private stopped = false;
  private finished = false;
  /** 出错停着，等你点重试或者再开口 */
  private hold = false;
  private retried = false;
  private whispering = new Set<string>();
  private nextWhisper = new Map<string, string>();
  private lastWhisper = new Map<string, string>();
  private whisperCtrl = new AbortController();
  private summaryCtrl = new AbortController();
  private shownStatus = new Map<string, string>();
  private signal = new Signal();
  private angerKey: string | undefined;

  constructor(
    private kit: LiveKit,
    private chatFn: ChatFn,
    private cfg: SessionConfig,
    private emit: (e: EngineEvent) => void,
    private debug?: (e: DebugEvent) => void,
  ) {
    this.opts = readLiveOptions(cfg.engineOptions);
    this.budget = this.opts.maxMessages;
    this.angerKey = kit.moods.find((d) => d.amplify === 'temper')?.key;
  }

  start() {
    this.kit.setup?.(this.cfg);
    const byPersona = new Map(this.cfg.participants.map((p) => [p.persona.id, p.agentId]));
    for (const p of this.cfg.participants) {
      const t = this.kit.temperament(p);
      const seed: Record<string, number> = {};
      for (const [pid, v] of Object.entries(t.relations)) {
        const id = byPersona.get(pid);
        if (id && id !== p.agentId) seed[id] = clamp(v, -10, 10);
      }
      this.minds.set(p.agentId, createMind(p, t, this.kit.moods, seed, readReactions(p)));
      this.nameToId.set(p.persona.name, p.agentId);
    }
    this.nameToId.set('用户', 'user');
    if (this.kit.stages?.length) this.roundLabel = this.arc = this.kit.stages[0];
    this.emit({ type: 'session', state: 'running' });
    this.emit({ type: 'round', round: this.round, label: this.roundLabel });
    for (const m of this.minds.values()) { this.showMind(m); this.rest(m); }
    // 前端已经把你的第一句话显示出来了，这里只记进记录
    const opening = this.cfg.theme.brief?.trim() || this.cfg.theme.title.trim() || '随便聊聊';
    this.addUserLine(opening, false, this.mentionsIn(opening));
    this.stageStep = this.step;
    void this.loop();
  }

  userMessage(text: string, target?: string) {
    if (this.stopped) return;
    const clean = text.trim();
    if (!clean) return;
    const m = target ? this.minds.get(target) : undefined;
    if (m) return this.whisper(m, clean);
    if (this.finished) this.reopen();
    // 出错停着的话，你再开口就当作继续
    if (this.hold) { this.hold = false; this.pending = null; }
    this.addUserLine(clean, true, this.mentionsIn(clean));
  }

  /** 暂停只听按钮：正在说的人说完这一条就停，之后谁也不开口，直到点继续 */
  pause() {
    if (this.stopped || this.finished || this.paused) return;
    this.paused = true;
    for (const m of this.minds.values()) if (this.speaking?.m !== m) this.rest(m);
    this.emit({ type: 'session', state: 'paused' });
    this.signal.notify();
  }

  resume() {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    // 冷场等你开口时点了暂停又点继续：当作让大家接着聊
    this.idle = false;
    if (!this.finished) this.emit({ type: 'session', state: 'running' });
    this.signal.notify();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.pending?.ctrl.abort();
    this.whisperCtrl.abort();
    this.summaryCtrl.abort();
    this.signal.notify();
    if (!this.finished) this.emit({ type: 'session', state: 'stopped' });
  }

  // ---------- 主循环 ----------

  private async loop() {
    while (!this.stopped) {
      if (this.paused || this.finished || this.hold || this.idle) { await this.signal.wait(); continue; }
      let plan: Plan | null;
      try {
        plan = await this.next();
      } catch (e) {
        if (this.stopped) break;
        this.pending = null;
        // 偶尔一次失败先自己重试一下，再不行才停下来等你
        if (!this.retried) { this.retried = true; await this.signal.wait(1500 * Math.max(this.opts.pace, 0.2)); continue; }
        this.raise(e);
        continue;
      }
      if (!plan || this.paused || this.finished || this.hold || this.stopped) continue;
      this.retried = false;
      this.pending = null;
      if (!plan.m) { await this.quiet(plan.cue); continue; }
      // 被打断的那句刚停下，插嘴的人马上接；其他人组织一下语言再开口
      const cut = this.speaking === null && plan.cue.interrupt && this.lastInterrupt === this.step;
      if (!cut) {
        this.murmur(plan.cue);
        if (!(await this.nap(this.typing(plan)))) continue;
      }
      await this.utter(plan, cut);
      if (this.stopped) break;
      if (this.step >= this.budget || (plan.cue.end && this.step >= 8 && this.lastStage())) this.end();
    }
  }

  /** 下一句：用准备好的（版本对得上），没有就现准备 */
  private async next(): Promise<Plan | null> {
    if (!this.pending || this.pending.ver !== this.ver) this.prepare();
    const p = this.pending!;
    try {
      await p.promise;
    } catch (e) {
      if (p !== this.pending || p.ver !== this.ver || isAbort(e)) return null;
      throw e;
    }
    return p === this.pending && p.ver === this.ver ? p.plan ?? null : null;
  }

  private prepare() {
    this.pending?.ctrl.abort();
    // 上一份安排作废了：之前冒泡“想说话”的人先放下
    for (const m of this.minds.values()) if (this.speaking?.m !== m && !this.whispering.has(m.id)) this.rest(m);
    const ctrl = new AbortController();
    const p: Pending = { ver: this.ver, ctrl, promise: Promise.resolve(null as unknown as Plan) };
    p.promise = this.plan(ctrl.signal, p).then(
      (plan) => { p.plan = plan; this.signal.notify(); return plan; },
      (e) => { this.signal.notify(); throw e; },
    );
    p.promise.catch(() => {});
    this.pending = p;
  }

  /** 导演提名，引擎按冲动抽谁开口，演员自己说出来 */
  private async plan(signal: AbortSignal, p?: Pending): Promise<Plan> {
    const cue = await this.ask('导演', this.opts.directorTemperature, signal, () => this.kit.directorMessages({
      cfg: this.cfg, transcript: this.transcriptText(), state: this.stateAll(), arc: this.arcText(), now: this.nowText(),
    }), (t) => this.parseCue(t));
    this.cast(cue);
    const first = this.firstSpeaker();
    if (first && cue.speaker !== first.id) {
      // 随机抽中的开场人物必须落实到实际发言；导演偶尔忽略提示时也能避免紧邻两场同人开头。
      cue.speaker = first.id;
      cue.picked = -1;
      cue.to = 'user';
      cue.replyTo = this.lastFloor()?.id;
      cue.gist = `接住用户的原话；${openingDirection(this.cfg.mode, this.cfg.conversationVariation)}`;
      cue.emotion = '';
      cue.interrupt = false;
      cue.cutAfter = '';
      cue.react = cue.react.filter((r) => r.id !== first.id);
    }
    const m = cue.speaker ? this.minds.get(cue.speaker) ?? null : null;
    if (p) p.cue = cue;
    this.debug?.({ type: 'cue', cue, speaker: m?.name ?? '' });
    if (!m) return { cue, m: null, say: [], inner: '' };
    if (!signal.aborted && !this.paused && this.speaking?.m !== m) this.status(m, 'thinking', '想说话');
    const speech = await this.ask(m.name, this.opts.temperature, signal, () => this.kit.actorMessages({
      self: m.p, cfg: this.cfg, temper: m.t, transcript: this.transcriptText(), privates: this.privateText(m),
      state: this.stateOne(m, cue), cue: this.cueText(m, cue), whisper: false,
    }), (t) => this.parseSpeech(t, m, false));
    this.debug?.({ type: 'speech', speaker: m.name, follow: speech.follow, why: speech.why, stance: speech.stance, plan: speech.plan });
    return { cue, m, say: speech.say, inner: speech.inner, speech };
  }

  /**
   * 谁开口：导演只提名候选，这里按各人此刻的冲动抽一个——随性程度（spontaneity）那么大的概率按冲动抽，否则用导演首选。
   * 硬规则优先：用户点了名，被点的人先接（导演没提名他也一样）；用户说了话，只在冲用户说的候选里抽，抽中的人得接他
   */
  private cast(cue: Cue) {
    const take = (c: Candidate, i: number) => {
      cue.picked = i;
      cue.speaker = c.speaker;
      cue.to = c.to;
      cue.gist = c.gist;
      cue.emotion = c.emotion;
      cue.replyTo = c.replyTo;
      cue.interrupt = c.interrupt;
      cue.cutAfter = c.cutAfter;
    };
    const cands = cue.candidates;
    cue.weights = cands.map((c) => this.impulse(this.minds.get(c.speaker)));
    const lastUser = this.lastUserLine();
    const named = this.userWaiting ? [...this.mentioned] : [];
    const answer = (id: string, gist: string) => ({ speaker: id, to: 'user', gist, emotion: '', replyTo: lastUser?.id, interrupt: false, cutAfter: '' });
    if (named.length) {
      const i = cands.findIndex((c) => this.mentioned.has(c.speaker));
      if (i >= 0) take(cands[i], i);
      else take(answer(named[Math.floor(Math.random() * named.length)], '接用户点名问你的话'), -1);
      // 被点名的人是来接用户的话的
      if (cue.to !== 'user') { cue.to = 'user'; cue.replyTo = lastUser?.id; }
    } else if (!cands.length && this.userWaiting) {
      // 用户说了话，导演却没提名任何人：不能冷场晾着他，按冲动挑一个人来接
      const minds = [...this.minds.values()];
      const i = this.draw(minds.map((_, k) => k), minds.map((m) => this.impulse(m)), 1);
      take(answer(minds[i].id, '接用户刚才的话'), -1);
    } else if (cands.length) {
      let pool = cands.map((_, i) => i);
      const toUser = (c: Candidate) => c.to === 'user' || (!!lastUser && c.replyTo === lastUser.id);
      if (this.userWaiting && pool.some((i) => toUser(cands[i]))) pool = pool.filter((i) => toUser(cands[i]));
      const i = this.draw(pool, cue.weights);
      take(cands[i], i);
      if (this.userWaiting && !toUser(cue)) { cue.to = 'user'; cue.replyTo = lastUser?.id; }
    }
    cue.react = cue.react.filter((r) => r.id !== cue.speaker);
  }

  /** 随性程度那么大的概率按冲动抽（冲动越大越容易抽中），否则用导演首选（pool 里排最前的） */
  private draw(pool: number[], weights: number[], spontaneity = this.opts.spontaneity) {
    if (pool.length === 1 || Math.random() >= spontaneity) return pool[0];
    const total = pool.reduce((s, i) => s + weights[i], 0);
    let r = Math.random() * total;
    for (const i of pool) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return pool[pool.length - 1];
  }

  /**
   * 一个人此刻有多想开口（代码算，不问模型）：话多的人门槛低，上头的人憋不住，
   * 最新一句冲他来的、看不惯刚说话的人、刚被打断的更想接；刚说完的让一让，憋久了的想说两句
   */
  private impulse(m: Mind | undefined) {
    if (!m) return 0;
    const last = this.lastFloor();
    let w = 0.4 + m.t.talk + 1.2 * heat(m, this.kit.moods);
    if (last && last.speaker !== m.id) {
      const target = last.to || this.lines.find((l) => l.id === last.replyTo)?.speaker;
      if (target === m.id) w += 1.2;
      if (last.speaker !== 'user' && (m.rel[last.speaker] ?? 0) <= -3) w += 0.6;
    }
    if (m.cutoff) w += 0.8;
    const since = m.lastSpoke < 0 ? -1 : this.step - m.lastSpoke;
    if (since === 0) w *= 0.3;
    else if (since < 0 ? this.step >= 4 : since >= 6) w += 0.3;
    return Math.round(w * 100) / 100;
  }

  /** 调一次模型拿 JSON，没按格式回答就再问一次 */
  private async ask<T>(who: string, temperature: number, signal: AbortSignal, build: () => Parameters<ChatFn>[0], parse: (t: string) => T | null): Promise<T> {
    const messages = build();
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = parse(await this.chatFn(messages, { temperature, signal }));
      if (r) return r;
    }
    throw new Error(who + ' 两次都没按格式回答');
  }

  /** 两次都失败：停下来，等你点重试 */
  private raise(e: unknown) {
    this.hold = true;
    for (const m of this.minds.values()) if (this.speaking?.m !== m) this.rest(m);
    this.emit({
      type: 'error', id: uid('err'), message: '没接上话：' + errMsg(e),
      retry: () => {
        if (this.stopped) return;
        this.hold = false;
        this.retried = false;
        this.pending = null;
        this.signal.notify();
      },
    });
  }

  /** 导演安排冷场：等一会儿再排；连着两次没人说就散。分步的模式还没走到最后一步时不散，停下来等你开口 */
  private async quiet(cue: Cue) {
    this.apply(cue, null);
    this.silence++;
    if (!this.lastStage()) {
      this.idle = true;
      for (const m of this.minds.values()) this.status(m, 'idle', '等你开口');
      return;
    }
    for (const m of this.minds.values()) this.rest(m);
    if (this.silence >= 2) return this.end();
    if (!(await this.nap(2200))) return;
    this.note('冷场了：好一会儿没人说话');
    this.bump();
  }

  /** 旁人顺口的小反应，在这句开口前冒出来；说什么从这个人自己会的小反应里挑 */
  private murmur(cue: Cue) {
    const ver = this.ver;
    cue.react.slice(0, 2).forEach(({ id, kind, text: raw }, i) => {
      const m = this.minds.get(id);
      const text = m ? this.reactText(m, kind, raw) : '';
      if (!m || !text) return;
      const post = () => {
        if (this.ver !== ver || this.paused || this.stopped || this.finished) return;
        const line: Line = { id: 'm' + ++this.lineNo, msgId: uid('r'), speaker: m.id, name: m.name, text, kind: 'react' };
        this.lines.push(line);
        this.message({ id: line.msgId, speakerId: m.id, text, kind: 'react' });
        this.status(m, 'speaking', '小声');
        this.sleep(900).then(() => { if (this.speaking?.m !== m && !this.stopped) this.rest(m); });
      };
      if (this.opts.pace === 0) post();
      else setTimeout(post, (200 + i * 450 + Math.random() * 300) * this.opts.pace);
    });
  }

  /**
   * 小反应说什么：从这个人会的那一种里挑一句，避开他最近用过的；他不会这种反应就不出声。
   * 人物文件没写小反应（比如导入的人物）时，用导演写的原话
   */
  private reactText(m: Mind, kind: string, text: string) {
    const all = Object.values(m.reactions).flat();
    if (!all.length) return text;
    const list = m.reactions[kind] ?? (all.includes(text) ? [text] : []);
    const fresh = list.filter((s) => !m.recentReacts.includes(s));
    const pool = fresh.length ? fresh : list;
    const out = pool[Math.floor(Math.random() * pool.length)] ?? '';
    if (out) {
      m.recentReacts.push(out);
      if (m.recentReacts.length > 3) m.recentReacts.shift();
    }
    return out;
  }

  /** 组织语言要多久：话越长越久，上头的人快，嘴快的人快 */
  private typing(plan: Plan) {
    const chars = plan.say.join('').length;
    return (600 + Math.min(1800, 50 * chars)) * (1 - 0.3 * heat(plan.m!, this.kit.moods)) / plan.m!.t.speed;
  }

  /** 说出口：写进记录、记账，然后一个字一个字显示；这时候下一句已经在准备 */
  private async utter(plan: Plan, interrupting: boolean) {
    const { cue, m } = plan as Plan & { m: Mind };
    this.apply(cue, m, plan.speech?.mood);
    const prev = this.lastFloor();
    const lines: Line[] = plan.say.slice(0, 3).map((text, i) => ({
      id: 'm' + ++this.lineNo, msgId: uid('m'), speaker: m.id, name: m.name, text, kind: 'say',
      replyTo: i === 0 ? cue.replyTo : undefined, to: i === 0 && cue.to ? cue.to : undefined, interrupt: i === 0 && interrupting,
    }));
    const quoted = cue.replyTo && cue.replyTo !== prev?.id ? this.lines.find((l) => l.id === cue.replyTo) : undefined;
    this.lines.push(...lines);
    this.step++;
    m.lastSpoke = this.step;
    m.cutoff = undefined;
    if (plan.inner) m.inner = plan.inner;
    this.own(m, plan.speech);
    const toUser = cue.to === 'user' || this.lines.find((l) => l.id === cue.replyTo)?.speaker === 'user';
    if (this.mentioned.has(m.id) || toUser) this.userWaiting = false;
    this.mentioned.delete(m.id);
    this.silence = 0;
    for (const x of this.minds.values()) {
      cool(x, this.kit.moods);
      if (x.style && this.step - x.styleAt >= STYLE_TTL) x.style = '';
      this.showMind(x);
    }
    const sp: Speaking = { m, lines, at: 0, cut: false };
    this.speaking = sp;
    this.userSpoke = false;
    this.bump();
    this.prepare();
    this.status(m, 'speaking', interrupting ? '插嘴' : '说话');
    for (let i = 0; i < lines.length; i++) {
      sp.at = i;
      const quote = i === 0 && quoted ? { name: quoted.name, text: clip(quoted.text, 24) } : undefined;
      const res = await this.display(sp, i, quote, i === 0 && interrupting);
      if (res.end === 'cut') {
        const by = this.pending!.plan!.m!;
        const line = lines[i];
        const rest = [line.text.slice(res.shown), ...lines.slice(i + 1).map((l) => l.text)].join(' ').trim();
        line.text = line.text.slice(0, res.shown) + '——';
        line.cutBy = by.name;
        this.drop(lines.slice(i + 1));
        this.emit({ type: 'message_update', id: line.msgId, text: line.text, cut: true });
        m.cutoff = { by: by.name, rest };
        if (this.angerKey) feel(m, { [this.angerKey]: 1.5 }, this.kit.moods);
        like(m, by.id, -1.5);
        this.showMind(m);
        this.lastInterrupt = this.step;
        break;
      }
      if (res.end !== 'done') {
        // 暂停了、你开口了：这一条说完就停，后面没说出口的不算数，下一句重新排
        if (i + 1 < lines.length) { this.drop(lines.slice(i + 1)); this.bump(); }
        break;
      }
      if (i + 1 < lines.length) await this.sleep(350 + Math.random() * 400);
    }
    this.speaking = null;
    this.rest(m);
  }

  private async display(sp: Speaking, index: number, quote: ChatMessage['quote'], interrupt: boolean) {
    const line = sp.lines[index];
    const m = sp.m;
    this.message({ id: line.msgId, speakerId: m.id, text: '', kind: 'speech', quote, tag: interrupt ? '插嘴' : undefined });
    const full = line.text;
    const cps = CPS * m.t.speed * (1 + 0.4 * heat(m, this.kit.moods));
    const step = Math.max(1, Math.round(cps / FPS));
    let shown = 0;
    let waitFrom = 0;
    while (shown < full.length) {
      if (this.stopped) return { end: 'stop' as const, shown };
      const cut = this.cutHere(sp, index, shown);
      if (cut === 'now') return { end: 'cut' as const, shown };
      if (cut === 'wait') {
        // 导演已经安排人在这里插嘴，他的话还在组织：说话的人停在这儿（最多等几秒）
        if (Date.now() - (waitFrom ||= Date.now()) < MAX_CUT_WAIT) { await this.signal.wait(100); continue; }
      }
      shown = Math.min(full.length, shown + step);
      this.emit({ type: 'message_update', id: line.msgId, text: full.slice(0, shown) });
      await this.sleep(1000 / FPS);
    }
    if (this.stopped) return { end: 'stop' as const, shown };
    if (this.paused || this.userSpoke) return { end: 'yield' as const, shown };
    return { end: 'done' as const, shown };
  }

  /**
   * 导演安排的下一句是插嘴：说到让他忍不住的那几个字就截断（快说完了就不截）。
   * 返回 now：插嘴的人话已备好，现在截；wait：到点了但他还在组织语言，先停在这儿等；false：不截。
   */
  private cutHere(sp: Speaking, index: number, shown: number): 'now' | 'wait' | false {
    const p = this.pending;
    const cue = p?.cue;
    if (!p || !cue || p.ver !== this.ver || !cue.interrupt || !cue.speaker || cue.speaker === sp.m.id) return false;
    if (this.paused || this.userSpoke || this.step - this.lastInterrupt < 3) return false;
    const len = sp.lines[index].text.length;
    if (len - shown < 3) return false;
    const phrase = cue.cutAfter;
    const at = phrase ? sp.lines.findIndex((l) => l.text.includes(phrase)) : -1;
    let reached: boolean;
    if (at < 0) reached = shown >= Math.max(2, Math.floor(len * 0.5));
    else if (at < index) reached = shown >= 2;
    else if (at > index) reached = false;
    else reached = shown >= sp.lines[index].text.indexOf(phrase) + phrase.length;
    if (!reached) return false;
    return p.plan?.m ? 'now' : 'wait';
  }

  /** 散场：写总结的同时，你随时可以再开口接着聊 */
  private end() {
    if (this.finished || this.stopped) return;
    this.finished = true;
    this.pending?.ctrl.abort();
    this.pending = null;
    for (const m of this.minds.values()) this.rest(m);
    void this.summarize();
  }

  private async summarize() {
    const at = this.step;
    try {
      const text = await this.chatFn(this.kit.summaryMessages(this.cfg, this.logText()), {
        temperature: this.opts.summaryTemperature, signal: this.summaryCtrl.signal,
      });
      // 总结期间你又开口了，接着聊，这份总结不要了
      if (this.stopped || !this.finished || this.step !== at) return;
      this.emit({ type: 'result', result: this.kit.parseSummary(text) });
      this.emit({ type: 'session', state: 'finished' });
    } catch (e) {
      if (this.stopped || isAbort(e) || !this.finished) return;
      this.emit({ type: 'session', state: 'finished' });
      this.emit({ type: 'error', id: uid('err'), message: '整理这场聊天时出错：' + errMsg(e), retry: () => void this.summarize() });
    }
  }

  /** 散场后你又开口：接着聊一阵 */
  private reopen() {
    this.finished = false;
    this.silence = 0;
    this.budget = this.step + Math.max(12, Math.round(this.opts.maxMessages / 2));
    this.emit({ type: 'session', state: 'running' });
  }

  // ---------- 记账 ----------

  /**
   * 照导演的安排记账：旁人的情绪（限速）、说话状态、好恶、全场走到哪。
   * 说话的人自己报了心情（ownMood）就用他自己的，导演给他的那份不算；态度和打算导演不管
   */
  private apply(cue: Cue, speaker: Mind | null, ownMood?: Record<string, number>) {
    const touched = new Set<Mind>();
    for (const [id, delta] of Object.entries(cue.mood)) {
      const m = this.minds.get(id);
      if (!m || (ownMood && m === speaker)) continue;
      this.moodStep(m, delta);
      touched.add(m);
    }
    for (const [id, v] of Object.entries(cue.style)) {
      const m = this.minds.get(id);
      if (!m) continue;
      m.style = v;
      m.styleAt = this.step;
      touched.add(m);
    }
    for (const [id, map] of Object.entries(cue.toward)) {
      const m = this.minds.get(id);
      if (!m) continue;
      for (const [other, d] of Object.entries(map)) if (other !== id) like(m, other, d);
      touched.add(m);
    }
    for (const m of touched) { this.showMind(m); if (m !== speaker && this.speaking?.m !== m) this.rest(m); }
    // 导演的安排只在幕后：界面上只看得到话题换了（分步的模式还看得到走到了哪一步）
    if (cue.topic && this.step - this.roundStep >= 6) this.newRound('换话题 · ' + cue.topic);
    // 新的一步从有人开口算起：冷场那一步不推进，免得还在等你回答就被当成走到了最后一步
    if (cue.arc) { this.arc = cue.arc; if (speaker) this.advanceStage(cue.arc); }
    if (cue.arcNote) this.arcNote = cue.arcNote;
  }

  /** 记一步情绪：每种最多 ±STEP_MOOD，按性情放大后这一步最多变 STEP_MOOD_MAX */
  private moodStep(m: Mind, delta: Record<string, number>) {
    const before = { ...m.mood };
    const raw: Record<string, number> = {};
    for (const [k, v] of Object.entries(delta)) raw[k] = clamp(v, -STEP_MOOD, STEP_MOOD);
    feel(m, raw, this.kit.moods);
    for (const d of this.kit.moods) m.mood[d.key] = clamp(m.mood[d.key], before[d.key] - STEP_MOOD_MAX, before[d.key] + STEP_MOOD_MAX);
  }

  /** 演员自己报的：对这件事的看法、打算、说完这句的心情；没照导演的建议说，就把他的理由告诉导演 */
  private own(m: Mind, sp?: Speech) {
    if (!sp) return;
    if (sp.stance) m.stance = sp.stance;
    if (sp.plan) m.plan = sp.plan;
    this.moodStep(m, sp.mood);
    if (!sp.follow) this.note(`${m.name}没照你的建议说${sp.why ? '：' + sp.why : ''}（以他实际说的为准）`);
  }

  /** 分步的模式：导演说走到了后面的步骤，就开一段新的；只往前走，不回头 */
  private advanceStage(arc: string) {
    const stages = this.kit.stages;
    if (!stages?.length) return;
    const i = stages.findIndex((s) => arc.includes(s) || (arc.length >= 2 && s.includes(arc)));
    if (i <= this.stage) return;
    this.stage = i;
    this.stageStep = this.step;
    this.newRound(stages[i]);
  }

  /** 没有分步，或者已经走到最后一步：可以散场了 */
  private lastStage() {
    const n = this.kit.stages?.length ?? 0;
    return n === 0 || this.stage >= n - 1;
  }

  private roundStep = 0;

  private newRound(label: string) {
    this.round++;
    this.roundStep = this.step;
    this.roundLabel = label;
    this.emit({ type: 'round', round: this.round, label });
  }

  private whisper(m: Mind, text: string) {
    this.message({ id: uid('u'), speakerId: 'user', text, kind: 'user', targetId: m.id, private: true });
    m.privates.push({ who: 'user', text });
    this.lastWhisper.set(m.id, text);
    this.showMind(m);
    if (this.whispering.has(m.id)) { this.nextWhisper.set(m.id, text); return; }
    void this.answerWhisper(m, text);
  }

  /** 私聊：他自己私下回你一句，心思跟着变；导演也知道了（只能通过他来体现） */
  private async answerWhisper(m: Mind, text: string) {
    this.whispering.add(m.id);
    if (this.speaking?.m !== m) this.status(m, 'thinking', '想怎么回你…');
    try {
      const sp = await this.ask(m.name, this.opts.temperature, this.whisperCtrl.signal, () => this.kit.actorMessages({
        self: m.p, cfg: this.cfg, temper: m.t, transcript: this.transcriptText(), privates: this.privateText(m),
        state: this.stateOne(m), cue: text, whisper: true,
      }), (t) => this.parseSpeech(t, m, true));
      if (this.stopped) return;
      this.moodStep(m, sp.mood);
      if (sp.stance) m.stance = sp.stance;
      if (sp.plan) m.plan = sp.plan;
      if (sp.inner) m.inner = sp.inner;
      const reply = sp.privateReply || '嗯。';
      m.privates.push({ who: 'self', text: reply });
      this.message({ id: uid('w'), speakerId: m.id, text: reply, kind: 'reply', targetId: 'user', private: true });
      this.showMind(m);
      this.note(`用户私下对${m.name}说「${text}」，${m.name}私下回「${reply}」${sp.plan ? '，打算：' + sp.plan : ''}（只有${m.name}知道，别让别人知道，只能通过${m.name}的言行体现）`);
      // 心思变了：还没说出口的下一句重新排
      this.bump();
    } catch (e) {
      if (this.stopped || isAbort(e)) return;
      this.emit({
        type: 'error', id: uid('err'), agentId: m.id, message: m.name + ' 没接住你的私聊：' + errMsg(e),
        retry: () => { if (!this.stopped) void this.answerWhisper(m, text); },
      });
    } finally {
      this.whispering.delete(m.id);
      if (!this.stopped && this.speaking?.m !== m) this.rest(m);
      const more = this.nextWhisper.get(m.id);
      if (more !== undefined && !this.stopped) { this.nextWhisper.delete(m.id); void this.answerWhisper(m, more); }
    }
  }

  // ---------- 解析 ----------

  private idOf(name: unknown) {
    return typeof name === 'string' ? this.nameToId.get(name.replace(/^@/, '').trim()) : undefined;
  }

  private parseCue(text: string): Cue | null {
    const j = extractJson(text);
    if (!j) return null;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const int = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? clamp(n, lo, hi) : 0; };
    const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    const byName = <T>(v: unknown, f: (x: unknown, id: string) => T | undefined) => {
      const out: Record<string, T> = {};
      for (const [name, x] of Object.entries(obj(v))) {
        const id = this.idOf(name);
        if (!id || id === 'user') continue;
        const val = f(x, id);
        if (val !== undefined) out[id] = val;
      }
      return out;
    };
    /** 导演提名的一个候选；认不出是谁的不要 */
    const candidate = (v: unknown): Candidate | null => {
      const c = obj(v);
      const speaker = this.idOf(c.speaker);
      if (!speaker || speaker === 'user') return null;
      const to = this.idOf(c.to) ?? '';
      const replyTo = str(c.reply_to, 12);
      return {
        speaker,
        to: to === speaker ? '' : to,
        gist: str(c.gist, 80),
        emotion: str(c.emotion, 20),
        replyTo: this.lines.some((l) => l.id === replyTo) ? replyTo : undefined,
        interrupt: c.interrupt === true || c.interrupt === 'true',
        cutAfter: str(c.cut_after, 20),
      };
    };
    // candidates 是现在的写法；next（只提一个人）是以前的写法，也认
    const candidates: Candidate[] = [];
    for (const v of Array.isArray(j.candidates) ? j.candidates : j.next ? [j.next] : []) {
      const c = candidate(v);
      if (c && !candidates.some((x) => x.speaker === c.speaker)) candidates.push(c);
      if (candidates.length >= 3) break;
    }
    return {
      speaker: '', to: '', gist: '', emotion: '', interrupt: false, cutAfter: '',
      candidates,
      picked: -1,
      weights: [],
      mood: byName(j.mood, (x) => {
        const d: Record<string, number> = {};
        for (const k of this.kit.moods) d[k.key] = int(obj(x)[k.key], -STEP_MOOD, STEP_MOOD);
        return d;
      }),
      style: byName(j.style, (x) => (typeof x === 'string' ? x.trim().slice(0, 40) : undefined)),
      toward: byName(j.toward, (x) => {
        const d: Record<string, number> = {};
        for (const [name, v] of Object.entries(obj(x))) { const id = this.idOf(name); if (id) d[id] = int(v, -2, 2); }
        return d;
      }),
      react: (Array.isArray(j.react) ? j.react : [])
        .map((r) => {
          const kind = str(obj(r).kind, 4);
          return { id: this.idOf(obj(r).who) ?? '', kind: REACT_KINDS.includes(kind) ? kind : '', text: this.clean(str(obj(r).text, 12)) };
        })
        .filter((r) => r.id && r.id !== 'user' && (r.kind || r.text))
        .slice(0, 2),
      arc: str(j.arc, 8),
      arcNote: str(j.arc_note, 60),
      topic: str(j.topic, 12),
      end: j.end === true || j.end === 'true',
    };
  }

  private parseSpeech(text: string, m: Mind, whisper: boolean): Speech | null {
    const j = extractJson(text);
    if (!j) return null;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const rawSay = Array.isArray(j.say) ? j.say : typeof j.say === 'string' ? [j.say] : [];
    const say = rawSay.map((s) => this.clean(String(s), m)).filter(Boolean).slice(0, 3);
    const mood: Record<string, number> = {};
    const rawMood = j.mood && typeof j.mood === 'object' ? (j.mood as Record<string, unknown>) : {};
    for (const d of this.kit.moods) { const n = Math.round(Number(rawMood[d.key])); mood[d.key] = Number.isFinite(n) ? n : 0; }
    const sp: Speech = {
      say, inner: str(j.inner, 60), privateReply: this.clean(str(j.private_reply, 120), m),
      stance: str(j.stance, 60), plan: str(j.plan, 40), mood,
      follow: !(j.follow === false || j.follow === 'false'), why: str(j.why, 40),
    };
    return whisper ? (sp.privateReply ? sp : null) : (say.length ? sp : null);
  }

  /** 去掉包着整句的引号和“名字：”前缀 */
  private clean(s: string, m?: Mind) {
    let t = unwrapQuotes(s.trim());
    if (m) t = unwrapQuotes(t.replace(new RegExp('^' + escapeRe(m.name) + '\\s*[:：]\\s*'), ''));
    return t.slice(0, 80).trim();
  }

  // ---------- 给模型看的材料 ----------

  private transcriptText() {
    const recent = this.lines.slice(-60);
    if (!recent.length) return '（还没人说话）';
    let prev = '';
    return recent.map((l) => {
      if (l.kind === 'react') return `（${l.name} 小声：${l.text}）`;
      const reply = l.replyTo && l.replyTo !== prev ? `（回 ${l.replyTo}）` : '';
      const target = l.to ? `（冲${this.nameOf(l.to)}）` : '';
      const how = l.interrupt ? '（插嘴）' : '';
      const cut = l.cutBy ? `（话没说完，被${l.cutBy}打断）` : '';
      prev = l.id;
      return `[${l.id}] ${l.name}${reply}${target}${how}：${l.text}${cut}`;
    }).join('\n');
  }

  private privateText(m: Mind) {
    return m.privates.slice(-12).map((x) => (x.who === 'user' ? '用户：' : '你：') + x.text).join('\n');
  }

  private relText(m: Mind) {
    return Object.entries(m.rel)
      .filter(([, v]) => Math.abs(v) >= 2)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([id, v]) => {
        const w = relationWord(v);
        return `${this.nameOf(id)} ${v > 0 ? '+' : ''}${Math.round(v)}${w ? '（' + w + '）' : ''}`;
      }).join('；');
  }

  private since(m: Mind) {
    if (m.lastSpoke < 0) return '还没开过口';
    const n = this.step - m.lastSpoke;
    return n === 0 ? '最新那段是他说的' : `${n} 次发言前说过话`;
  }

  /** 给导演看的账：每个人一行 */
  private stateAll() {
    return [...this.minds.values()].map((m) => {
      const parts = ['心情 ' + moodWords(m, this.kit.moods)];
      parts.push('说话状态：' + (m.style || '平常'));
      if (m.stance) parts.push('态度：' + m.stance);
      if (m.plan) parts.push('打算：' + m.plan);
      const rel = this.relText(m);
      if (rel) parts.push('对人：' + rel);
      if (m.cutoff) parts.push(`刚被${m.cutoff.by}打断，没说完：「${clip(m.cutoff.rest, 20)}」`);
      parts.push(this.since(m));
      return `- ${m.name}：${parts.join('｜')}`;
    }).join('\n');
  }

  /** 给演员看的自己的账 */
  private stateOne(m: Mind, cue?: Cue) {
    const out = ['- 心情：' + moodWords(m, this.kit.moods)];
    const rel = this.relText(m);
    if (rel) out.push('- 对人：' + rel);
    out.push('- 你对这个话题的态度：' + (m.stance || '还没想好'));
    if (m.plan) out.push('- 你正打算：' + m.plan);
    if (m.inner) out.push('- 你上一刻心里想：' + m.inner);
    const style = cue?.style[m.id] ?? m.style;
    if (style) out.push('- 你现在的说话状态：' + style);
    if (m.cutoff) out.push(`- 你刚才的话被${m.cutoff.by}打断了，没说完的是：「${m.cutoff.rest}」`);
    return out.join('\n');
  }

  private arcText() {
    const stages = this.kit.stages;
    const where = stages?.length
      ? `现在在第 ${this.stage + 1}/${stages.length} 步「${stages[this.stage]}」，这一步已经 ${this.step - this.stageStep} 次发言（顺序：${stages.join(' → ')}）`
      : `全场现在：${this.arc}`;
    return `${where}。你上一步的打算：${this.arcNote || '（还没有）'}`;
  }

  private nowText() {
    const out: string[] = [];
    if (this.step <= 1) out.push('刚开聊，用户开了个头。提名第一句的候选；需要的话可以给人定下说话状态。');
    if (this.step <= 1) {
      const direction = openingDirection(this.cfg.mode, this.cfg.conversationVariation);
      if (direction) out.push('这场先从这里切入：' + direction + '后续仍要顺着现场自然发展，不要反复强调这个切入点。');
      const first = this.firstSpeaker();
      if (first) out.push('开场先让' + first.name + '接用户的话，其他人随后自然加入。');
    }
    const last = this.lastFloor();
    if (last) {
      const who = last.speaker === 'user' ? '用户' : last.name;
      const talking = this.speaking && this.speaking.lines.includes(last);
      out.push(`最新一句是 [${last.id}] ${who}说的${talking ? '（他话还没说完；要提名人插嘴，就在那个候选里写 interrupt 和 cut_after）' : ''}。`);
    }
    const recent = this.events.filter((e) => e.step >= this.step - 3).map((e) => '- ' + e.text);
    if (recent.length) out.push('刚发生的事：\n' + recent.join('\n'));
    if (this.userWaiting) {
      const named = [...this.mentioned].map((id) => this.nameOf(id));
      out.push('用户的话还没人接，候选里得有冲用户说的人' + (named.length ? `；他点名了${named.join('、')}，被点名的人一定先接，把他排进候选。` : '。'));
    }
    const quiet = [...this.minds.values()]
      .filter((x) => (x.lastSpoke < 0 ? this.step >= 6 : this.step - x.lastSpoke >= 6))
      .map((x) => x.name);
    if (quiet.length) out.push('一直没怎么吭声的：' + quiet.join('、') + '。');
    if (this.budget - this.step <= 5) {
      const stages = this.kit.stages;
      out.push(this.lastStage()
        ? '聊了挺久了，快到尾声，可以往收尾走；差不多了就 end=true。'
        : `聊了挺久了，快到尾声，还没走到「${stages![stages!.length - 1]}」，该往那走了；走到了再 end=true。`);
    }
    out.push('谁开口是从你的候选里按各人此刻的冲动抽的，演员也可能不照你的话头说；以记录为准，据此调整。');
    return out.join('\n');
  }

  private firstSpeaker() {
    const v = this.cfg.conversationVariation?.speakerIndex;
    if (this.step !== 1 || this.mentioned.size || typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) return null;
    const p = this.cfg.participants[v % this.cfg.participants.length];
    return p ? this.minds.get(p.agentId) ?? null : null;
  }

  /** 导演给演员的这一步建议：合他的人设和此刻的心思就顺着说，不合他可以不照着来 */
  private cueText(m: Mind, cue: Cue) {
    const out = ['导演给你的建议（只有你看得到；合你的人设和此刻的心思就顺着说，不合就按你自己会怎么说来）：'];
    if (cue.to) out.push('- 冲' + this.nameOf(cue.to) + '说' + (cue.to === 'user' && this.userWaiting ? '（用户在等人接他的话）' : ''));
    if (cue.gist) out.push('- 话头：' + cue.gist);
    if (cue.emotion) out.push('- 情绪：' + cue.emotion);
    const style = cue.style[m.id] ?? m.style;
    if (style) out.push('- 说话状态：' + style);
    if (cue.interrupt && this.speaking && this.speaking.m !== m) {
      out.push(`- 你是插嘴：${this.speaking.m.name}正说着${cue.cutAfter ? '，说到「' + cue.cutAfter + '」你就忍不住打断了，只接这之前听到的内容' : '，你忍不住打断了'}`);
    }
    return out.join('\n');
  }

  private logText() {
    return this.lines.map((l) => (l.kind === 'react' ? `（${l.name} 小声：${l.text}）` : `${l.name}：${l.text}`)).join('\n');
  }

  // ---------- 小工具 ----------

  private addUserLine(text: string, show: boolean, targets = new Set<string>()) {
    const line: Line = { id: 'm' + ++this.lineNo, msgId: uid('u'), speaker: 'user', name: '用户', text, kind: 'user' };
    this.lines.push(line);
    if (show) this.message({ id: line.msgId, speakerId: 'user', text, kind: 'user' });
    this.step++;
    this.mentioned = targets;
    this.userWaiting = true;
    this.silence = 0;
    this.idle = false;
    if (this.speaking) this.userSpoke = true;
    for (const m of this.minds.values()) { cool(m, this.kit.moods); this.showMind(m); }
    this.bump();
  }

  private note(text: string) {
    this.events.push({ step: this.step, text });
    if (this.events.length > 20) this.events.shift();
  }

  /** 记录或心思变了：准备到一半的下一句作废 */
  private bump() {
    this.ver++;
    this.signal.notify();
  }

  private lastFloor() {
    for (let i = this.lines.length - 1; i >= 0; i--) if (this.lines[i].kind !== 'react') return this.lines[i];
    return undefined;
  }

  private lastUserLine() {
    for (let i = this.lines.length - 1; i >= 0; i--) if (this.lines[i].speaker === 'user') return this.lines[i];
    return undefined;
  }

  private drop(lines: Line[]) {
    if (!lines.length) return;
    const ids = new Set(lines.map((l) => l.id));
    this.lines = this.lines.filter((l) => !ids.has(l.id));
  }

  private mentionsIn(text: string) {
    const out = new Set<string>();
    for (const m of this.minds.values()) {
      if (text.includes('@' + m.name) || new RegExp('^' + escapeRe(m.name) + '[，,：: ]').test(text)) out.add(m.id);
    }
    return out;
  }

  private nameOf(id: string) {
    return id === 'user' ? '用户' : this.minds.get(id)?.name ?? id;
  }

  /** 等一会儿（乘节奏倍数）；中途有变化（你开口、私聊改了心思、暂停……）就提前返回 false */
  private async nap(ms: number) {
    const ver = this.ver;
    const end = Date.now() + ms * this.opts.pace;
    while (!this.stopped) {
      if (this.ver !== ver || this.paused || this.hold || this.finished) return false;
      const left = end - Date.now();
      if (left <= 0) return true;
      await this.signal.wait(left);
    }
    return false;
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms * this.opts.pace));
  }

  private rest(m: Mind) {
    this.status(m, this.finished ? 'done' : 'idle', moodLabel(m, this.kit.moods));
  }

  private status(m: Mind, state: AgentState, action: string) {
    const key = state + '|' + action;
    if (this.shownStatus.get(m.id) === key) return;
    this.shownStatus.set(m.id, key);
    this.emit({ type: 'status', agentId: m.id, state, action });
  }

  private showMind(m: Mind) {
    this.emit({ type: 'mind', agentId: m.id, mind: view(m, this.kit.moods, (id) => this.nameOf(id), this.lastWhisper.get(m.id)) });
  }

  private message(m: Omit<ChatMessage, 'round' | 'at'>) {
    this.emit({ type: 'message', message: { ...m, round: this.round, at: Date.now() } });
  }
}

const browserChat: ChatFn = async (messages, opt) => (await chat(messages, opt)).text;

/**
 * 用某个模式的玩法（kit）造一个引擎；chatFn 默认走浏览器的 /api/llm/chat，命令行模拟时换成直连。
 * debug 只给命令行调参用（看导演提名了谁、抽中了谁、演员有没有照导演说），界面上不显示导演。
 */
export function createLiveEngine(kit: LiveKit, chatFn: ChatFn = browserChat, debug?: (e: DebugEvent) => void): DiscussionEngine {
  let room: LiveRoom | null = null;
  return {
    start(config, emit) {
      room?.stop();
      room = new LiveRoom(kit, chatFn, config, emit, debug);
      room.start();
    },
    sendUserMessage({ text, targetAgentId }) { room?.userMessage(text, targetAgentId); },
    pause() { room?.pause(); },
    resume() { room?.resume(); },
    stop() { room?.stop(); },
  };
}
