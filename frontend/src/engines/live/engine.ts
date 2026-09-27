import type { AgentState, ChatMessage, DiscussionEngine, EngineEvent, SessionConfig } from '../../types';
import { chat, isAbort } from '../../llm/client';
import { extractJson } from './json';
import { cool, createMind, feel, heat, like, moodLabel, moodWords, relationWord, view, type Mind } from './mind';
import { readLiveOptions, type ChatFn, type Line, type LiveKit, type LiveOptions, type Reaction } from './types';

let seq = 0;
const uid = (p: string) => p + '-' + Date.now().toString(36) + '-' + (seq++).toString(36);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 有人想完了、但还有人没想完时，最多再等多久（模型慢的人不能拖住全场） */
const WAIT_SOME = 6_000;
/** 一个人都没想完时最多等多久，再久按出错处理 */
const WAIT_ALL = 60_000;
/** 说话时每秒刷新几次 */
const FPS = 12;
/** 说话速度：每秒几个字（再乘嘴快和上头程度） */
const CPS = 9;

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

/** 一个人对某一轮的反应：正在想 / 想完了 / 出错 / 这轮不用想（刚说完话的人不对自己的话起反应） */
interface Job {
  tick: number;
  state: 'running' | 'done' | 'failed' | 'skip';
  ctrl?: AbortController;
  r?: Reaction;
  err?: unknown;
  /** 这是在回应用户的私聊 */
  whisper?: string;
}

/** 候选的发言：u 是算上性情和处境后的开口冲动，wait 是多久能开口（毫秒，未乘节奏倍数） */
interface Pick { m: Mind; r: Reaction; u: number; wait: number; crossed?: boolean; interrupt?: boolean }

/**
 * 一次发言。话一想好就写进记录，大家从这一刻开始“听”（各自起反应），
 * 同时他在组织语言、再一个字一个字说出来；所以说到一半就可能被人插嘴。
 * 还没开口就被打住（用户说话了、暂停了），这段话就收回，下次再说。
 */
interface Turn {
  pick: Pick;
  lines: Line[];
  tick: number;
  quoted?: Line;
  /** 已经开始说了 */
  live: boolean;
  /** 正在说第几条 */
  at: number;
  /** 收回时要恢复的状态 */
  undo: { step: number; lastSpoke: number; lastSpeaker: string; mentioned: boolean; userWaiting: boolean };
}

/** 有人要插嘴：说到第 line 条的第 pos 个字时打断（pos 为 -1 表示说到四成左右） */
interface Cut { tick: number; pick: Pick; line: number; pos: number }

/**
 * 活人群聊的底盘：没有轮次，也不指定谁说话。
 * 每出一段话，所有人各自并行“听”一遍（每人一次模型调用，用自己完整的人设），给出情绪变化、心里话、想不想说、想说什么；
 * 谁最憋不住、谁先组织好语言谁先说；两个人几乎同时开口就会抢话；对方还没说完、自己憋不住的可以插嘴；
 * 谁都不想说就冷场，冷场两次就散。情绪的账由代码记（见 mind.ts）。
 * 模式相关的部分（在乎哪些情绪、性情、提示词、总结）由 LiveKit 提供。
 */
class LiveRoom {
  private opts: LiveOptions;
  private minds = new Map<string, Mind>();
  private jobs = new Map<string, Job>();
  /** 私聊回应还没说完时又收到的私聊，说完接着回 */
  private nextWhisper = new Map<string, string>();
  private lastWhisper = new Map<string, string>();
  private nameToId = new Map<string, string>();
  private lines: Line[] = [];
  private lineNo = 0;
  /** 第几次发言（用户说话也算，一次连发几条算一次） */
  private step = 0;
  /** 反应轮次：有人说话、冷场后重想都换一轮，旧的反应作废 */
  private tick = 0;
  private tickAt = 0;
  private lastSpeaker = '';
  /** 冷场后大家重想的这一轮，刚说完话的人也要想 */
  private quietRound = false;
  private note = '';
  private silence = 0;
  /** 用户点了名、还没回他的人 */
  private mentioned = new Set<string>();
  /** 用户刚说完，还没人接 */
  private userWaiting = false;
  private round = 1;
  private roundSince = 0;
  private budget: number;
  private paused = false;
  private stopped = false;
  private finished = false;
  /** 出错停着，等用户点重试或者再开口 */
  private hold = false;
  /** 正在进行的发言（想好了还没说、或者正在说） */
  private turn: Turn | null = null;
  private cut: Cut | null = null;
  private lastInterrupt = -10;
  /** 头上冒泡、想说话的人 */
  private wanting = new Set<string>();
  private shownStatus = new Map<string, string>();
  private signal = new Signal();
  private summaryCtrl = new AbortController();
  private angerKey: string | undefined;

