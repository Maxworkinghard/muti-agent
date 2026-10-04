import type { AgentState, ChatMessage, EngineEvent, ModeDef, ModeId, Participant, SessionConfig, TaskEvent } from '../src/types.ts';
import { modeById, roundLabel } from '../src/data/modes.ts';
import { sceneById } from '../src/data/scenes.ts';
import { LlmAgent, LlmTurnError } from './llmAgent.ts';
import { RECORDER_PROMPT, SIDE_NAME, TITLER_PROMPT, agentSystemPrompt, cleanTitle, clip, extractJson, toResult } from './prompts.ts';
import type { LlmConfig } from './config.ts';
import { Presence, runWorkFlow, type Doing } from './work.ts';

type Listener = (e: EngineEvent, index: number) => void;

/** 讨论类模式每一轮的发言要点，和 modes.ts 里的 roundLabels 一一对应 */
const TALK_GUIDE: Partial<Record<ModeId, string[]>> = {
  entertainment: ['轻松开场，抛出你的第一个想法', '接上别人的想法继续发挥', '选出你最喜欢的一个想法并说理由'],
  emotion: ['先回应这件事里最重要的情绪或问题', '区分事实、感受、解释和还不知道的部分', '给出一到三个现在就能做的下一步'],
};
/** 辩论三个阶段的发言要点：第 1 轮立论，最后一轮总结，中间几轮都是交锋（轮数由选人页的赛制决定：快辩 3 轮、标准 4 轮） */
const DEBATE_GUIDE = ['陈述你方立场和主要论据', '针对对方的论点提出质询或反驳', '做总结陈词'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rotate = <T>(items: T[], offset: number): T[] => items.length
  ? [...items.slice(offset % items.length), ...items.slice(0, offset % items.length)] : [];
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
let seq = 0;
const uid = (p: string) => p + '-' + Date.now().toString(36) + '-' + (seq++).toString(36);

/**
 * 一场会话：每位成员一个 LlmAgent（直接调模型接口，各自保留对话历史），按模式的轮次让他们依次发言，事件推给前端。
 * 每次发言前，把这位成员还没看过的新发言（含用户插话）连同本轮指令一起发给他。
 */
export class RoundtableSession {
  readonly events: EngineEvent[] = [];
  private listeners = new Set<Listener>();
  protected agents = new Map<string, LlmAgent>();
  private recorder: LlmAgent | null = null;
  private titler: LlmAgent | null = null;
  private transcript: ChatMessage[] = [];
  /** 私聊记录：agentId -> 只有他和用户知道的对话；不进 transcript，也不进总结 */
  private whispers = new Map<string, ChatMessage[]>();
  private seen = new Map<string, number>();
  /** 每位成员已经收到过的私聊条数：和 seen 一样只发新增的，LlmAgent 的历史里已经有的不再重复 */
  private whisperSeen = new Map<string, number>();
  /** 用户插话队列：私聊记下这条消息在对应记录里的结束位置，逐条回应 */
  private userQueue: Array<{ target?: string; whisperEnd?: number }> = [];
  /** 用户对全体说的第一句话：这一场要处理的问题或任务，主题只作背景 */
  protected request = '';
  /** 用户填的主题；没填时按第一句话生成 */
  private theme: string;
  private wake: (() => void) | null = null;
  private state: 'running' | 'finished' | 'stopped' = 'running';
  /** 用户点了暂停：下一位发言前停住，期间用户的话照常回应 */
  private paused = false;
  /** 台上的时钟不走暂停的那段：这次暂停从什么时候开始、之前一共停了多久 */
  private pausedAt = 0;
  private pausedTotal = 0;
  /** 暂停时停在 gate 里的人；工作模式里同时有好几个人在等 */
  private pauseWaiters: Array<() => void> = [];
  private clockWaiters = new Set<() => void>();
  /** 每位成员正在进行的一次回答：同一个人的请求排队，一次只答一件事（工作模式里大家并行，可能同时找上同一个人） */
  private turns = new Map<string, Promise<void>>();
  /** 工作模式：谁在干什么、说完话气泡停多久，由它统一管 */
  private presence: Presence | null = null;
  /** 讨论结束后用户继续追问时，正在回应中 */
  private followingUp = false;
  protected round = 0;
  private speaking: Participant | null = null;
  private failures = 0;
  private clients = 0;
  private orphanTimer: NodeJS.Timeout | null = null;
  private readonly mode: ModeDef;

  constructor(readonly id: string, protected cfg: SessionConfig, protected llm: LlmConfig) {
    this.mode = modeById(cfg.mode);
    this.theme = cfg.theme.title.trim();
  }

  /** 只有停止（用户退出、页面断开）才算彻底结束；讨论正常结束后仍然可以追问 */
  get ended() { return this.state === 'stopped'; }
  private get finished() { return this.state === 'finished'; }

  /** 订阅事件；after 之后的历史事件先补发（SSE 断线重连用） */
  subscribe(fn: Listener, after = -1) {
    this.events.forEach((e, i) => { if (i > after) fn(e, i); });
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** 前端全部断开一分钟还没回来，就结束会话，免得模型请求一直跑 */
  attach() {
    this.clients++;
    if (this.orphanTimer) { clearTimeout(this.orphanTimer); this.orphanTimer = null; }
  }
  detach() {
    if (--this.clients > 0 || this.ended) return;
    this.orphanTimer = setTimeout(() => this.stop(), 60_000);
  }

  async run() {
    this.emit({ type: 'session', state: 'running' });
    try {
      this.seatAgents();
      await this.awaitOpening();
      if (this.ended) return;
      if (this.cfg.mode === 'product') await this.runWork();
      else if (this.cfg.mode === 'rational') await this.runDebate();
      else await this.runTalk();
      await this.drainUser();
      await this.gate();
      if (this.ended) return;
      await this.summarize();
      if (this.ended) return;
      this.cfg.participants.forEach((p) => (this.presence ? this.presence.set(p, 'done', '完成') : this.status(p, 'done', '完成')));
      this.finish('finished');
      // 总结期间用户发的话，结束后接着回答
      if (this.userQueue.length) void this.followUp();
    } catch (e) {
      if (!this.ended) { this.notice('会话中断：' + errMsg(e)); this.finish('stopped'); }
    } finally {
      if (this.ended) this.dispose();
    }
  }

  /** 对全体说的第一句话开始这一场；之后的话和私聊都排队，在下一位发言前回应；讨论结束后发的话直接回应 */
  userMessage(text: string, targetAgentId?: string) {
    if (this.ended) return;
    const target = targetAgentId && this.byId(targetAgentId) ? targetAgentId : undefined;
    const opening = !target && !this.request;
    if (opening) {
      this.request = text;
      if (!this.theme) void this.nameTheme(text);
    }
    if (target) {
      // 点成员 = 私聊：只有他看到，不写进公开记录，也不占公开发言位
      this.message({ round: this.round, speakerId: 'user', text, kind: 'user', targetId: target, private: true }, target);
    } else {
      this.message({ round: opening ? 1 : this.round, speakerId: 'user', text, kind: 'user' });
    }
    if (!opening) this.userQueue.push({ target, whisperEnd: target ? this.whispers.get(target)?.length : undefined });
    this.wake?.();
    this.wakePaused();
    if (this.finished) void this.followUp();
  }

  pause() {
    if (this.ended || this.finished || this.paused) return;
    this.paused = true;
    this.pausedAt = Date.now();
    this.presence?.pause(true);
    this.wakeClock();
    this.emit({ type: 'session', state: 'paused' });
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.pausedTotal += Date.now() - this.pausedAt;
    this.presence?.pause(false);
    if (!this.ended && !this.finished) this.emit({ type: 'session', state: 'running' });
    this.wakePaused();
  }

  stop() {
    if (this.ended) return;
    this.finish('stopped');
    this.paused = false;
    this.wake?.();
    this.wakePaused();
    this.dispose();
  }

  /** 讨论结束后的追问：点名的人回答，没点名由负责人 / 主持人 / 第一位回答 */
  private async followUp() {
    if (this.followingUp) return;
    this.followingUp = true;
    try {
      await this.drainUser();
    } catch (e) {
      if (!this.ended) this.notice('回答追问失败：' + errMsg(e));
    } finally {
      this.followingUp = false;
      if (this.speaking && !this.ended) { this.status(this.speaking, 'done', '完成'); this.speaking = null; }
    }
  }

  /** 暂停时停在这里；这期间用户的话照常回应 */
  private async gate() {
    while (this.paused && !this.ended) {
      if (this.userQueue.length) { await this.drainUser(); continue; }
      await new Promise<void>((resolve) => { this.pauseWaiters.push(resolve); });
    }
  }

  /** 叫醒停在 gate 里的每一个人（继续、停止、用户说话时） */
  private wakePaused() {
    this.pauseWaiters.splice(0).forEach((resolve) => resolve());
  }

  private wakeClock() {
    for (const wake of this.clockWaiters) wake();
    this.clockWaiters.clear();
  }

  /** 走动和气泡等待不跨过暂停；停止时无需等计时器跑完 */
  private async wait(ms: number) {
    let remaining = ms;
    while (!this.ended) {
      await this.gate();
      if (this.ended || remaining <= 0) return;
      const since = Date.now();
      await new Promise<void>((resolve) => {
        const wake = () => { clearTimeout(timer); this.clockWaiters.delete(wake); resolve(); };
        const timer = setTimeout(wake, remaining);
        this.clockWaiters.add(wake);
      });
      remaining -= Date.now() - since;
    }
  }

  /** 没填主题：另起一个角色按用户第一句话起名，不耽误大家开工；起不出来就截取原话 */
  private async nameTheme(text: string) {
    let title = '';
    this.titler = new LlmAgent('起名', this.llm, TITLER_PROMPT);
    try {
      title = cleanTitle(await this.titler.ask(`用户的第一句话：「${text}」\n给这场对话起一个主题。`));
    } catch { /* 用下面的兜底 */ }
    this.titler = null;
    if (this.ended) return;
    this.theme = title || clip(text.replace(/\s+/g, ' ').trim(), 16);
    this.emit({ type: 'theme', title: this.theme });
  }

  /**
   * 这一场要处理的事：前端在用户说出第一句话后才开会话，这句话在 theme.brief 里（前端已经显示过，这里只记进记录，不再回显）；
   * 直接调接口没带 brief 时，进房间后等用户对全体开口
   */
  protected async awaitOpening() {
    const brief = this.cfg.theme.brief?.trim();
    if (!brief) return this.waitForTask();
    this.request = brief;
    this.transcript.push({ id: uid('m'), round: 0, speakerId: 'user', text: brief, kind: 'user', at: Date.now() });
    if (!this.theme) void this.nameTheme(brief);
  }

  /** 进房间后不自动开始，等用户对全体开口；这期间单独点名的话照常回应 */
  private async waitForTask() {
    this.emit({ type: 'round', round: 0, label: '等你开口' });
    while (!this.request && !this.ended) {
      if (this.userQueue.length) { await this.drainUser(); continue; }
      await new Promise<void>((resolve) => { this.wake = resolve; });
      this.wake = null;
    }
  }

  // ---------- 三种流程 ----------

  /** 讨论类（情感交流等）：每轮轮换起头的人，让相同阵容也能从不同角度开始 */
  private async runTalk() {
    const guide = TALK_GUIDE[this.cfg.mode];
    const variation = this.variation();
    for (let r = 1; r <= this.cfg.maxRounds && !this.ended; r++) {
      this.beginRound(r);
      const topic = r === 1 ? '用户刚才说的就是这场要聊的事。' : '';
      for (const p of rotate(this.cfg.participants, variation + r - 1)) {
        await this.drainUser();
        await this.speak(p, `第 ${r} 轮「${this.label(r)}」：${topic}${guide?.[r - 1] ?? '围绕用户说的发言'}。请发言，不超过 120 字。`);
      }
    }
  }

  /** 理性讨论：主持人开场和收尾，正反方交替发言；没分阵营的人按普通成员发言 */
  private async runDebate() {
    const ps = this.cfg.participants;
    const host = ps.find((p) => p.side === 'host');
    const pro = ps.filter((p) => p.side === 'pro');
    const con = ps.filter((p) => p.side === 'con');
    const order: Participant[] = [];
    const sides = this.variation() % 2 ? [con, pro] : [pro, con];
    for (let i = 0; i < Math.max(pro.length, con.length); i++) {
      for (const side of sides) if (side[i]) order.push(side[i]);
    }
    order.push(...ps.filter((p) => !p.side));
    const last = this.cfg.maxRounds;
    const cap = this.maxChars(150);
    for (let r = 1; r <= last && !this.ended; r++) {
      this.beginRound(r);
      if (host && r === 1) {
        await this.drainUser();
        await this.speak(host, `第 1 轮「${this.label(1)}」：你是主持人。辩题以用户刚才说的为准${this.theme ? `（用户只是让大家开始的话，就用主题「${this.theme}」）` : ''}，宣布辩题和发言规则（本场共 ${last} 轮，每人每次不超过 ${cap} 字；本场由${sides[0] === pro ? '正方' : '反方'}先发言），请双方陈述，不超过 ${Math.min(cap, 100)} 字。`);
      }
      // 中间轮数可能不止一轮交锋，后面几轮要接着对方最新的说法往下走
      const phase = r <= 1 ? 0 : r >= last ? 2 : 1;
      const guide = phase === 1 && r > 2 ? DEBATE_GUIDE[1] + '，抓住对方最新的说法，别重复你已经说过的' : DEBATE_GUIDE[phase];
      for (const p of order) {
        await this.drainUser();
        const side = p.side ? `你是${SIDE_NAME[p.side]}，` : '';
        await this.speak(p, `第 ${r} 轮「${this.label(r)}」：${side}${guide}，不超过 ${cap} 字。`);
      }
      if (host && r === last) {
        await this.drainUser();
        await this.speak(host, `第 ${r} 轮「${this.label(r)}」：作为主持人收尾，点出双方真正的分歧、已有的共识和还要验证的问题，只挑最关键的，不超过 ${cap} 字。`);
      }
    }
  }

  /** 工作 · 创造项目：像真实公司那样立项派活 → 分头干活、当面讨论 → 互相评审 → 对齐后定稿交付（流程在 work.ts） */
  private async runWork() {
    const ps = this.cfg.participants;
    const lead = ps.find((p) => p.isLead) ?? ps[0];
    const opts = this.cfg.engineOptions ?? {};
    const pace = Number(opts.pace ?? 1);
    const parallel = Math.trunc(Number(opts.parallel ?? 4));
    this.presence = new Presence((p, d) => this.status(p, d.state, d.action), () => (Number.isFinite(pace) && pace >= 0 ? pace : 1));
    await runWorkFlow({
      lead,
      members: rotate(ps.filter((p) => p !== lead), this.variation()),
      request: this.request,
      pace: Number.isFinite(pace) && pace >= 0 ? pace : 1,
      parallel: parallel >= 1 ? Math.min(parallel, 8) : 4,
      presence: this.presence,
      ended: () => this.ended,
      beginRound: (r) => this.beginRound(r),
      label: (r) => this.label(r),
      drainUser: () => this.drainUser(),
      scene: sceneById(this.cfg.sceneId),
      gate: () => this.gate(),
      wait: (ms) => this.wait(ms),
      clock: () => Date.now() - this.pausedTotal - (this.paused ? Date.now() - this.pausedAt : 0),
      think: (p, instruction, doing) => this.think(p, instruction, { doing }),
      say: (p, text, meta) => { if (!this.ended) this.say(p, text, 'speech', meta?.to?.agentId, false, meta?.tag, meta?.doc); },
      note: (p, text, to) => { if (!this.ended) this.message({ round: this.round, speakerId: p.agentId, text, kind: 'task', targetId: to?.agentId }); },
      task: (t) => { if (!this.ended) this.task(t); },
      move: (p, to) => { if (!this.ended) this.emit({ type: 'move', agentId: p.agentId, to: typeof to === 'string' ? to : to.agentId }); },
    });
  }

  /** 由单独的记录员角色把全程整理成共识 / 分歧 / 待验证 / 建议 / 交付物 */
  private async summarize() {
    const work = this.cfg.mode === 'product';
    this.recorder = new LlmAgent('记录员', this.llm, RECORDER_PROMPT);
    const log = this.transcript.filter((m) => m.kind !== 'system' && m.kind !== 'notice').map((m) => this.format(m)).join('\n');
    try {
      const text = await this.recorder.ask(
        `下面是「${this.mode.name}」模式的完整记录，用户提出的问题或任务是「${this.request}」${this.theme ? `（主题「${this.theme}」）` : ''}。\n\n${log}\n\n` +
        '请整理结果，只输出一个 JSON 代码块：\n```json\n{"consensus":[],"disagreements":[],"openQuestions":[],"suggestions":[],"deliverables":[]}\n```\n' +
        `每项 1~4 条，每条不超过 40 字。${work ? 'deliverables 按「名字：产出」列出每位成员的交付。' : 'deliverables 留空数组。'}`);
      await this.gate();
      if (!this.ended) this.emit({ type: 'result', result: toResult(extractJson(text)?.json, text, work) });
    } catch (e) {
      if (!this.ended) this.notice('整理结论失败：' + errMsg(e));
    }
  }

  // ---------- 发言 ----------

  /** 每位成员一个角色，人格提示词作为 system 消息 */
  private seatAgents() {
    for (const p of this.cfg.participants) {
      this.agents.set(p.agentId, new LlmAgent(p.persona.name, this.llm, agentSystemPrompt(p, this.cfg, this.mode)));
      this.status(p, 'idle', '就座');
    }
  }

  /**
   * 这位成员还没收到过的私聊（点成员说话才有）；其他成员的提示词里拿不到。
   * 之前的私聊和他自己的私下回复都已经在他的对话历史里，这里只补用户新说的，不整段重发
   */
  private whisperText(agentId: string, from: number, to: number) {
    const news = (this.whispers.get(agentId) ?? []).slice(from, to).filter((m) => m.speakerId !== agentId);
    if (!news.length) return '';
    return '【只有你和用户知道的私下对话】\n'
      + '（其他角色看不到这些内容，也不知道你们聊过；要不要在公开讨论里提起、用它跟别人周旋，由你自己决定。）\n'
      + news.map((m) => '用户：' + m.text).join('\n');
  }

  /**
   * 把新发言和本轮指令发给这位成员，拿回他的回答（不发到前端）。
   * 同一个人的请求排队：上一件答完、记下他看过哪些发言，再开始下一件。
   * doing：想的这段时间显示成什么（工作模式里写方案显示成「工作」）；不给就是「思考」。
   */
  private async think(p: Participant, instruction: string, opts: { forUser?: boolean; whisper?: boolean; whisperEnd?: number; doing?: Doing } = {}): Promise<string | null> {
    const { forUser = false, whisper = false, whisperEnd, doing } = opts;
    if (!forUser) await this.gate();
    if (this.ended) return null;
    const prev = this.turns.get(p.agentId);
    let done!: () => void;
    const turn = new Promise<void>((r) => { done = r; });
    const queued = (prev ?? Promise.resolve()).then(() => turn);
    this.turns.set(p.agentId, queued);
    await prev;
    let text: string | null = null;
    const defer = !forUser && this.paused;
    try {
      if (this.ended) return null;
      if (!defer) text = await this.ask(p, instruction, whisper, whisperEnd, doing ?? { state: 'thinking', action: whisper ? '想怎么私下回你…' : forUser ? '准备回应用户' : '思考中…' });
    } finally {
      done();
      if (this.turns.get(p.agentId) === queued) this.turns.delete(p.agentId);
    }
    // 先释放人物的请求队列，再等恢复：暂停时用户仍可私聊这个人。
    if (!forUser) await this.gate();
    if (this.ended) return null;
    return defer ? this.think(p, instruction, opts) : text;
  }

  private async ask(p: Participant, instruction: string, whisper: boolean, whisperEnd: number | undefined, doing: Doing): Promise<string | null> {
    const agent = this.agents.get(p.agentId)!;
    const from = this.seen.get(p.agentId) ?? 0;
    const news = this.transcript.slice(from)
      .filter((m) => m.speakerId !== p.agentId && m.kind !== 'system' && m.kind !== 'notice')
      .map((m) => this.format(m));
    const mark = this.transcript.length;
    const whisperMark = whisperEnd ?? this.whispers.get(p.agentId)?.length ?? 0;
    const priv = this.whisperText(p.agentId, this.whisperSeen.get(p.agentId) ?? 0, whisperMark);
    const prompt = (news.length ? `【新发言】\n${news.join('\n')}\n\n` : '') + (priv ? priv + '\n\n' : '') + instruction;
    if (this.presence) this.presence.busy(p, doing); else this.status(p, doing.state, doing.action);
    let failed = false;
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          const text = await agent.ask(prompt);
          this.failures = 0;
          this.seen.set(p.agentId, mark);
          this.whisperSeen.set(p.agentId, whisperMark);
          return this.ended ? null : text || '（没有说话）';
        } catch (e) {
          if (this.ended) return null;
          const fatal = e instanceof LlmTurnError && e.fatal;
          if (!fatal && attempt === 1) {
            await sleep(3000);
            // 等的这 3 秒里用户可能已经停止了会话，别再发新请求
            if (this.ended) return null;
            continue;
          }
          failed = true;
          this.presence?.free(p);
          this.status(p, 'idle', '调用失败');
          this.notice(`${p.persona.name} 调用模型失败：${errMsg(e)}`);
          if (fatal || ++this.failures >= 3) throw new Error('模型调用连续失败，已停止');
          return null;
        }
      }
    } finally {
      // 失败时上面已经放开并显示了「调用失败」，这里不再盖掉
      if (this.presence && !failed && !this.ended) this.presence.free(p);
    }
  }

  private async speak(p: Participant, instruction: string, opts: { forUser?: boolean; whisper?: boolean; whisperEnd?: number } = {}): Promise<string | null> {
    const text = await this.think(p, instruction, opts);
    if (text !== null) this.say(p, text, opts.forUser ? 'reply' : 'speech', opts.forUser ? 'user' : undefined, opts.whisper);
    return text;
  }

  /** 用户插话排在下一位发言之前：点名的成员私下回应（私聊），否则由负责人 / 主持人 / 第一位回应 */
  private async drainUser() {
    while (this.userQueue.length && !this.ended) {
      const item = this.userQueue.shift();
      const target = item?.target;
      const whisper = !!target;
      const ps = this.cfg.participants;
      const p = (target && this.byId(target)) || ps.find((x) => x.isLead) || ps.find((x) => x.side === 'host') || ps[0];
      const instruction = whisper
        ? `用户刚在私下对你说了话（见上面的私下对话）。请私下回应用户，一句话说清就行，不超过 ${this.maxChars(300)} 字。`
        : `用户对全体说了话（见上面的新发言）。请直接回应用户：问得简单就一两句话，复杂再展开，不超过 ${this.maxChars(300)} 字。`;
      await this.speak(p, instruction, { forUser: true, whisper, whisperEnd: item?.whisperEnd });
    }
  }

  // ---------- 事件 ----------

  /** tag：这句话在流程里的作用（工作模式的评审、第二版……），显示在记录里 */
  private say(p: Participant, text: string, kind: ChatMessage['kind'] = 'speech', targetId?: string, whisper = false, tag?: string, doc?: boolean) {
    const action = whisper ? '私下回应用户' : kind === 'reply' ? '回应用户' : tag ?? '发言中';
    if (this.presence) {
      // 工作模式里好几个人同时在说，不把上一位说话的人改成倾听；说完由 presence 放回他手上的事
      this.message({ round: this.round, speakerId: p.agentId, text, kind, targetId, tag, doc: doc || undefined, private: whisper || undefined },
        whisper ? p.agentId : undefined);
      this.presence.spoke(p, action, text);
      return;
    }
    if (this.speaking && this.speaking !== p) this.status(this.speaking, 'idle', '倾听');
    this.status(p, 'speaking', action);
    this.message({ round: this.round, speakerId: p.agentId, text, kind, targetId, tag, doc: doc || undefined, private: whisper || undefined },
      whisper ? p.agentId : undefined);
    this.speaking = p;
  }

  protected beginRound(r: number) {
    if (this.ended) return;
    this.round = r;
    const label = this.label(r);
    this.emit({ type: 'round', round: r, label });
    this.message({ round: r, speakerId: 'system', text: `第 ${r} 轮 · ${label}`, kind: 'system' });
  }

  /** 轮次名：辩论的轮数可调，多出来的中间轮都叫交锋质询 */
  protected label(r: number) { return roundLabel(this.cfg.mode, r, this.cfg.maxRounds); }

  private variation() {
    const n = this.cfg.conversationVariation?.speakerIndex;
    return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0;
  }

  /** 选人页设了每次发言的字数上限（engineOptions.maxChars）就用它，没设用各处原来的默认值 */
  private maxChars(fallback: number) { return Math.trunc(Number(this.cfg.engineOptions?.maxChars)) || fallback; }

  private format(m: ChatMessage) {
    // 公开记录里只有用户对全体说的话，点成员的私聊在 whispers 里，由 whisperText 单独拼
    if (m.speakerId === 'user') return `用户对全体说：${m.text}`;
    const who = this.byId(m.speakerId)?.persona.name ?? m.speakerId;
    if (m.kind === 'task') return `（${who} ${m.text}）`;
    // 工作模式里当面跟同事说的话：标上对谁说、在干什么，大家才分得清是谁和谁在谈
    const to = m.targetId && m.targetId !== 'user' ? this.byId(m.targetId)?.persona.name : undefined;
    return to ? `${who}（对${to}说${m.tag ? '，' + m.tag : ''}）：${m.text}` : `${who}${m.tag ? `（${m.tag}）` : ''}：${m.text}`;
  }

  protected byId(id: string) { return this.cfg.participants.find((p) => p.agentId === id); }

  protected message(m: Omit<ChatMessage, 'id' | 'at'>, whisperTo?: string) {
    const msg = { ...m, id: uid('m'), at: Date.now() };
    if (whisperTo) {
      // 私聊消息只进这个成员的私聊记录：不进 transcript，别人看不到、总结里也没有
      const list = this.whispers.get(whisperTo) ?? [];
      list.push(msg);
      this.whispers.set(whisperTo, list);
    } else {
      this.transcript.push(msg);
    }
    this.emit({ type: 'message', message: msg });
  }

  protected notice(text: string) {
    this.emit({ type: 'message', message: { id: uid('n'), round: this.round, speakerId: 'system', text, kind: 'notice', at: Date.now() } });
  }

  protected status(p: Participant, state: AgentState, action: string) {
    if (this.ended) return;
    this.emit({ type: 'status', agentId: p.agentId, state, action });
  }

  private task(t: Omit<TaskEvent, 'id'>) {
    this.emit({ type: 'task', task: { ...t, id: uid('t') } });
  }

  protected emit(e: EngineEvent) {
    const i = this.events.push(e) - 1;
    for (const fn of this.listeners) fn(e, i);
  }

  protected finish(state: 'finished' | 'stopped') {
    if (this.ended || (this.finished && state === 'finished')) return;
    this.state = state;
    this.emit({ type: 'session', state });
    if (state === 'stopped') {
      this.paused = false;
      this.wake?.();
      this.wakePaused();
      this.wakeClock();
    }
  }

  protected dispose() {
    this.presence?.dispose();
    for (const a of this.agents.values()) a.abort();
    this.recorder?.abort();
    this.titler?.abort();
    clearTimeout(this.orphanTimer ?? undefined);
  }
}
