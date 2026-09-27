import type { AgentState, ChatMessage, DiscussionEngine, EngineEvent, SessionConfig } from '../../types';
import { chat, isAbort } from '../../llm/client';
import { extractJson } from './json';
import { cool, createMind, feel, heat, like, moodLabel, moodWords, relationWord, view, type Mind } from './mind';
import { readLiveOptions, type ChatFn, type Cue, type Line, type LiveKit, type LiveOptions, type Speech } from './types';

let seq = 0;
const uid = (p: string) => p + '-' + Date.now().toString(36) + '-' + (seq++).toString(36);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 说话时每秒刷新几次 */
const FPS = 12;
/** 说话速度：每秒几个字（再乘嘴快和上头程度） */
const CPS = 9;
/** 限速：导演每一步给一个人每种情绪最多改 2，按性情放大后最多变 3 */
const STEP_MOOD = 2;
const STEP_MOOD_MAX = 3;
/** 到了插嘴的地方、插嘴的人还没组织好话时，说话的人最多停多久 */
const MAX_CUT_WAIT = 4000;

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

/** 准备好的下一句：导演的安排 + 角色自己说出来的话（没人说就是冷场） */
interface Plan { cue: Cue; m: Mind | null; say: string[]; inner: string }

/** 正在准备的下一句；ver 对不上（期间有人说话、你插话、私聊改了谁的心思）就作废重来 */
interface Pending { ver: number; ctrl: AbortController; promise: Promise<Plan>; cue?: Cue; plan?: Plan }

/** 正在说的一段话 */
interface Speaking { m: Mind; lines: Line[]; at: number; cut: boolean }