  constructor(
    private kit: LiveKit,
    private chatFn: ChatFn,
    private cfg: SessionConfig,
    private emit: (e: EngineEvent) => void,
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
    this.emit({ type: 'round', round: this.round, label: '开聊' });
    for (const m of this.minds.values()) { this.showMind(m); this.rest(m); }
    // 前端已经把用户的第一句话显示出来了，这里只记进记录
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
    // 你开口了，大家接着聊；出错停着的也当作继续，不然后面说的话永远没人回
    if (this.paused) { this.paused = false; this.emit({ type: 'session', state: 'running' }); }
    this.hold = false;
    this.addUserLine(clean, true, this.mentionsIn(clean));
  }

  pause() {
    if (this.stopped || this.finished || this.paused) return;
    this.paused = true;
    this.wanting.clear();
    for (const m of this.minds.values()) if (!this.isSpeaking(m)) this.rest(m);
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
    for (const j of this.jobs.values()) j.ctrl?.abort();
    this.summaryCtrl.abort();
    this.signal.notify();
    if (!this.finished) this.emit({ type: 'session', state: 'stopped' });
  }

  // ---------- 主循环 ----------

  private async loop() {
    while (!this.stopped) {
      if (this.paused || this.finished || this.hold) { await this.signal.wait(); continue; }
      this.think();
      const tick = this.tick;
      if (!this.ready(tick)) { await this.signal.wait(this.patience()); continue; }
      if (this.nobodyAnswered(tick)) { this.raise(tick); continue; }
      const picks = this.pick(tick);
      if (!picks.length) { await this.quiet(tick); continue; }
      this.want();
      const murmurs = this.murmurs(tick, picks[0]);
      const turn = this.commit(picks[0]);
      this.murmur(murmurs, turn, picks[0].wait);
      if (!(await this.nap(picks[0].wait, turn.tick))) { this.retract(turn); continue; }
      await this.talk(turn, picks[1]);
      if (this.step >= this.budget && !this.stopped) this.end();
    }
  }

  /** 这一轮还没开始想的人，开始想；上一轮没想完的作废 */
  private think() {
    if (this.stopped) return;
    for (const m of this.minds.values()) {
      const j = this.jobs.get(m.id);
      if (j && j.tick === this.tick) continue;
      // 正在回你私聊的人先回完，回完再补这一轮
      if (j?.state === 'running' && j.whisper !== undefined) continue;
      j?.ctrl?.abort();
      if (m.id === this.lastSpeaker && !this.quietRound) this.jobs.set(m.id, { tick: this.tick, state: 'skip' });
      else void this.react(m, this.tick);
    }
  }

  private ready(tick: number) {
    let running = 0;
    let done = 0;
    for (const m of this.minds.values()) {
      const j = this.jobs.get(m.id);
      if (!j || j.tick !== tick || j.state === 'running') running++;
      else if (j.state === 'done') done++;
    }
    if (!running) return true;
    const waited = Date.now() - this.tickAt;
    return (done > 0 && waited >= WAIT_SOME) || waited >= WAIT_ALL;
  }

  private patience() {
    const waited = Date.now() - this.tickAt;
    return Math.max(50, (waited < WAIT_SOME ? WAIT_SOME : WAIT_ALL) - waited);
  }

  private nobodyAnswered(tick: number) {
    let done = 0;
    let failed = 0;
    for (const m of this.minds.values()) {
      const j = this.jobs.get(m.id);
      if (j?.tick !== tick || j.state === 'running' || j.state === 'failed') failed++;
      else if (j.state === 'done') done++;
    }
    return !done && failed > 0;
  }

