import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentState, ChatMessage, EngineEvent, ModeDef, ModeId, Participant, SessionConfig, TaskEvent } from '../src/types.ts';
import { modeById, roleName, trackById } from '../src/data/modes.ts';
import { OmpAgent, OmpTurnError } from './ompAgent.ts';
import { HOST_PROMPT, RECORDER_PROMPT, SIDE_NAME, TITLER_PROMPT, agentSystemPrompt, cleanTitle, clip, extractJson, toResult, whoIs } from './prompts.ts';
import type { Runtime } from './runtime.ts';

type Listener = (e: EngineEvent, index: number) => void;

/** 讨论类模式每一轮的发言要点，和 modes.ts 里的 roundLabels 一一对应 */
const TALK_GUIDE: Partial<Record<ModeId, string[]>> = {
  entertainment: ['轻松开场，抛出你的第一个想法', '接上别人的想法继续发挥', '选出你最喜欢的一个想法并说理由'],
  emotion: ['先回应这件事里最重要的情绪或问题', '区分事实、感受、解释和还不知道的部分', '给出一到三个现在就能做的下一步'],
};
const DEBATE_GUIDE = ['陈述你方立场和主要论据', '针对对方的论点提出质询或反驳', '做总结陈词'];
/** Vibe Coding 里主 Agent 最多澄清几轮，之后按推荐答案开工；检查不合格最多返工几次 */
const MAX_CLARIFY = 3;
const MAX_FIX = 1;

