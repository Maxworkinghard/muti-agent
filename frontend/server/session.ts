import type { AgentState, ChatMessage, EngineEvent, ModeDef, ModeId, Participant, SessionConfig, TaskEvent } from '../src/types.ts';
import { modeById, roundLabel, trackById } from '../src/data/modes.ts';
import { LlmAgent, LlmTurnError } from './llmAgent.ts';
import { RECORDER_PROMPT, SIDE_NAME, TITLER_PROMPT, agentSystemPrompt, cleanTitle, clip, extractJson, toResult, whoIs } from './prompts.ts';
import type { LlmConfig } from './config.ts';

type Listener = (e: EngineEvent, index: number) => void;

/** 讨论类模式每一轮的发言要点，和 modes.ts 里的 roundLabels 一一对应 */
const TALK_GUIDE: Partial<Record<ModeId, string[]>> = {
  entertainment: ['轻松开场，抛出你的第一个想法', '接上别人的想法继续发挥', '选出你最喜欢的一个想法并说理由'],
  emotion: ['先回应这件事里最重要的情绪或问题', '区分事实、感受、解释和还不知道的部分', '给出一到三个现在就能做的下一步'],
};
/** 辩论三个阶段的发言要点：第 1 轮立论，最后一轮总结，中间几轮都是交锋（轮数在选人页调，2~6 轮） */
const DEBATE_GUIDE = ['陈述你方立场和主要论据', '针对对方的论点提出质询或反驳', '做总结陈词'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
  private seen = new Map<string, number>();
  private userQueue: Array<string | undefined> = [];
  /** 用户对全体说的第一句话：这一场要处理的问题或任务，主题只作背景 */
  protected request = '';
  /** 用户填的主题；没填时按第一句话生成 */
  private theme: string;
  private wake: (() => void) | null = null;
  private state: 'running' | 'finished' | 'stopped' = 'running';
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

  get ended() { return this.state !== 'running'; }

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
      await this.waitForTask();
      if (this.ended) return;
      if (this.mode.track === 'work') await this.runWork();
      else if (this.cfg.mode === 'rational') await this.runDebate();
      else await this.runTalk();
      await this.drainUser();
      if (this.ended) return;
      await this.summarize();
      this.cfg.participants.forEach((p) => this.status(p, 'done', '完成'));
      this.finish('finished');
    } catch (e) {
      if (!this.ended) { this.notice('会话中断：' + errMsg(e)); this.finish('stopped'); }
    } finally {
      this.dispose();
    }
  }

  /** 对全体说的第一句话开始这一场；之后的话和单独点名的话都排队，在下一位发言前回应 */
  userMessage(text: string, targetAgentId?: string) {
    if (this.ended) return;
    const target = targetAgentId && this.byId(targetAgentId) ? targetAgentId : undefined;
    const opening = !target && !this.request;
    if (opening) {
      this.request = text;
      if (!this.theme) void this.nameTheme(text);
    }
    this.message({ round: opening ? 1 : this.round, speakerId: 'user', text, kind: 'user', targetId: target });
    if (!opening) this.userQueue.push(target);
    this.wake?.();
  }

  stop() {
    if (this.ended) return;
    this.finish('stopped');
    this.wake?.();
    this.dispose();
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

  /** 进房间后不自动开始，等用户对全体开口；这期间单独点名的话照常回应 */
  protected async waitForTask() {
    this.emit({ type: 'round', round: 0, label: '等你开口' });
    while (!this.request && !this.ended) {
      if (this.userQueue.length) { await this.drainUser(); continue; }
      await new Promise<void>((resolve) => { this.wake = resolve; });
      this.wake = null;
    }
  }

  // ---------- 三种流程 ----------

  /** 讨论类（娱乐、情感交流等）：每轮所有人按座位顺序发言 */
  private async runTalk() {
    const guide = TALK_GUIDE[this.cfg.mode];
    for (let r = 1; r <= this.cfg.maxRounds && !this.ended; r++) {
      this.beginRound(r);
      const topic = r === 1 ? '用户刚才说的就是这场要聊的事。' : '';
      for (const p of this.cfg.participants) {
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
    for (let i = 0; i < Math.max(pro.length, con.length); i++) { if (pro[i]) order.push(pro[i]); if (con[i]) order.push(con[i]); }
    order.push(...ps.filter((p) => !p.side));
    const last = this.cfg.maxRounds;
    const cap = this.maxChars(150);
    for (let r = 1; r <= last && !this.ended; r++) {
      this.beginRound(r);
      if (host && r === 1) {
        await this.drainUser();
        await this.speak(host, `第 1 轮「${this.label(1)}」：你是主持人。辩题以用户刚才说的为准${this.theme ? `（用户只是让大家开始的话，就用主题「${this.theme}」）` : ''}，宣布辩题和发言规则（本场共 ${last} 轮，每人每次不超过 ${cap} 字），请双方陈述，不超过 ${Math.min(cap, 100)} 字。`);
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

  /** 工作 · 创造项目：负责人拆分派发 → 成员依次完成并交接 → 复核后负责人汇总 */
  private async runWork() {
    const ps = this.cfg.participants;
    const lead = ps.find((p) => p.isLead) ?? ps[0];
    const members = ps.filter((p) => p !== lead);
    const tasks = new Map<string, string>();

    this.beginRound(1);
    await this.drainUser();
    const roster = members.map((m, i) => `- m${i + 1}：${whoIs(m)}`).join('\n');
    const plan = await this.think(lead,
      `第 1 轮「${this.label(1)}」：你是负责人。用户的需求是「${this.request}」。请据此拆分工作，给下面每位成员各派一项具体任务，需求不清楚的地方写成合理假设：\n${roster}\n` +
      '先用一两句话说明拆分思路（不超过 100 字），再单独输出一个 JSON 代码块：\n```json\n{"assignments":[{"member":"m1","task":"不超过 30 字的任务"}]}\n```');
    if (this.ended) return;
    const parsed = plan ? extractJson(plan) : null;
    const assignments: any[] = Array.isArray(parsed?.json?.assignments) ? parsed!.json.assignments : [];
    members.forEach((m, i) => {
      const a = assignments.find((x) => x?.member === `m${i + 1}`) ?? assignments[i];
      tasks.set(m.agentId, clip(String(a?.task || `从「${m.persona.knowledge[0] ?? m.persona.name}」角度处理用户的需求`), 40));
    });
    this.say(lead, parsed?.rest || (plan && !parsed ? plan : '我来拆分这个需求：每人认领一块，文件统一经过中央交换台流转。'));
    for (const m of members) {
      if (this.ended) return;
      const t = tasks.get(m.agentId)!;
      this.task({ title: t, from: lead.agentId, to: m.agentId, status: 'assigned' });
      this.message({ round: 1, speakerId: lead.agentId, text: `→ 派给 ${m.persona.name}：${t}`, kind: 'task', targetId: m.agentId });
      this.status(m, 'working', '处理 ' + clip(t, 12));
      await sleep(600);
    }

    this.beginRound(2);
    for (const m of members) {
      await this.drainUser();
      if (this.ended) return;
      const out = await this.speak(m, `第 2 轮「${this.label(2)}」：负责人派给你的任务是「${tasks.get(m.agentId)}」。请完成你的部分，直接说你的结论和最关键的依据，不超过 200 字。`);
      const next = ps[(ps.indexOf(m) + 1) % ps.length];
      if (out !== null && next !== m && !this.ended) {
        this.task({ title: tasks.get(m.agentId)!, from: m.agentId, to: next.agentId, status: 'handoff' });
        await sleep(600);
      }
    }

    this.beginRound(3);
    for (const m of members) {
      await this.drainUser();
      await this.speak(m, `第 3 轮「${this.label(3)}」：结合其他人的产出复核你的部分，补充或修正一点，不超过 120 字。`);
    }
    await this.drainUser();
    await this.speak(lead, `第 3 轮「${this.label(3)}」：作为负责人给出最终交付结论，说清结论和关键取舍，不用把每个人的话再复述一遍，不超过 200 字。`);
    if (!this.ended) members.forEach((m) => this.task({ title: '交付物', from: m.agentId, to: lead.agentId, status: 'done' }));
  }

  /** 由单独的记录员角色把全程整理成共识 / 分歧 / 待验证 / 建议 / 交付物 */
  private async summarize() {
    const work = this.mode.track === 'work';
    this.recorder = new LlmAgent('记录员', this.llm, RECORDER_PROMPT);
    const log = this.transcript.filter((m) => m.kind !== 'system' && m.kind !== 'notice').map((m) => this.format(m)).join('\n');
    try {
      const text = await this.recorder.ask(
        `下面是「${this.mode.name}」模式的完整记录，用户提出的问题或任务是「${this.request}」${this.theme ? `（主题「${this.theme}」）` : ''}。\n\n${log}\n\n` +
        '请整理结果，只输出一个 JSON 代码块：\n```json\n{"consensus":[],"disagreements":[],"openQuestions":[],"suggestions":[],"deliverables":[]}\n```\n' +
        `每项 1~4 条，每条不超过 40 字。${work ? 'deliverables 按「名字：产出」列出每位成员的交付。' : 'deliverables 留空数组。'}`);
      if (!this.ended) this.emit({ type: 'result', result: toResult(extractJson(text)?.json, text, work) });
    } catch (e) {
      if (!this.ended) this.notice('整理结论失败：' + errMsg(e));
    }
  }

  // ---------- 发言 ----------

  /** 每位成员一个角色，人格提示词作为 system 消息 */
  private seatAgents() {
    const bench = trackById(this.mode.track).name;
    for (const p of this.cfg.participants) {
      this.agents.set(p.agentId, new LlmAgent(p.persona.name, this.llm, agentSystemPrompt(p, this.cfg, this.mode, bench)));
      this.status(p, 'idle', '就座');
    }
  }

  /** 把新发言和本轮指令发给这位成员，拿回他的回答（不发到前端） */
  private async think(p: Participant, instruction: string, forUser = false): Promise<string | null> {
    if (this.ended) return null;
    const agent = this.agents.get(p.agentId)!;
    const from = this.seen.get(p.agentId) ?? 0;
    const news = this.transcript.slice(from)
      .filter((m) => m.speakerId !== p.agentId && m.kind !== 'system' && m.kind !== 'notice')
      .map((m) => this.format(m));
    const mark = this.transcript.length;
    const prompt = (news.length ? `【新发言】\n${news.join('\n')}\n\n` : '') + instruction;
    this.status(p, 'thinking', forUser ? '准备回应用户' : '思考中…');
    for (let attempt = 1; ; attempt++) {
      try {
        const text = await agent.ask(prompt);
        this.failures = 0;
        this.seen.set(p.agentId, mark);
        return this.ended ? null : text || '（没有说话）';
      } catch (e) {
        if (this.ended) return null;
        const fatal = e instanceof LlmTurnError && e.fatal;
        if (!fatal && attempt === 1) { await sleep(3000); continue; }
        this.status(p, 'idle', '调用失败');
        this.notice(`${p.persona.name} 调用模型失败：${errMsg(e)}`);
        if (fatal || ++this.failures >= 3) throw new Error('模型调用连续失败，已停止');
        return null;
      }
    }
  }

  private async speak(p: Participant, instruction: string, forUser = false): Promise<string | null> {
    const text = await this.think(p, instruction, forUser);
    if (text !== null) this.say(p, text, forUser ? 'reply' : 'speech', forUser ? 'user' : undefined);
    return text;
  }

  /** 用户插话排在下一位发言之前：点名的成员回应，否则由负责人 / 主持人 / 第一位回应 */
  private async drainUser() {
    while (this.userQueue.length && !this.ended) {
      const target = this.userQueue.shift();
      const ps = this.cfg.participants;
      const p = (target && this.byId(target)) || ps.find((x) => x.isLead) || ps.find((x) => x.side === 'host') || ps[0];
      await this.speak(p, `用户${target ? '对你' : '对全体'}说了话（见上面的新发言）。请直接回应用户：问得简单就一两句话，复杂再展开，不超过 ${this.maxChars(300)} 字。`, true);
    }
  }

  // ---------- 事件 ----------

  private say(p: Participant, text: string, kind: ChatMessage['kind'] = 'speech', targetId?: string) {
    if (this.speaking && this.speaking !== p) this.status(this.speaking, 'idle', '倾听');
    this.status(p, 'speaking', kind === 'reply' ? '回应用户' : '发言中');
    this.message({ round: this.round, speakerId: p.agentId, text, kind, targetId });
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

  /** 选人页设了每次发言的字数上限（engineOptions.maxChars）就用它，没设用各处原来的默认值 */
  private maxChars(fallback: number) { return Math.trunc(Number(this.cfg.engineOptions?.maxChars)) || fallback; }

  private format(m: ChatMessage) {
    if (m.speakerId === 'user') return `用户${m.targetId ? '对' + this.byId(m.targetId)?.persona.name : '对全体'}说：${m.text}`;
    const who = this.byId(m.speakerId)?.persona.name ?? m.speakerId;
    return m.kind === 'task' ? `（${who} ${m.text}）` : `${who}：${m.text}`;
  }

  protected byId(id: string) { return this.cfg.participants.find((p) => p.agentId === id); }

  protected message(m: Omit<ChatMessage, 'id' | 'at'>) {
    const msg = { ...m, id: uid('m'), at: Date.now() };
    this.transcript.push(msg);
    this.emit({ type: 'message', message: msg });
  }

  protected notice(text: string) {
    this.emit({ type: 'message', message: { id: uid('n'), round: this.round, speakerId: 'system', text, kind: 'notice', at: Date.now() } });
  }

  protected status(p: Participant, state: AgentState, action: string) {
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
    if (this.ended) return;
    this.state = state;
    this.emit({ type: 'session', state });
  }

  protected dispose() {
    for (const a of this.agents.values()) a.abort();
    this.recorder?.abort();
    this.titler?.abort();
    clearTimeout(this.orphanTimer ?? undefined);
  }
}