  /** 所有人都没反应过来（模型连不上之类）：停下来等用户点重试 */
  private raise(tick: number) {
    this.hold = true;
    this.wanting.clear();
    let err: unknown;
    for (const m of this.minds.values()) {
      const j = this.jobs.get(m.id);
      if (j?.tick === tick && j.err) err = j.err;
    }
    this.emit({
      type: 'error', id: uid('err'),
      message: '大家都没反应过来：' + (err ? errMsg(err) : '模型太久没有回应'),
      retry: () => {
        if (this.stopped) return;
        this.hold = false;
        for (const [id, j] of this.jobs) {
          if (j.state === 'running' || j.state === 'failed') { j.ctrl?.abort(); this.jobs.delete(id); }
        }
        this.tickAt = Date.now();
        this.signal.notify();
      },
    });
  }

  /**
   * 谁先开口：想说的人里，按开口冲动（模型给的 urge + 话痨 + 被点名 + 刚说过就收一收 + 憋久了）过门槛，
   * 再按“多久能张嘴”排：越想说、越上头反应越快，要说的话越长组织得越久，嘴快的人快。
   * 第二个人几乎同时准备好、又很想说，就一起开口（抢话）。
   */
  private pick(tick: number): Pick[] {
    const all: Pick[] = [];
    for (const m of this.minds.values()) {
      const j = this.jobs.get(m.id);
      const r = j?.tick === tick && j.state === 'done' ? j.r : undefined;
      if (!r?.say.length) continue;
      const since = m.lastSpoke < 0 ? Infinity : this.step - m.lastSpoke;
      let u = r.urge + (m.t.talk - 0.5) * 2 + (Math.random() - 0.5) * 1.6;
      if (this.mentioned.has(m.id)) u += 3;
      if (since <= 1) u -= 2;
      if (since >= 6) u += 1;
      all.push({ m, r, u, wait: 0 });
    }
    const picked = all.filter((x) => x.u >= 5.2 - x.m.t.talk * 1.6 || this.mentioned.has(x.m.id));
    // 用户说的话不能没人接：没人够格就让最想说的那个开口
    if (!picked.length && this.userWaiting && all.length) picked.push(all.reduce((a, b) => (b.u > a.u ? b : a)));
    const named = picked.some((x) => this.mentioned.has(x.m.id));
    for (const x of picked) {
      const think = (400 + 2400 * clamp(1 - x.u / 10, 0, 1)) * (1 - 0.35 * heat(x.m, this.kit.moods));
      const compose = Math.min(3000, 60 * x.r.say.join('').length);
      x.wait = (think + compose) / x.m.t.speed + Math.random() * 500;
      // 被你点名的人先回你，别人稍微让一让
      if (named) x.wait = this.mentioned.has(x.m.id) ? Math.min(x.wait, 700) : x.wait + 600;
    }
    picked.sort((a, b) => a.wait - b.wait);
    this.wanting = new Set(picked.map((x) => x.m.id));
    const [a, b] = picked;
    return b && b.wait - a.wait < 900 && b.u >= 7.5 ? [a, b] : picked.slice(0, 1);
  }

  /** 冷场：等一会儿，让大家再想一轮（刚说完的人也想）；连着两次没人接就散 */
  private async quiet(tick: number) {
    this.silence++;
    this.wanting.clear();
    this.want();
    if (this.silence >= 2) return this.end();
    if (!(await this.nap(2200, tick))) return;
    this.note = '冷场了：已经好一会儿没人说话。';
    this.quietRound = true;
    this.newTick();
  }

  /** 顺口的小反应（“哈哈哈”“？”）：不抢话。要在记下新发言之前收集，之后这一轮的反应就被换掉了 */
  private murmurs(tick: number, first: Pick) {
    const out: Array<{ m: Mind; text: string }> = [];
    for (const m of this.minds.values()) {
      const j = this.jobs.get(m.id);
      if (m === first.m || j?.tick !== tick || j.state !== 'done' || !j.r?.react || this.wanting.has(m.id)) continue;
      out.push({ m, text: j.r.react });
    }
    return out.sort(() => Math.random() - 0.5).slice(0, 2);
  }

