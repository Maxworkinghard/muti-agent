import type { ChatMessage, DiscussionEngine, EngineEvent, SessionConfig } from '../../types';
import { chat, isAbort } from '../../llm/client';
import { cool, createMind, feel, heat, like, type Mind } from './mind';
import { plan as planTurn, summarize, whisper } from './director';
import {
  addUserLine, apply, bump, lastStage, mentionsIn, message, note, own, raise, reactText, rest, showMind, status,
} from './state';
import { CPS, FPS, MAX_CUT_WAIT, STYLE_TTL, Signal, clamp, clip, uid } from './util';
import {
  readLiveOptions, readReactions,
  type ChatFn, type Cue, type DebugEvent, type Line, type LiveKit, type LiveOptions, type Speech,
} from './types';

/** 准备好的下一句：导演的安排 + 角色自己说出来的话和自己报的心思（没人说就是冷场） */
export interface Plan { cue: Cue; m: Mind | null; say: string[]; inner: string; speech?: Speech }

/** 正在准备的下一句；ver 对不上（期间有人说话、你插话、私聊改了谁的心思）就作废重来 */
export interface Pending { ver: number; ctrl: AbortController; promise: Promise<Plan>; cue?: Cue; plan?: Plan }

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
 *
 * 模块分工：常量和杂项在 util.ts；事件发射和记账在 state.ts；给模型看的材料在 prompts.ts；
 * 模型调用、轮流、解析、私聊、总结在 director.ts；这里只留房间状态、主循环和发言的显示执行。
 */
export class LiveRoom {
  opts: LiveOptions;
  minds = new Map<string, Mind>();
  nameToId = new Map<string, string>();
  lines: Line[] = [];
  lineNo = 0;
  /** 第几次发言（用户说话也算，一次连发几条算一次） */
  step = 0;
  /** 版本：记录或谁的心思一变就加一，准备到一半的下一句作废 */
  ver = 0;
  pending: Pending | null = null;
  speaking: Speaking | null = null;
  /** 最近发生的事（给导演看）：你说了什么、私聊了谁、冷场…… */
  events: Array<{ step: number; text: string }> = [];
  arc = '开聊';
  arcNote = '';
  round = 1;
  roundLabel = '开聊';
  /** 分步的模式（kit.stages）：现在在第几步、这一步从第几次发言开始 */
  stage = 0;
  stageStep = 0;
  /** 分步的模式没走完就冷场了：大家在等你开口，你说话（或点继续）之前谁也不说 */
  idle = false;
  silence = 0;
  mentioned = new Set<string>();
  /** 你说的话还没人接 */
  userWaiting = false;
  /** 正在说的时候你开口了：这一条说完就停 */
  userSpoke = false;
  lastInterrupt = -10;
  budget: number;
  paused = false;
  stopped = false;
  finished = false;
  /** 出错停着，等你点重试或者再开口 */
  hold = false;
  retried = false;
  whispering = new Set<string>();
  nextWhisper = new Map<string, string>();
  lastWhisper = new Map<string, string>();
  whisperCtrl = new AbortController();
  summaryCtrl = new AbortController();
  shownStatus = new Map<string, string>();
  signal = new Signal();
  angerKey: string | undefined;
  roundStep = 0;

  constructor(
    readonly kit: LiveKit,
    readonly chatFn: ChatFn,
    readonly cfg: SessionConfig,
    readonly emit: (e: EngineEvent) => void,
    readonly debug?: (e: DebugEvent) => void,
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
    for (const m of this.minds.values()) { showMind(this, m); rest(this, m); }
    // 前端已经把你的第一句话显示出来了，这里只记进记录
    const opening = this.cfg.theme.brief?.trim() || this.cfg.theme.title.trim() || '随便聊聊';
    addUserLine(this, opening, false, mentionsIn(this, opening));
    this.stageStep = this.step;
    void this.loop();
  }

  userMessage(text: string, target?: string) {
    if (this.stopped) return;
    const clean = text.trim();
    if (!clean) return;
    const m = target ? this.minds.get(target) : undefined;
    if (m) return whisper(this, m, clean);
    if (this.finished) this.reopen();
    // 出错停着的话，你再开口就当作继续
    if (this.hold) { this.hold = false; this.pending = null; }
    addUserLine(this, clean, true, mentionsIn(this, clean));
  }

  /** 暂停只听按钮：正在说的人说完这一条就停，之后谁也不开口，直到点继续 */
  pause() {
    if (this.stopped || this.finished || this.paused) return;
    this.paused = true;
    for (const m of this.minds.values()) if (this.speaking?.m !== m) rest(this, m);
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
        raise(this, e);
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
      if (this.step >= this.budget || (plan.cue.end && this.step >= 8 && lastStage(this))) this.end();
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
    for (const m of this.minds.values()) if (this.speaking?.m !== m && !this.whispering.has(m.id)) rest(this, m);
    const ctrl = new AbortController();
    const p: Pending = { ver: this.ver, ctrl, promise: Promise.resolve(null as unknown as Plan) };
    p.promise = planTurn(this, ctrl.signal, p).then(
      (plan) => { p.plan = plan; this.signal.notify(); return plan; },
      (e) => { this.signal.notify(); throw e; },
    );
    p.promise.catch(() => {});
    this.pending = p;
  }