/**
 * 导演 + 演员：
 * - 导演（一次模型调用）看全局，定下一句谁说、冲谁、大意、说话时的情绪，谁的情绪怎么递进、说话状态怎么变，全场走到哪；
 * - 演员（这个角色自己的调用）拿着自己的人设和导演的提示，用自己的话说出来；
 * - 引擎记账（情绪、说话状态、态度、好恶）、限速、执行，每次把账喂回给导演和演员。
 * 一个人在说的时候，下一句已经在准备（流水线）；导演也可以安排人插嘴，在对方原话的那几个字处截断。
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
    private debug?: (cue: Cue, speaker: string) => void,
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
      this.minds.set(p.agentId, createMind(p, t, this.kit.moods, seed));
      this.nameToId.set(p.persona.name, p.agentId);
    }
    this.nameToId.set('用户', 'user');
    this.emit({ type: 'session', state: 'running' });
    this.emit({ type: 'round', round: this.round, label: this.roundLabel });
    for (const m of this.minds.values()) { this.showMind(m); this.rest(m); }
    // 前端已经把你的第一句话显示出来了，这里只记进记录
    this.addUserLine(this.cfg.theme.brief?.trim() || this.cfg.theme.title.trim() || '随便聊聊', false);
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
      if (this.paused || this.finished || this.hold) { await this.signal.wait(); continue; }
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
      if (this.step >= this.budget || (plan.cue.end && this.step >= 8)) this.end();
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

  /** 导演排下一步，演员说出来 */
  private async plan(signal: AbortSignal, p?: Pending): Promise<Plan> {
    const cue = await this.ask('导演', this.opts.directorTemperature, signal, () => this.kit.directorMessages({
      cfg: this.cfg, transcript: this.transcriptText(), state: this.stateAll(), arc: this.arcText(), now: this.nowText(),
    }), (t) => this.parseCue(t));
    const m = cue.speaker ? this.minds.get(cue.speaker) ?? null : null;
    if (p) p.cue = cue;
    this.debug?.(cue, m?.name ?? '');
    if (!m) return { cue, m: null, say: [], inner: '' };
    if (!signal.aborted && !this.paused && this.speaking?.m !== m) this.status(m, 'thinking', '想说话');
    const speech = await this.ask(m.name, this.opts.temperature, signal, () => this.kit.actorMessages({
      self: m.p, cfg: this.cfg, temper: m.t, transcript: this.transcriptText(), privates: this.privateText(m),
      state: this.stateOne(m, cue), cue: this.cueText(m, cue), whisper: false,
    }), (t) => this.parseSpeech(t, m, false));
    return { cue, m, say: speech.say, inner: speech.inner };
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

  /** 导演安排冷场：等一会儿再排；连着两次没人说就散 */
  private async quiet(cue: Cue) {
    this.apply(cue, null);
    this.silence++;
    for (const m of this.minds.values()) this.rest(m);
    if (this.silence >= 2) return this.end();
    if (!(await this.nap(2200))) return;
    this.note('冷场了：好一会儿没人说话');
    this.bump();
  }

  /** 旁人顺口的小反应，在这句开口前冒出来 */
  private murmur(cue: Cue) {
    const ver = this.ver;
    cue.react.slice(0, 2).forEach(({ id, text }, i) => {
      const m = this.minds.get(id);
      if (!m) return;
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

  /** 组织语言要多久：话越长越久，上头的人快，嘴快的人快 */
  private typing(plan: Plan) {
    const chars = plan.say.join('').length;
    return (600 + Math.min(1800, 50 * chars)) * (1 - 0.3 * heat(plan.m!, this.kit.moods)) / plan.m!.t.speed;
  }

  /** 说出口：写进记录、记账，然后一个字一个字显示；这时候下一句已经在准备 */
  private async utter(plan: Plan, interrupting: boolean) {
    const { cue, m } = plan as Plan & { m: Mind };
    this.apply(cue, m);
    const prev = this.lastFloor();
    const lines: Line[] = plan.say.slice(0, 3).map((text, i) => ({
      id: 'm' + ++this.lineNo, msgId: uid('m'), speaker: m.id, name: m.name, text, kind: 'say',
      replyTo: i === 0 ? cue.replyTo : undefined, interrupt: i === 0 && interrupting,
    }));
    const quoted = cue.replyTo && cue.replyTo !== prev?.id ? this.lines.find((l) => l.id === cue.replyTo) : undefined;
    this.lines.push(...lines);
    this.step++;
    m.lastSpoke = this.step;
    m.cutoff = undefined;
    if (plan.inner) m.inner = plan.inner;
    const toUser = cue.to === 'user' || this.lines.find((l) => l.id === cue.replyTo)?.speaker === 'user';
    if (this.mentioned.has(m.id) || toUser) this.userWaiting = false;
    this.mentioned.delete(m.id);
    this.silence = 0;
    for (const x of this.minds.values()) { cool(x, this.kit.moods); this.showMind(x); }
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

  /** 照导演的安排记账：情绪（限速）、说话状态、态度、打算、好恶、全场走到哪 */
  private apply(cue: Cue, speaker: Mind | null) {
    const touched = new Set<Mind>();
    for (const [id, delta] of Object.entries(cue.mood)) {
      const m = this.minds.get(id);
      if (!m) continue;
      const before = { ...m.mood };
      const raw: Record<string, number> = {};
      for (const [k, v] of Object.entries(delta)) raw[k] = clamp(v, -STEP_MOOD, STEP_MOOD);
      feel(m, raw, this.kit.moods);
      for (const d of this.kit.moods) m.mood[d.key] = clamp(m.mood[d.key], before[d.key] - STEP_MOOD_MAX, before[d.key] + STEP_MOOD_MAX);
      touched.add(m);
    }
    const set = (map: Record<string, string>, field: 'style' | 'stance' | 'plan') => {
      for (const [id, v] of Object.entries(map)) {
        const m = this.minds.get(id);
        if (m && v !== undefined) { m[field] = v; touched.add(m); }
      }
    };
    set(cue.style, 'style');
    set(cue.stance, 'stance');
    set(cue.plan, 'plan');
    for (const [id, map] of Object.entries(cue.toward)) {
      const m = this.minds.get(id);
      if (!m) continue;
      for (const [other, d] of Object.entries(map)) if (other !== id) like(m, other, d);
      touched.add(m);
    }
    for (const m of touched) { this.showMind(m); if (m !== speaker && this.speaking?.m !== m) this.rest(m); }
    // 导演的安排只在幕后：界面上只看得到话题换了
    if (cue.topic && this.step - this.roundStep >= 6) this.newRound('换话题 · ' + cue.topic);
    if (cue.arc) this.arc = cue.arc;
    if (cue.arcNote) this.arcNote = cue.arcNote;
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
      const raw: Record<string, number> = {};
      for (const [k, v] of Object.entries(sp.mood)) raw[k] = clamp(v, -STEP_MOOD, STEP_MOOD);
      feel(m, raw, this.kit.moods);
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
    const next = obj(j.next);
    const speakerId = this.idOf(next.speaker);
    const speaker = speakerId && speakerId !== 'user' ? speakerId : '';
    const to = this.idOf(next.to) ?? '';
    const replyTo = str(next.reply_to, 12);
    return {
      speaker,
      to: to === speaker ? '' : to,
      gist: str(next.gist, 80),
      emotion: str(next.emotion, 20),
      replyTo: this.lines.some((l) => l.id === replyTo) ? replyTo : undefined,
      interrupt: next.interrupt === true || next.interrupt === 'true',
      cutAfter: str(next.cut_after, 20),
      mood: byName(j.mood, (x) => {
        const d: Record<string, number> = {};
        for (const k of this.kit.moods) d[k.key] = int(obj(x)[k.key], -STEP_MOOD, STEP_MOOD);
        return d;
      }),
      style: byName(j.style, (x) => (typeof x === 'string' ? x.trim().slice(0, 40) : undefined)),
      stance: byName(j.stance, (x) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 60) : undefined)),
      plan: byName(j.plan, (x) => (typeof x === 'string' ? x.trim().slice(0, 40) : undefined)),
      toward: byName(j.toward, (x) => {
        const d: Record<string, number> = {};
        for (const [name, v] of Object.entries(obj(x))) { const id = this.idOf(name); if (id) d[id] = int(v, -2, 2); }
        return d;
      }),
      react: (Array.isArray(j.react) ? j.react : [])
        .map((r) => ({ id: this.idOf(obj(r).who) ?? '', text: this.clean(str(obj(r).text, 12)) }))
        .filter((r) => r.id && r.id !== 'user' && r.id !== speaker && r.text)
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
    const sp: Speech = { say, inner: str(j.inner, 60), privateReply: this.clean(str(j.private_reply, 120), m), plan: str(j.plan, 40), mood };
    return whisper ? (sp.privateReply ? sp : null) : (say.length ? sp : null);
  }

  /** 去掉引号和“名字：”前缀 */
  private clean(s: string, m?: Mind) {
    let t = s.trim().replace(/^["“”'「」]+|["“”'「」]+$/g, '');
    if (m) t = t.replace(new RegExp('^' + escapeRe(m.name) + '\\s*[:：]\\s*'), '');
    return t.slice(0, 80).trim();
  }

  // ---------- 给模型看的材料 ----------

  private transcriptText() {
    const recent = this.lines.slice(-60);
    if (!recent.length) return '（还没人说话）';
    let prev = '';
    return recent.map((l) => {
      if (l.kind === 'react') return `（${l.name} 小声：${l.text}）`;
      const to = l.replyTo && l.replyTo !== prev ? `（回 ${l.replyTo}）` : '';
      const how = l.interrupt ? '（插嘴）' : '';
      const cut = l.cutBy ? `（话没说完，被${l.cutBy}打断）` : '';
      prev = l.id;
      return `[${l.id}] ${l.name}${to}${how}：${l.text}${cut}`;
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
    return `全场现在：${this.arc}。你上一步的打算：${this.arcNote || '（还没有）'}`;
  }

  private nowText() {
    const out: string[] = [];
    if (this.step <= 1) out.push('刚开聊，用户开了个头。排第一句；可以顺手给每个人定下对话题的初始态度（stance）和说话状态。');
    const last = this.lastFloor();
    if (last) {
      const who = last.speaker === 'user' ? '用户' : last.name;
      const talking = this.speaking && this.speaking.lines.includes(last);
      out.push(`最新一句是 [${last.id}] ${who}说的${talking ? '（他话还没说完；要安排人插嘴就写 interrupt 和 cut_after）' : ''}。`);
    }
    const recent = this.events.filter((e) => e.step >= this.step - 3).map((e) => '- ' + e.text);
    if (recent.length) out.push('刚发生的事：\n' + recent.join('\n'));
    if (this.userWaiting) {
      const named = [...this.mentioned].map((id) => this.nameOf(id));
      out.push('用户的话还没人接，这一步得有人接他' + (named.length ? `，他点名了${named.join('、')}，让被点名的人先接。` : '。'));
    }
    const quiet = [...this.minds.values()]
      .filter((x) => (x.lastSpoke < 0 ? this.step >= 6 : this.step - x.lastSpoke >= 6))
      .map((x) => x.name);
    if (quiet.length) out.push('一直没怎么吭声的：' + quiet.join('、') + '。');
    if (this.budget - this.step <= 5) out.push('聊了挺久了，快到尾声，可以往收尾走；差不多了就 end=true。');
    out.push('角色实际说出口的可能和你给的大意不一样，以记录为准，据此调整。');
    return out.join('\n');
  }

  /** 导演给演员的这一步提示 */
  private cueText(m: Mind, cue: Cue) {
    const out = ['导演给你这一句的提示（只有你看得到）：'];
    if (cue.to) out.push('- 冲' + this.nameOf(cue.to) + '说');
    if (cue.gist) out.push('- 大意：' + cue.gist);
    if (cue.emotion) out.push('- 你此刻的情绪：' + cue.emotion);
    const style = cue.style[m.id] ?? m.style;
    if (style) out.push('- 你的说话状态：' + style);
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
 * debug 只给命令行调参用（看导演每一步怎么排），界面上不显示导演。
 */
export function createLiveEngine(kit: LiveKit, chatFn: ChatFn = browserChat, debug?: (cue: Cue, speaker: string) => void): DiscussionEngine {
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