  /** 小反应在下一个人开口前冒出来；记录里排在这段发言前面 */
  private murmur(list: Array<{ m: Mind; text: string }>, turn: Turn, wait: number) {
    for (const { m, text } of list) {
      const post = () => {
        if (this.tick !== turn.tick || this.stopped || this.paused || this.finished) return;
        const line: Line = { id: 'm' + ++this.lineNo, msgId: uid('r'), speaker: m.id, name: m.name, text, kind: 'react' };
        const at = turn.live ? -1 : this.lines.indexOf(turn.lines[0]);
        if (at >= 0) this.lines.splice(at, 0, line); else this.lines.push(line);
        this.message({ id: line.msgId, speakerId: m.id, text, kind: 'react' });
        this.status(m, 'speaking', '小声');
        this.sleep(900).then(() => { if (!this.isSpeaking(m) && !this.stopped) this.rest(m); });
      };
      if (this.opts.pace === 0) post();
      else setTimeout(post, (0.15 + Math.random() * 0.45) * wait * this.opts.pace);
    }
  }

  /** 想好了要说：写进记录，大家从这一刻开始听 */
  private commit(pk: Pick): Turn {
    const { m, r } = pk;
    const prev = this.lastFloor();
    const lines: Line[] = r.say.slice(0, 3).map((text, i) => ({
      id: 'm' + ++this.lineNo, msgId: uid('m'), speaker: m.id, name: m.name, text, kind: 'say',
      replyTo: i === 0 ? r.replyTo : undefined, interrupt: i === 0 && pk.interrupt,
    }));
    const quoted = r.replyTo && r.replyTo !== prev?.id ? this.lines.find((l) => l.id === r.replyTo) : undefined;
    const undo = {
      step: this.step, lastSpoke: m.lastSpoke, lastSpeaker: this.lastSpeaker,
      mentioned: this.mentioned.has(m.id), userWaiting: this.userWaiting,
    };
    this.lines.push(...lines);
    m.lastSpoke = this.step + 1;
    this.mentioned.delete(m.id);
    this.userWaiting = false;
    this.spoke(m.id);
    const turn: Turn = { pick: pk, lines, tick: this.tick, quoted, live: false, at: 0, undo };
    this.turn = turn;
    this.think();
    return turn;
  }

  /** 还没开口就被打住了：这段话收回（他想说的还记着，下次可以再说） */
  private retract(t: Turn) {
    if (this.turn === t) this.turn = null;
    if (this.cut?.tick === t.tick) this.cut = null;
    this.drop(t.lines);
    const m = t.pick.m;
    m.lastSpoke = t.undo.lastSpoke;
    // 期间没有别人说话（比如暂停了）：恢复原样，大家按没听到这段话重想
    if (this.lastSpeaker === m.id) {
      this.step = t.undo.step;
      this.lastSpeaker = t.undo.lastSpeaker;
      this.userWaiting = t.undo.userWaiting;
      if (t.undo.mentioned) this.mentioned.add(m.id);
      this.newTick();
    }
  }

  /** 说话：插嘴的人接着说；抢话的第二个人紧跟着说 */
  private async talk(first: Turn, cross?: Pick) {
    let turn: Turn | undefined = first;
    while (turn && !this.stopped) {
      const cutBy = await this.utter(turn);
      if (cutBy) { turn = this.commit(cutBy); cross = undefined; continue; }
      const clean = this.tick === turn.tick && !this.paused && !this.hold && !this.finished;
      turn = undefined;
      // 抢话：两个人几乎同时开口，第二个人没听到第一个人的话就说出来了
      if (cross && clean) { turn = this.commit({ ...cross, crossed: true }); cross = undefined; }
    }
  }