  /** 导演安排冷场：等一会儿再排；连着两次没人说就散。分步的模式还没走到最后一步时不散，停下来等你开口 */
  private async quiet(cue: Cue) {
    apply(this, cue, null);
    this.silence++;
    if (!lastStage(this)) {
      this.idle = true;
      for (const m of this.minds.values()) status(this, m, 'idle', '等你开口');
      return;
    }
    for (const m of this.minds.values()) rest(this, m);
    if (this.silence >= 2) return this.end();
    if (!(await this.nap(2200))) return;
    note(this, '冷场了：好一会儿没人说话');
    bump(this);
  }

  /** 旁人顺口的小反应，在这句开口前冒出来；说什么从这个人自己会的小反应里挑 */
  private murmur(cue: Cue) {
    const ver = this.ver;
    cue.react.slice(0, 2).forEach(({ id, kind, text: raw }, i) => {
      const m = this.minds.get(id);
      const text = m ? reactText(m, kind, raw) : '';
      if (!m || !text) return;
      const post = () => {
        if (this.ver !== ver || this.paused || this.stopped || this.finished) return;
        const line: Line = { id: 'm' + ++this.lineNo, msgId: uid('r'), speaker: m.id, name: m.name, text, kind: 'react' };
        this.lines.push(line);
        message(this, { id: line.msgId, speakerId: m.id, text, kind: 'react' });
        status(this, m, 'speaking', '小声');
        this.sleep(900).then(() => { if (this.speaking?.m !== m && !this.stopped) rest(this, m); });
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
    apply(this, cue, m, plan.speech?.mood);
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
    own(this, m, plan.speech);
    const toUser = cue.to === 'user' || this.lines.find((l) => l.id === cue.replyTo)?.speaker === 'user';
    if (this.mentioned.has(m.id) || toUser) this.userWaiting = false;
    this.mentioned.delete(m.id);
    this.silence = 0;
    for (const x of this.minds.values()) {
      cool(x, this.kit.moods);
      if (x.style && this.step - x.styleAt >= STYLE_TTL) x.style = '';
      showMind(this, x);
    }
    const sp: Speaking = { m, lines, at: 0, cut: false };
    this.speaking = sp;
    this.userSpoke = false;
    bump(this);
    this.prepare();
    status(this, m, 'speaking', interrupting ? '插嘴' : '说话');
    for (let i = 0; i < lines.length; i++) {
      sp.at = i;
      const quote = i === 0 && quoted ? { name: quoted.name, text: clip(quoted.text, 24) } : undefined;
      const res = await this.display(sp, i, quote, i === 0 && interrupting);
      if (res.end === 'cut') {
        const by = this.pending!.plan!.m!;
        const line = lines[i];
        const unsaid = [line.text.slice(res.shown), ...lines.slice(i + 1).map((l) => l.text)].join(' ').trim();
        line.text = line.text.slice(0, res.shown) + '——';
        line.cutBy = by.name;
        this.drop(lines.slice(i + 1));
        this.emit({ type: 'message_update', id: line.msgId, text: line.text, cut: true });
        m.cutoff = { by: by.name, rest: unsaid };
        if (this.angerKey) feel(m, { [this.angerKey]: 1.5 }, this.kit.moods);
        like(m, by.id, -1.5);
        showMind(this, m);
        this.lastInterrupt = this.step;
        break;
      }
      if (res.end !== 'done') {
        // 暂停了、你开口了：这一条说完就停，后面没说出口的不算数，下一句重新排
        if (i + 1 < lines.length) { this.drop(lines.slice(i + 1)); bump(this); }
        break;
      }
      if (i + 1 < lines.length) await this.sleep(350 + Math.random() * 400);
    }
    this.speaking = null;
    rest(this, m);
  }

  private async display(sp: Speaking, index: number, quote: ChatMessage['quote'], interrupt: boolean) {
    const line = sp.lines[index];
    const m = sp.m;
    message(this, { id: line.msgId, speakerId: m.id, text: '', kind: 'speech', quote, tag: interrupt ? '插嘴' : undefined });
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
    for (const m of this.minds.values()) rest(this, m);
    void summarize(this);
  }

  /** 散场后你又开口：接着聊一阵 */
  private reopen() {
    this.finished = false;
    this.silence = 0;
    this.budget = this.step + Math.max(12, Math.round(this.opts.maxMessages / 2));
    this.emit({ type: 'session', state: 'running' });
  }

  // ---------- 小工具 ----------

  lastFloor() {
    for (let i = this.lines.length - 1; i >= 0; i--) if (this.lines[i].kind !== 'react') return this.lines[i];
    return undefined;
  }

  lastUserLine() {
    for (let i = this.lines.length - 1; i >= 0; i--) if (this.lines[i].speaker === 'user') return this.lines[i];
    return undefined;
  }

  private drop(lines: Line[]) {
    if (!lines.length) return;
    const ids = new Set(lines.map((l) => l.id));
    this.lines = this.lines.filter((l) => !ids.has(l.id));
  }

  nameOf(id: string) {
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