/** 总控点名的一项工作：after 是要先等谁的结论 */
interface Call { p: Participant; task: string; after: Participant[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** 发给 Agent 和记录员的只有成员和用户说的话；轮次标记、引擎提示和流程说明不算 */
const spoken = (m: ChatMessage) => m.kind !== 'system' && m.kind !== 'notice' && m.kind !== 'note';
/** 负责人没派出具体任务时的兜底 */
const fallbackTask = (p: Participant) => `从「${p.persona.knowledge[0] ?? p.persona.name}」角度处理用户的需求`;
let seq = 0;
const uid = (p: string) => p + '-' + Date.now().toString(36) + '-' + (seq++).toString(36);

/**
 * 一场会话：每位成员一个 omp 进程，按模式的轮次让他们依次发言，事件推给前端。
 * 每次发言前，把这位成员还没看过的新发言（含用户插话）连同本轮指令一起发给他。
 */
export class RoundtableSession {
  readonly events: EngineEvent[] = [];
  private listeners = new Set<Listener>();
  private agents = new Map<string, OmpAgent>();
  private recorder: OmpAgent | null = null;
  private titler: OmpAgent | null = null;
  private host: OmpAgent | null = null;
  private transcript: ChatMessage[] = [];
  private seen = new Map<string, number>();
  private userQueue: Array<string | undefined> = [];
  /** 用户对全体说的第一句话：这一场要处理的问题或任务，主题只作背景 */
  private request = '';
  /** 用户填的主题；没填时按第一句话生成 */
  private theme: string;
  private wake: (() => void) | null = null;
  /** 正在等用户回答的成员（主 Agent 的澄清问题）；用户的回答放进 answer */
  private awaiting: string | null = null;
  private answer: string | null = null;
  /** 用户对全体插话时由谁回应；情感交流里是主持挑中的主风格 */
  private responder: Participant | null = null;
  private state: 'running' | 'finished' | 'stopped' = 'running';
  private round = 0;
  private speaking: Participant | null = null;
  private failures = 0;
  private clients = 0;
  private orphanTimer: NodeJS.Timeout | null = null;
  private readonly mode: ModeDef;
  private readonly dir: string;

  constructor(readonly id: string, private cfg: SessionConfig, private rt: Runtime) {
    this.mode = modeById(cfg.mode);
    this.dir = join(rt.cfg.dir, 'sessions', id);
    this.theme = cfg.theme.title.trim();
  }

  get ended() { return this.state !== 'running'; }

  /** 订阅事件；after 之后的历史事件先补发（SSE 断线重连用） */
  subscribe(fn: Listener, after = -1) {
    this.events.forEach((e, i) => { if (i > after) fn(e, i); });
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** 前端全部断开一分钟还没回来，就结束会话，免得 omp 进程一直留着 */
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
    this.cfg.participants.forEach((p) => this.status(p, 'idle', '启动中…'));
    try {
      await this.spawnAgents();
      await this.waitForTask();
      if (this.ended) return;
      // 返回 false 表示没有进入完整流程（比如只是提问，主 Agent 直接回答了），不用再整理结论
      const full = await this.runFlow();
      await this.drainUser();
      if (this.ended) return;
      if (full !== false) await this.summarize();
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
    // 有成员在等用户回答时，对全体说的或点名这位成员的话就是回答
    const answering = !opening && this.awaiting !== null && this.answer === null && (!target || target === this.awaiting);
    if (opening) {
      this.request = text;
      if (!this.theme) void this.nameTheme(text);
    }
    this.message({ round: opening ? 1 : this.round, speakerId: 'user', text, kind: 'user', targetId: target });
    if (answering) this.answer = text;
    else if (!opening) this.userQueue.push(target);
    this.wake?.();
  }

  stop() {
    if (this.ended) return;
    this.finish('stopped');
    this.wake?.();
    this.dispose();
  }

  /** 服务器退出时同步结束所有进程 */
  kill() {
    this.state = 'stopped';
    this.wake?.();
    for (const a of this.agents.values()) a.kill();
    this.recorder?.kill();
    this.titler?.kill();
    this.host?.kill();
  }

  /** 没填主题：另起一个 omp 进程按用户第一句话起名，不耽误大家开工；起不出来就截取原话 */
  private async nameTheme(text: string) {
    let title = '';
    try {
      mkdirSync(this.dir, { recursive: true });
      const file = join(this.dir, 'titler.md');
      writeFileSync(file, TITLER_PROMPT);
      this.titler = new OmpAgent('起名', this.rt, file);
      await this.titler.start();
      title = cleanTitle(await this.titler.ask(`用户的第一句话：「${text}」\n给这场对话起一个主题。`));
    } catch { /* 用下面的兜底 */ }
    this.titler?.dispose();
    this.titler = null;
    if (this.ended) return;
    this.theme = title || clip(text.replace(/\s+/g, ' ').trim(), 16);
    this.emit({ type: 'theme', title: this.theme });
  }

  /** 等到 done() 成立；等待期间用户点名的话照常回应 */
  private async waitUntil(done: () => boolean) {
    while (!done() && !this.ended) {
      if (this.userQueue.length) { await this.drainUser(); continue; }
      await new Promise<void>((resolve) => { this.wake = resolve; });
      this.wake = null;
    }
  }

  /** 进房间后不自动开始，等用户对全体开口；这期间单独点名的话照常回应 */
  private async waitForTask() {
    this.emit({ type: 'round', round: 0, label: '等你开口' });
    await this.waitUntil(() => !!this.request);
  }

  /** 等用户回答 p 的问题，返回回答；会话结束时返回 null */
  private async waitForAnswer(p: Participant, hint: string): Promise<string | null> {
    this.awaiting = p.agentId;
    this.answer = null;
    this.status(p, 'idle', '等你回答');
    this.emit({ type: 'awaiting', hint });
    await this.waitUntil(() => this.answer !== null);
    this.awaiting = null;
    if (!this.ended) this.emit({ type: 'awaiting', hint: null });
    return this.ended ? null : this.answer;
  }

  // ---------- 流程：只认角色，不认具体是谁 ----------

  private runFlow(): Promise<boolean | void> {
    switch (this.mode.flow) {
      case 'debate': return this.runDebate();
      case 'work': return this.runWork();
      case 'pick': return this.runPick();
      case 'dispatch': return this.runDispatch();
      case 'pipeline': return this.runPipeline();
      default: return this.runTalk();
    }
  }

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
    for (let r = 1; r <= last && !this.ended; r++) {
      this.beginRound(r);
      if (host && r === 1) {
        await this.drainUser();
        await this.speak(host, `第 1 轮「${this.label(1)}」：你是主持人。辩题以用户刚才说的为准${this.theme ? `（用户只是让大家开始的话，就用主题「${this.theme}」）` : ''}，宣布辩题和发言规则，请双方陈述，不超过 100 字。`);
      }
      for (const p of order) {
        await this.drainUser();
        const side = p.side ? `你是${SIDE_NAME[p.side]}，` : '';
        await this.speak(p, `第 ${r} 轮「${this.label(r)}」：${side}${DEBATE_GUIDE[r - 1] ?? '继续发言'}，不超过 150 字。`);
      }
      if (host && r === last) {
        await this.drainUser();
        await this.speak(host, `第 ${r} 轮「${this.label(r)}」：作为主持人收尾，点出双方真正的分歧、已有的共识和还要验证的问题，只挑最关键的，不超过 150 字。`);
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
      tasks.set(m.agentId, clip(String(a?.task || fallbackTask(m)), 40));
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

  /** 情感交流：不出场的主持人看用户说了什么，给每一步挑人；用不上的人旁听，用不上的步骤跳过 */
  private async runPick() {
    const ps = this.cfg.participants;
    ps.forEach((p) => this.status(p, 'idle', '等主持安排'));
    const plan = await this.hostPlan();
    if (this.ended) return;
    if (!plan) {
      this.notice('主持没排出人选，改成大家轮流发言');
      return this.runTalk();
    }
    const picked = [...new Set(plan.steps.flat())];
    this.responder = picked[0];
    ps.forEach((p) => this.status(p, 'idle', picked.includes(p) ? '倾听' : '旁听'));
    const guide = TALK_GUIDE[this.cfg.mode];
    for (let r = 1; r <= this.cfg.maxRounds && !this.ended; r++) {
      const speakers = plan.steps[r - 1] ?? [];
      if (!speakers.length) continue;
      this.beginRound(r);
      if (r === 1) {
        const names = (s: Participant[]) => s.map((p) => p.persona.name).join('、') || '先不展开';
        this.note(`主持安排：${this.mode.roundLabels.map((l, i) => `${l} → ${names(plan.steps[i] ?? [])}`).join('；')}${plan.reason ? `（${plan.reason}）` : ''}`);
      }
      for (const p of speakers) {
        await this.drainUser();
        await this.speak(p, `第 ${r} 轮「${this.label(r)}」：${r === 1 ? '用户刚才说的就是这场要聊的事。' : ''}${guide?.[r - 1] ?? '围绕用户说的回应'}。请发言，不超过 120 字。`);
      }
    }
  }

  /** 主持人是一个不出场的 omp 进程：每一步挑 0~2 人，第 1 步至少 1 人，整场最多两种风格；排不出来返回 null */
  private async hostPlan(): Promise<{ steps: Participant[][]; reason: string } | null> {
    const ps = this.cfg.participants;
    const roster = ps.map((p, i) => `- m${i + 1}：${whoIs(p)}`).join('\n');
    const labels = this.mode.roundLabels;
    let text = '';
    try {
      mkdirSync(this.dir, { recursive: true });
      const file = join(this.dir, 'host.md');
      writeFileSync(file, HOST_PROMPT);
      this.host = new OmpAgent('主持', this.rt, file);
      await this.host.start();
      text = await this.host.ask(
        `用户说：「${this.request}」\n在座的回应风格：\n${roster}\n这场对话分 ${labels.length} 步：${labels.map((l, i) => `${i + 1}. ${l}`).join('；')}。\n` +
        '给每一步挑 0~2 个风格：第 1 步至少 1 个，整场最多用两种风格，主风格放最前面；用户用不上的步骤留空。只输出一个 JSON 代码块：\n' +
        '```json\n{"steps":[["m1"],["m2"],[]],"reason":"不超过 30 字，用户现在最需要什么"}\n```');
    } catch { /* 交给调用方兜底 */ }
    this.host?.dispose();
    this.host = null;
    const json = extractJson(text)?.json;
    if (!Array.isArray(json?.steps)) return null;
    const pick = (k: unknown) => ps[Number(String(k).replace(/^m/i, '')) - 1];
    const raw = labels.map((_, i) => (Array.isArray(json.steps[i]) ? json.steps[i] : []) as unknown[]);
    const allowed = [...new Set(raw.flat().map(pick).filter((p): p is Participant => !!p))].slice(0, 2);
    const steps = raw.map((s) => [...new Set(s.map(pick))].filter((p): p is Participant => !!p && allowed.includes(p)).slice(0, 2));
    if (!steps[0].length) return null;
    return { steps, reason: clip(String(json.reason ?? '').trim(), 40) };
  }

  /** 总控按需点名：总控看需求和候选名单，只叫用得上的人，定好先后和依赖；没被点到的旁听 */
  private async runDispatch() {
    const ps = this.cfg.participants;
    const lead = ps.find((p) => p.role === 'coordinator') ?? ps.find((p) => p.isLead) ?? ps[0];
    const pool = ps.filter((p) => p !== lead);
    const who = roleName(this.mode, 'coordinator') ?? '负责人';

    this.beginRound(1);
    await this.drainUser();
    const roster = pool.map((m, i) => `- m${i + 1}：${whoIs(m)}`).join('\n') || '（没有候选成员）';
    const plan = await this.think(lead,
      `第 1 轮「${this.label(1)}」：你是${who}。用户的需求是「${this.request}」。下面是在座的候选成员，只叫对这个需求真正用得上的人，不要为了全面都叫上；都用不上就一个也不叫，由你直接处理：\n${roster}\n` +
      '先用一两句话说明你的判断：叫谁、为什么（不超过 120 字）。再单独输出一个 JSON 代码块，calls 按执行顺序排，after 写这项工作要先等谁的结论：\n' +
      '```json\n{"calls":[{"member":"m1","task":"不超过 30 字的任务","after":[]}]}\n```');
    if (this.ended) return;
    const parsed = plan ? extractJson(plan) : null;
    const calls = this.parseCalls(parsed?.json, pool);
    this.say(lead, parsed?.rest || (plan && !parsed ? plan : calls.length ? '按需求点名，其他人先旁听。' : '这个需求我直接处理，不用叫其他成员。'));
    for (const c of calls) {
      if (this.ended) return;
      const wait = c.after.length ? `（等 ${c.after.map((d) => d.persona.name).join('、')} 的结论）` : '';
      this.task({ title: c.task, from: lead.agentId, to: c.p.agentId, status: 'assigned' });
      this.message({ round: 1, speakerId: lead.agentId, text: `→ 请 ${c.p.persona.name}：${c.task}${wait}`, kind: 'task', targetId: c.p.agentId });
      this.status(c.p, 'working', '处理 ' + clip(c.task, 12));
      await sleep(600);
    }
    pool.filter((p) => !calls.some((c) => c.p === p)).forEach((p) => this.status(p, 'idle', '旁听'));
    if (!calls.length) this.note(`${who}判断这次用不上其他成员，直接处理`);

    if (calls.length) {
      this.beginRound(2);
      for (const c of calls) {
        await this.drainUser();
        if (this.ended) return;
        const deps = c.after.length ? `先看 ${c.after.map((d) => d.persona.name).join('、')} 的结论（见上面的新发言），在此基础上` : '';
        const out = await this.speak(c.p, `第 2 轮「${this.label(2)}」：${who}请你处理「${c.task}」。${deps}只从你的职责出发，直接说结论和最关键的依据，拿不准的写成待验证，不超过 200 字。`);
        if (out === null || this.ended) continue;
        // 结论交给等它的人；没人等就交回总控
        const next = calls.filter((x) => x.after.includes(c.p)).map((x) => x.p);
        for (const n of next.length ? next : [lead]) this.task({ title: c.task, from: c.p.agentId, to: n.agentId, status: 'handoff' });
        await sleep(600);
      }
    }

    this.beginRound(3);
    await this.drainUser();
    await this.speak(lead, calls.length
      ? `第 3 轮「${this.label(3)}」：作为${who}汇总：给出结论、关键依据和取舍，成员之间有冲突就说清怎么处理，还有什么要验证；不复述每个人的话，不超过 250 字。`
      : `第 3 轮「${this.label(3)}」：直接处理用户的需求，给出结论、依据和下一步，不超过 250 字。`);
    if (!this.ended) calls.forEach((c) => this.task({ title: '交付物', from: c.p.agentId, to: lead.agentId, status: 'done' }));
  }

  /** 解析总控的点名：只认候选名单里的人并去重；依赖只算被点到的人，按依赖调整先后，循环依赖按原顺序 */
  private parseCalls(json: any, pool: Participant[]): Call[] {
    // 没给出能用的 JSON：退回每人一项
    if (!Array.isArray(json?.calls)) return pool.map((p) => ({ p, task: fallbackTask(p), after: [] }));
    const pick = (k: unknown) => pool[Number(String(k).replace(/^m/i, '')) - 1];
    const raw: Array<{ p: Participant; task: string; deps: unknown[] }> = [];
    for (const c of json.calls) {
      const p = pick(c?.member);
      if (p && !raw.some((x) => x.p === p)) raw.push({ p, task: clip(String(c?.task || fallbackTask(p)), 40), deps: Array.isArray(c?.after) ? c.after : [] });
    }
    const calls: Call[] = raw.map((c) => ({
      p: c.p, task: c.task,
      after: [...new Set(c.deps.map(pick))].filter((d): d is Participant => !!d && d !== c.p && raw.some((x) => x.p === d)),
    }));
    const out: Call[] = [];
    while (calls.length) {
      const i = calls.findIndex((c) => c.after.every((d) => !calls.some((x) => x.p === d)));
      out.push(...calls.splice(Math.max(i, 0), 1));
    }
    return out;
  }

  /**
   * Vibe Coding：按 persona-db/vibe coding人格/workflow.md 的五个阶段串行，所有交接都经过主 Agent：
   * 澄清需求（等用户回答、确认开工）→ 写 Prompt → 审核 → 执行 → 检查交付，不合格返工一次；多选的人在检查时当评审。
   * 只是提问时主 Agent 直接回答，返回 false，不启动工作流。
   */
  private async runPipeline(): Promise<boolean | void> {
    const ps = this.cfg.participants;
    const main = ps.find((p) => p.role === 'coordinator') ?? ps.find((p) => p.isLead) ?? ps[0];
    const writer = ps.find((p) => p.role === 'writer');
    const executor = ps.find((p) => p.role === 'executor');
    // 角色不全（比如配置被改过）就退回通用的派活流程
    if (!writer || !executor || writer === main || executor === main) return this.runWork();
    const reviewers = ps.filter((p) => p !== main && p !== writer && p !== executor);
    const at = () => `第 ${this.round} 轮「${this.label(this.round)}」：`;

    // 阶段一：主 Agent 判断是不是只是提问；要做事就分轮澄清，用户确认开工后写需求说明
    this.beginRound(1);
    let instruction = at() + '你是主 Agent，用户的话见上面的新发言。按工作流阶段一处理：\n' +
      '- 只是提问或聊天、不需要产出东西：直接回答，不启动工作流；\n' +
      '- 要做事但需求还不清楚：分轮提问，每个问题编号并附推荐答案，只问会影响结果的；\n' +
      '- 需求已经够清楚（知道最终要什么、交付形式、能写出可检查的验收标准）：给出需求总结，问“还有其他需求吗？没有的话我就开始执行”；\n' +
      '- 用户已经确认开工，或说了“开始吧”“就这样”：写出交给 Prompt 编写 Agent 的需求说明（目标、交付形式、任务拆解、约束、验收标准、合理假设，没问完的按推荐答案处理并标明）。\n' +
      '先写要说的内容（不超过 300 字），最后单独输出一个 JSON 代码块说明这一步属于哪种情况，next 取 answer（直接回答）/ ask（在提问）/ confirm（在确认开工）/ start（已开工，上面是需求说明）：\n' +
      '```json\n{"next":"ask"}\n```';
    for (let turn = 1; ; turn++) {
      await this.drainUser();
      const text = await this.think(main, instruction);
      if (text === null) return;
      const parsed = extractJson(text);
      const next = String(parsed?.json?.next ?? '');
      this.say(main, parsed?.rest || (next === 'start' ? `需求整理好了，交给${writer.persona.name}写 Prompt。` : text));
      if (next === 'answer') return false;
      if (next === 'start' || turn > MAX_CLARIFY) break;
      // 在提问、在确认，或者没按格式说明：都等用户回答，没满足开工条件不往下分发
      if ((await this.waitForAnswer(main, '回答主 Agent 的问题：可以按编号回答，也可以说“按推荐”或“开始吧”')) === null) return;
      instruction = turn < MAX_CLARIFY
        ? at() + '用户回答了（见上面的新发言）。按同样的规则继续判断，最后同样输出 JSON。'
        : at() + '用户已经回答了好几轮。现在写出需求说明开工，没问完的按推荐答案处理并标明是假设；JSON 的 next 写 start。';
    }
    this.task({ title: '需求说明', from: main.agentId, to: writer.agentId, status: 'assigned' });
    this.status(writer, 'working', '写 Prompt');
    await sleep(600);

    const write = async (ask: string) => {
      await this.drainUser();
      const out = await this.speak(writer, at() + ask);
      if (out !== null && !this.ended) this.task({ title: 'Prompt 草稿', from: writer.agentId, to: main.agentId, status: 'handoff' });
    };
    /** 阶段三：主 Agent 审核 Prompt；返回退回重写的意见，通过时返回空串 */
    const review = async (again: boolean) => {
      await this.drainUser();
      const text = await this.think(main, at() + (again
        ? `审核重写后的 Prompt，直接形成唯一的最终 Prompt 交给${executor.persona.name}，说清改了什么，不超过 150 字。`
        : '按工作流阶段三审核上面的 Prompt：目标有没有保留、有没有遗漏或歧义、假设有没有写成事实、验收标准能不能检查。表达问题直接改；核心目标理解错了或缺少关键信息才退回重写。' +
          '先说审核结论和改了什么（不超过 200 字），审核通过的版本就是唯一的最终 Prompt。最后单独输出一个 JSON 代码块：{"next":"execute"}，或 {"next":"rewrite","fix":"要改什么"}'));
      if (text === null) return '';
      const parsed = extractJson(text);
      this.say(main, parsed?.rest || text);
      return !again && parsed?.json?.next === 'rewrite' ? String(parsed.json.fix || '按审核意见修改') : '';
    };
    /** 阶段四：执行 Agent 按最终 Prompt 执行，执行报告交回主 Agent */
    const execute = async (ask: string) => {
      this.task({ title: '最终 Prompt', from: main.agentId, to: executor.agentId, status: 'assigned' });
      this.status(executor, 'working', '执行中');
      await sleep(600);
      await this.drainUser();
      const out = await this.speak(executor, at() + ask);
      if (out !== null && !this.ended) this.task({ title: '执行报告', from: executor.agentId, to: main.agentId, status: 'handoff' });
    };

    // 阶段二到四
    this.beginRound(2);
    await write(`${main.persona.name}的需求说明见上面的新发言。按工作流阶段二把它写成可以直接交给${executor.persona.name}执行的 Prompt：目标、输入、步骤、约束、异常处理、验收标准和返回格式都写清，最后单列关键假设和需要主 Agent 复核的事项。不超过 400 字。`);
    if (this.ended) return;
    const fix = await review(false);
    if (this.ended) return;
    if (fix) {
      this.note(`${main.persona.name}退回重写：${clip(fix, 40)}`);
      this.task({ title: '退回重写', from: main.agentId, to: writer.agentId, status: 'assigned' });
      await write(`${main.persona.name}退回了你的 Prompt：「${fix}」。按意见重写，不超过 400 字。`);
      await review(true);
      if (this.ended) return;
    }
    await execute(`按${main.persona.name}审核后的最终 Prompt 执行。你没有文件、命令或联网工具，产物直接写在回复里（代码、文案、方案都行）；写完按执行报告如实说明：状态（已完成 / 部分完成 / 未完成 / 需要补充信息）、验证情况、没完成的部分和原因。不超过 600 字。`);

    // 阶段五：评审提意见后，主 Agent 对照验收标准检查；不合格按修正循环返工
    this.beginRound(3);
    for (const r of reviewers) {
      await this.drainUser();
      await this.speak(r, at() + '从你的角度看一眼上面的产物，指出最重要的一个问题；没问题就说没问题，不超过 100 字。');
    }
    for (let attempt = 1; !this.ended; attempt++) {
      await this.drainUser();
      const last = attempt > MAX_FIX;
      const text = await this.think(main, at() + (last
        ? '这是修正后的结果。直接向用户交付：说清完成了什么、验证情况，没做到的如实列出来，不超过 250 字。'
        : `按工作流阶段五检查${executor.persona.name}的执行结果：对照用户目标和验收标准，区分已完成、部分完成和未完成，不降低标准。` +
          '能交付就直接向用户交付：说清完成了什么、验证情况和还没做到的（不超过 250 字）；需要修正就说清哪条验收标准没满足、要改什么（不超过 150 字）。' +
          '最后单独输出一个 JSON 代码块：{"status":"done"}、{"status":"partial"}，或 {"status":"fix","redo":"prompt 或 execute","fix":"要改什么"}'));
      if (text === null) break;
      const parsed = extractJson(text);
      this.say(main, parsed?.rest || text);
      if (last || parsed?.json?.status !== 'fix') break;
      const redo = String(parsed.json.fix || '按检查意见修正');
      if (parsed.json.redo === 'prompt') {
        this.note(`修正：退回${writer.persona.name}改 Prompt，再重新执行`);
        this.task({ title: '修正意见', from: main.agentId, to: writer.agentId, status: 'assigned' });
        await write(`检查没通过，${main.persona.name}要求修改 Prompt：「${redo}」。只改受影响的部分，不超过 400 字。`);
        await review(true);
      } else {
        this.note(`修正：${executor.persona.name}按检查意见重新执行`);
      }
      if (this.ended) return;
      await execute(`检查没通过：「${redo}」。只修正受影响的部分，重新给出产物和执行报告，不超过 600 字。`);
    }
    if (!this.ended) this.task({ title: '交付物', from: executor.agentId, to: main.agentId, status: 'done' });
  }

  /** 由单独的记录员 omp 进程把全程整理成共识 / 分歧 / 待验证 / 建议 / 交付物 */
  private async summarize() {
    const work = this.mode.track === 'work';
    const file = join(this.dir, 'recorder.md');
    writeFileSync(file, RECORDER_PROMPT);
    this.recorder = new OmpAgent('记录员', this.rt, file);
    const log = this.transcript.filter(spoken).map((m) => this.format(m)).join('\n');
    try {
      await this.recorder.start();
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

  /** 先启动一个进程，避免多个 omp 同时初始化同一个目录；其余并行启动 */
  private async spawnAgents() {
    mkdirSync(this.dir, { recursive: true });
    const bench = trackById(this.mode.track).name;
    const start = async (p: Participant, i: number) => {
      const file = join(this.dir, `agent-${i}.md`);
      writeFileSync(file, agentSystemPrompt(p, this.cfg, this.mode, bench));
      const agent = new OmpAgent(p.persona.name, this.rt, file);
      this.agents.set(p.agentId, agent);
      await agent.start();
      if (!this.ended) this.status(p, 'idle', '就座');
    };
    const [first, ...rest] = this.cfg.participants;
    await start(first, 0);
    await Promise.all(rest.map((p, i) => start(p, i + 1)));
  }

  /** 把新发言和本轮指令发给这位成员，拿回他的回答（不发到前端） */
  private async think(p: Participant, instruction: string, forUser = false): Promise<string | null> {
    if (this.ended) return null;
    const agent = this.agents.get(p.agentId)!;
    const from = this.seen.get(p.agentId) ?? 0;
    const news = this.transcript.slice(from)
      .filter((m) => m.speakerId !== p.agentId && spoken(m))
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
        const fatal = e instanceof OmpTurnError && e.fatal;
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
      const p = (target && this.byId(target)) || this.responder || ps.find((x) => x.isLead) || ps.find((x) => x.side === 'host') || ps[0];
      await this.speak(p, `用户${target ? '对你' : '对全体'}说了话（见上面的新发言）。请直接回应用户：问得简单就一两句话，复杂再展开，不超过 300 字。`, true);
    }
  }

  // ---------- 事件 ----------

  private say(p: Participant, text: string, kind: ChatMessage['kind'] = 'speech', targetId?: string) {
    if (this.speaking && this.speaking !== p) this.status(this.speaking, 'idle', '倾听');
    this.status(p, 'speaking', kind === 'reply' ? '回应用户' : '发言中');
    this.message({ round: this.round, speakerId: p.agentId, text, kind, targetId });
    this.speaking = p;
  }

  private beginRound(r: number) {
    if (this.ended) return;
    this.round = r;
    const label = this.label(r);
    this.emit({ type: 'round', round: r, label });
    this.message({ round: r, speakerId: 'system', text: `第 ${r} 轮 · ${label}`, kind: 'system' });
  }

  private label(r: number) { return this.mode.roundLabels[r - 1] ?? `第 ${r} 轮`; }

  private format(m: ChatMessage) {
    if (m.speakerId === 'user') return `用户${m.targetId ? '对' + this.byId(m.targetId)?.persona.name : '对全体'}说：${m.text}`;
    const who = this.byId(m.speakerId)?.persona.name ?? m.speakerId;
    return m.kind === 'task' ? `（${who} ${m.text}）` : `${who}：${m.text}`;
  }

  private byId(id: string) { return this.cfg.participants.find((p) => p.agentId === id); }

  private message(m: Omit<ChatMessage, 'id' | 'at'>) {
    const msg = { ...m, id: uid('m'), at: Date.now() };
    this.transcript.push(msg);
    this.emit({ type: 'message', message: msg });
  }

  private notice(text: string) {
    this.emit({ type: 'message', message: { id: uid('n'), round: this.round, speakerId: 'system', text, kind: 'notice', at: Date.now() } });
  }

  /** 流程说明（比如主持的安排、返工），显示在工作区里，不发给 Agent */
  private note(text: string) {
    this.message({ round: this.round, speakerId: 'system', text, kind: 'note' });
  }

  private status(p: Participant, state: AgentState, action: string) {
    this.emit({ type: 'status', agentId: p.agentId, state, action });
  }

  private task(t: Omit<TaskEvent, 'id'>) {
    this.emit({ type: 'task', task: { ...t, id: uid('t') } });
  }

  private emit(e: EngineEvent) {
    const i = this.events.push(e) - 1;
    for (const fn of this.listeners) fn(e, i);
  }

  private finish(state: 'finished' | 'stopped') {
    if (this.ended) return;
    this.state = state;
    this.emit({ type: 'session', state });
  }

  private dispose() {
    for (const a of this.agents.values()) a.dispose();
    this.recorder?.dispose();
    this.titler?.dispose();
    this.host?.dispose();
    if (this.orphanTimer) clearTimeout(this.orphanTimer);
    setTimeout(() => rmSync(this.dir, { recursive: true, force: true }), 5000).unref();
  }
}