  /** 一个字一个字说出来：一到三条短消息；中途有人插嘴就停在那里 */
  private async utter(turn: Turn): Promise<Pick | undefined> {
    const { pick: pk, lines } = turn;
    const { m, r } = pk;
    if (r.topic && this.step - this.roundSince >= 6) this.newRound('换话题 · ' + r.topic);
    m.unsaid = undefined;
    m.cutoff = undefined;
    turn.live = true;
    this.wanting.delete(m.id);
    this.status(m, 'speaking', pk.interrupt ? '插嘴' : pk.crossed ? '抢着说' : '说话');
    let cutBy: Pick | undefined;
    for (let i = 0; i < lines.length; i++) {
      turn.at = i;
      const quote = i === 0 && turn.quoted ? { name: turn.quoted.name, text: clip(turn.quoted.text, 24) } : undefined;
      const res = await this.display(m, lines[i], i, quote, i === 0 && !!pk.interrupt, turn.tick);
      if (res.end === 'cut' && this.cut) {
        const by = this.cut.pick;
        const line = lines[i];
        const rest = [line.text.slice(res.shown), ...lines.slice(i + 1).map((l) => l.text)].join(' ').trim();
        line.text = line.text.slice(0, res.shown) + '——';
        line.cutBy = by.m.name;
        this.drop(lines.slice(i + 1));
        this.emit({ type: 'message_update', id: line.msgId, text: line.text, cut: true });
        m.cutoff = { by: by.m.name, rest };
        if (this.angerKey) feel(m, { [this.angerKey]: 1.5 }, this.kit.moods);
        like(m, by.m.id, -1.5);
        this.showMind(m);
        this.lastInterrupt = this.step;
        cutBy = { ...by, interrupt: true, wait: 0 };
        break;
      }
      if (res.end !== 'done') {
        // 暂停了、用户开口了：这一条说完就停，后面没说出口的不算数
        if (i + 1 < lines.length) { this.drop(lines.slice(i + 1)); this.newTick(); }
        break;
      }
      if (i + 1 < lines.length) await this.sleep(350 + Math.random() * 400);
    }
    if (this.cut?.tick === turn.tick) this.cut = null;
    if (this.turn === turn) this.turn = null;
    this.rest(m);
    return cutBy;
  }

  private async display(m: Mind, line: Line, index: number, quote: ChatMessage['quote'], interrupt: boolean, tick: number) {
    this.message({ id: line.msgId, speakerId: m.id, text: '', kind: 'speech', quote, tag: interrupt ? '插嘴' : undefined });
    const full = line.text;
    const cps = CPS * m.t.speed * (1 + 0.4 * heat(m, this.kit.moods));
    const step = Math.max(1, Math.round(cps / FPS));
    let shown = 0;
    while (shown < full.length) {
      if (this.stopped) return { end: 'stop' as const, shown };
      if (this.cutHere(tick, index, shown, full.length)) return { end: 'cut' as const, shown };
      shown = Math.min(full.length, shown + step);
      this.emit({ type: 'message_update', id: line.msgId, text: full.slice(0, shown) });
      await this.sleep(1000 / FPS);
    }
    if (this.stopped) return { end: 'stop' as const, shown };
    if (this.paused || this.tick !== tick) return { end: 'yield' as const, shown };
    return { end: 'done' as const, shown };
  }

  /** 该不该在这里被打断：说到对方忍不住的那几个字；快说完了就不打断了 */
  private cutHere(tick: number, index: number, shown: number, len: number) {
    const c = this.cut;
    if (!c || c.tick !== tick || len - shown < 2 || c.line > index) return false;
    if (c.line < index) return shown >= 1;
    return c.pos >= 0 ? shown >= c.pos : shown >= Math.max(2, Math.floor(len * 0.4));
  }

  /** 对方还在说（或者正要说），这个人憋不住了：够上头、够想说、性子够急，就插嘴 */
  private considerInterrupt(m: Mind, r: Reaction, tick: number) {
    const t = this.turn;
    if (!r.interrupt || !r.say.length || !t || t.tick !== tick || t.pick.m === m || this.cut || this.paused) return;
    if (this.step - this.lastInterrupt < 3) return;
    const anger = this.angerKey ? m.mood[this.angerKey] : 0;
    const score = r.urge + anger / 4 + (m.t.temper - 1) * 2 + (m.t.talk - 0.5) * 2;
    if (score < 9) return;
    // 听到哪几个字就忍不住了：找得到就停在那里，找不到就在正说的这条说到四成左右时插进来
    let line = t.live ? t.at : 0;
    let pos = -1;
    if (r.cutAfter) {
      for (let i = 0; i < t.lines.length; i++) {
        const k = t.lines[i].text.indexOf(r.cutAfter);
        if (k >= 0) { line = i; pos = k + r.cutAfter.length; break; }
      }
    }
    this.cut = { tick, pick: { m, r, u: 10, wait: 0 }, line, pos };
  }

  /** 散场：写总结的同时，用户随时可以再开口接着聊 */
  private end() {
    if (this.finished || this.stopped) return;
    this.finished = true;
    this.wanting.clear();
    for (const m of this.minds.values()) this.rest(m);
    void this.summarize();
  }

  private async summarize() {
    const at = this.step;
    try {
      const text = await this.chatFn(this.kit.summaryMessages(this.cfg, this.logText()), {
        temperature: this.opts.summaryTemperature, signal: this.summaryCtrl.signal,
      });
      // 总结期间用户又开口了，接着聊，这份总结不要了
      if (this.stopped || !this.finished || this.step !== at) return;
      this.emit({ type: 'result', result: this.kit.parseSummary(text) });
      this.emit({ type: 'session', state: 'finished' });
    } catch (e) {
      if (this.stopped || isAbort(e) || !this.finished) return;
      this.emit({ type: 'session', state: 'finished' });
      this.emit({ type: 'error', id: uid('err'), message: '整理这场聊天时出错：' + errMsg(e), retry: () => void this.summarize() });
    }
  }

  /** 散场后用户又开口：接着聊一阵 */
  private reopen() {
    this.finished = false;
    this.silence = 0;
    this.budget = this.step + Math.max(12, Math.round(this.opts.maxMessages / 2));
    this.emit({ type: 'session', state: 'running' });
  }

  // ---------- 反应 ----------

  /** 一个人听完最新的话之后的内心反应（私聊时是听完你的悄悄话） */
  private async react(m: Mind, tick: number, whisper?: string) {
    const ctrl = new AbortController();
    const job: Job = { tick, state: 'running', ctrl, whisper };
    this.jobs.set(m.id, job);
    if (whisper !== undefined && !this.isSpeaking(m)) this.status(m, 'thinking', '想怎么回你…');
    try {
      const messages = this.kit.reactionMessages({
        self: m.p, cfg: this.cfg, temper: m.t, transcript: this.transcriptText(), privates: this.privateText(m),
        state: this.stateText(m), now: this.nowText(m, whisper),
      });
      let r: Reaction | null = null;
      for (let attempt = 0; attempt < 2 && !r; attempt++) {
        r = this.parse(await this.chatFn(messages, { temperature: this.opts.temperature, signal: ctrl.signal }), m);
      }
      if (this.jobs.get(m.id) !== job || this.stopped) return;
      if (!r) throw new Error(m.name + ' 两次都没按格式回答');
      job.r = r;
      job.state = 'done';
      this.absorb(m, r);
      if (whisper !== undefined) this.replyPrivately(m, r);
      // 想好了要说的人先冒个泡，不用等所有人都想完
      if (tick === this.tick && r.say.length && r.urge >= 6 && !this.paused && !this.finished && !this.isSpeaking(m)) {
        this.wanting.add(m.id);
        this.status(m, 'thinking', '想说话');
      }
      this.considerInterrupt(m, r, tick);
    } catch (e) {
      if (this.jobs.get(m.id) !== job || this.stopped || isAbort(e)) return;
      job.state = 'failed';
      job.err = e;
      if (whisper !== undefined) {
        this.emit({
          type: 'error', id: uid('err'), agentId: m.id, message: m.name + ' 没接住你的私聊：' + errMsg(e),
          retry: () => { if (!this.stopped) void this.react(m, this.tick, whisper); },
        });
      }
    } finally {
      if (this.jobs.get(m.id) === job && whisper !== undefined && !this.stopped) {
        if (!this.wanting.has(m.id) && !this.isSpeaking(m)) this.rest(m);
        const more = this.nextWhisper.get(m.id);
        if (more !== undefined) { this.nextWhisper.delete(m.id); void this.react(m, this.tick, more); }
      }
      this.signal.notify();
    }
  }

  /** 把反应记进账：情绪、好恶、态度、打算、没说出口的话 */
  private absorb(m: Mind, r: Reaction) {
    feel(m, r.mood, this.kit.moods);
    for (const [id, d] of Object.entries(r.toward)) if (id !== m.id) like(m, id, d);
    if (r.inner) m.inner = r.inner;
    if (r.stance) m.stance = r.stance;
    if (r.hooks.length) m.hooks = r.hooks;
    m.plan = r.plan;
    m.urge = r.urge;
    m.unsaid = r.say.length ? r.say.join(' ') : undefined;
    this.showMind(m);
    if (!this.wanting.has(m.id) && !this.isSpeaking(m)) this.rest(m);
  }

  private whisper(m: Mind, text: string) {
    this.message({ id: uid('u'), speakerId: 'user', text, kind: 'user', targetId: m.id, private: true });
    m.privates.push({ who: 'user', text });
    this.lastWhisper.set(m.id, text);
    this.showMind(m);
    const j = this.jobs.get(m.id);
    if (j?.state === 'running' && j.whisper !== undefined) { this.nextWhisper.set(m.id, text); return; }
    j?.ctrl?.abort();
    void this.react(m, this.tick, text);
  }

  private replyPrivately(m: Mind, r: Reaction) {
    const text = r.privateReply || '嗯。';
    m.privates.push({ who: 'self', text });
    this.message({ id: uid('w'), speakerId: m.id, text, kind: 'reply', targetId: 'user', private: true });
  }

  private parse(text: string, m: Mind): Reaction | null {
    const j = extractJson(text);
    if (!j) return null;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const int = (v: unknown, lo: number, hi: number) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? clamp(n, lo, hi) : 0;
    };
    const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    const mood: Record<string, number> = {};
    const rawMood = obj(j.mood);
    for (const d of this.kit.moods) mood[d.key] = int(rawMood[d.key], -3, 3);
    const toward: Record<string, number> = {};
    for (const [name, v] of Object.entries(obj(j.toward))) {
      const id = this.nameToId.get(name.replace(/^@/, '').trim());
      if (id && id !== m.id) toward[id] = int(v, -3, 3);
    }
    const rawSay = Array.isArray(j.say) ? j.say : typeof j.say === 'string' ? [j.say] : [];
    const say = rawSay.map((s) => this.cleanSay(String(s), m)).filter(Boolean).slice(0, 3);
    const replyTo = str(j.reply_to, 12);
    return {
      inner: str(j.inner, 60),
      mood,
      toward,
      stance: str(j.stance, 60),
      hooks: Array.isArray(j.hooks) ? j.hooks.map((h) => String(h).trim().slice(0, 60)).filter(Boolean).slice(0, 3) : [],
      plan: str(j.plan, 40),
      urge: int(j.urge, 0, 10),
      interrupt: j.interrupt === true || j.interrupt === 'true',
      cutAfter: str(j.cut_after, 20),
      replyTo: this.lines.some((l) => l.id === replyTo) ? replyTo : undefined,
      say,
      react: say.length ? '' : this.cleanSay(str(j.react, 16), m),
      topic: str(j.topic, 12),
      privateReply: this.cleanSay(str(j.private_reply, 120), m),
    };
  }

  /** 去掉引号和“名字：”前缀 */
  private cleanSay(s: string, m: Mind) {
    return s.trim()
      .replace(/^["“”'「」]+|["“”'「」]+$/g, '')
      .replace(new RegExp('^' + escapeRe(m.name) + '\\s*[:：]\\s*'), '')
      .slice(0, 80)
      .trim();
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

  private stateText(m: Mind) {
    const out = ['- 心情：' + moodWords(m, this.kit.moods)];
    const rel = Object.entries(m.rel)
      .filter(([, v]) => Math.abs(v) >= 2)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([id, v]) => {
        const w = relationWord(v);
        return `${this.nameOf(id)} ${v > 0 ? '+' : ''}${Math.round(v)}${w ? '（' + w + '）' : ''}`;
      });
    if (rel.length) out.push('- 对人：' + rel.join('；'));
    out.push('- 你对这个话题的态度：' + (m.stance || '还没想好'));
    if (m.hooks.length) out.push('- 你能拿出来说的私货：' + m.hooks.join('；'));
    if (m.plan) out.push('- 你正打算：' + m.plan);
    if (m.inner) out.push('- 你上一刻心里想：' + m.inner);
    if (m.unsaid) out.push('- 你刚才想说、还没说出口：「' + m.unsaid + '」（可以照说、改着说，或者算了）');
    if (m.cutoff) out.push(`- 你刚才的话被${m.cutoff.by}打断了，没说完的是：「${m.cutoff.rest}」`);
    const since = m.lastSpoke < 0 ? -1 : this.step - m.lastSpoke;
    out.push(since < 0 ? '- 你还没开过口' : since === 0 ? '- 最新那段是你说的' : since === 1 ? '- 你刚说过话' : `- 你已经 ${since} 次没开口了`);
    return out.join('\n');
  }

  private nowText(m: Mind, whisper?: string) {
    if (whisper !== undefined) {
      return [
        `用户刚私下对你说：「${whisper}」`,
        '这是只有你知道的悄悄话，别人看不到，也不知道你们聊过。按你的性格接住它：它可以改变你的情绪、对某人的看法、你的态度或者接下来的打算。'
        + '大多数时候你会顺着这个方向走，但要用你自己会用的方式，不会一下子翻脸；也绝不说出“是用户让我这么说的”。',
        'private_reply 写你私下回他的一句话（口语、很短）。say 写你接下来想公开说的话；不急着说就留空，之后再找机会。',
      ].join('\n');
    }
    const out: string[] = [];
    if (this.step <= 1) out.push('刚开聊，用户开了个头。先定下你对这个话题的态度（stance 必填）和一两个你能拿出来说的具体私货（hooks）。');
    const t = this.turn;
    const last = this.lastFloor();
    if (t && t.pick.m !== m && last && t.lines.includes(last)) {
      out.push(`${t.pick.m.name}刚开口，说的是 ${t.lines.map((l) => '[' + l.id + ']').join('')}：对方话还没说完，你是边听边想的；憋不住可以插嘴。`);
    } else if (last) {
      if (last.speaker === 'user') out.push(`用户刚说完 [${last.id}]。`);
      else if (last.speaker === m.id) out.push(`[${last.id}] 是你刚说的。`);
      else out.push(`${last.name}刚说完 [${last.id}]。`);
    }
    if (this.mentioned.has(m.id)) out.push('用户点名问你了，你还没回，得回应他。');
    if (this.note) out.push(this.note);
    if (this.budget - this.step <= 5) out.push('聊了挺久了，差不多该散了：想收尾的可以说句收尾的话，也可以接着说。');
    const quiet = [...this.minds.values()]
      .filter((x) => x !== m && (x.lastSpoke < 0 ? this.step >= 6 : this.step - x.lastSpoke >= 6))
      .map((x) => x.name);
    if (quiet.length) out.push('一直没怎么吭声的：' + quiet.join('、') + '。');
    out.push('照你此刻的真实反应填 JSON。不是每个人每次都要开口：没被戳到、跟你没关系、没什么新东西可说，urge 就给低，say 留空。');
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
    this.spoke('user');
    this.mentioned = targets;
    this.userWaiting = true;
  }

  /** 有人说了一段话：大家的情绪回落一点，换一轮反应 */
  private spoke(speaker: string) {
    this.step++;
    this.lastSpeaker = speaker;
    this.quietRound = false;
    this.silence = 0;
    this.note = '';
    for (const m of this.minds.values()) { cool(m, this.kit.moods); this.showMind(m); }
    this.newTick();
  }

  private newTick() {
    this.tick++;
    this.tickAt = Date.now();
    this.signal.notify();
  }

  private newRound(label: string) {
    this.round++;
    this.roundSince = this.step;
    this.emit({ type: 'round', round: this.round, label });
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

  private isSpeaking(m: Mind) {
    return !!this.turn?.live && this.turn.pick.m === m;
  }

  /** 等一会儿（乘节奏倍数）；中途换了一轮、暂停、出错、散场就提前返回 false */
  private async nap(ms: number, tick: number) {
    const end = Date.now() + ms * this.opts.pace;
    while (!this.stopped) {
      if (this.tick !== tick || this.paused || this.hold || this.finished) return false;
      const left = end - Date.now();
      if (left <= 0) return true;
      await this.signal.wait(left);
    }
    return false;
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms * this.opts.pace));
  }

  private want() {
    for (const m of this.minds.values()) {
      if (this.isSpeaking(m)) continue;
      if (this.wanting.has(m.id)) this.status(m, 'thinking', '想说话');
      else this.rest(m);
    }
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

/** 用某个模式的玩法（kit）造一个引擎；chatFn 默认走浏览器的 /api/llm/chat，命令行模拟时换成直连 */
export function createLiveEngine(kit: LiveKit, chatFn: ChatFn = browserChat): DiscussionEngine {
  let room: LiveRoom | null = null;
  return {
    start(config, emit) {
      room?.stop();
      room = new LiveRoom(kit, chatFn, config, emit);
      room.start();
    },
    sendUserMessage({ text, targetAgentId }) { room?.userMessage(text, targetAgentId); },
    pause() { room?.pause(); },
    resume() { room?.resume(); },
    stop() { room?.stop(); },
  };
}
