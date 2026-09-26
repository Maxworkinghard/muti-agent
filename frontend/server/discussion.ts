import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Participant, SessionConfig } from '../src/types.ts';
import type { LlmConfig } from './config.ts';
import { LlmAgent, LlmTurnError } from './llmAgent.ts';
import { buildPrompt, findPersona } from './personaDb.ts';
import { RoundtableSession } from './session.ts';

/** 人数、轮数、每次发言字数上限的范围，选人页和开讨论前的检查共用 */
export const LIMITS = { members: [2, 5], rounds: [2, 6], maxChars: [50, 400] };

const RECENT = 4; // 每次调用带上最近几条发言原文
const MAX_TURNS = 2; // 交锋轮里每人最多发言几次，避免两个人一直对吵
/** 每次调用只发 system 和一条拼好的消息，不带历史；温度 0.8，单次最多等 120 秒 */
const CALL = { temperature: 0.8, remember: false };
const TIMEOUT = 120_000;

const MODERATOR = `你是一场理性讨论的中立主持人，不偏向任何一方。
根据讨论记录写总结，包含：
1. 每个人的最终立场（一两句话）
2. 达成共识的地方
3. 仍然存在的分歧
4. 谁在讨论中改变了看法，因为什么
用简洁、自然的中文写成几段话，不用列表、加粗和“首先、其次、综上所述”，不要加入你自己的观点。`;

const SUMMARY = '用 150 字以内概括下面这段讨论到目前为止的进展：各人的立场、主要争论点、谁回应了谁。只输出概括。';

type Stage = '开场' | '交锋' | '收尾';

const TASKS: Record<Stage, string> = {
  开场: '讨论开场。按照你的“讨论开场时你的做法”来发言，不要直接给出完整答案。',
  交锋: '回应前面某位参与者的具体说法：同意、部分同意或反对，并给出新的理由、反例或问题。',
  收尾: '这是最后一轮。说明你现在的最终立场：哪些看法被谁的哪个理由改变了，哪些你仍然坚持，为什么。',
};

/** 一条发言，字段和 backend/讨论记录/ 里的一样 */
interface Entry {
  round: number;
  name: string;
  speech: string;
  respondsTo: string | null;
  stance: string | null;
  newPoint: unknown;
  challenge: string | null;
  challengeTarget: string | null;
  /** 这次发言回应了谁对自己的质疑 */
  answered: string | null;
  /** 这条里的质疑已经被回应过 */
  resolved?: boolean;
}
type Reply = Pick<Entry, 'speech' | 'respondsTo' | 'stance' | 'newPoint' | 'challenge' | 'challengeTarget'>;

/** 开讨论前准备好的座位：人物、性格和拼好的系统提示词 */
export interface Seat { agentId: string; name: string; role: string; personality: string; system: string }

interface Member extends Omit<Seat, 'system'> { p: Participant; agent: LlmAgent }

class Stopped extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const maxCharsOf = (cfg: SessionConfig) => Math.trunc(Number(cfg.engineOptions?.maxChars ?? 150));

/** 模型应该只回一个 JSON 对象；解析不出来时整段当发言，立场记“未知”。其余字段照模型给的原样保留 */
export function parseReply(text: string): Reply {
  const m = text.match(/\{[\s\S]*\}/);
  let d: any;
  try { d = m ? JSON.parse(m[0]) : {}; } catch { d = {}; }
  if (!d?.speech) d = { speech: text.trim(), respondsTo: null, stance: '未知', newPoint: true, challenge: null, challengeTarget: null };
  for (const k of ['respondsTo', 'challengeTarget']) {
    let v = d[k];
    if (Array.isArray(v)) v = v.length ? v[0] : null; // 模型偶尔填多个人，只取第一个
    if (typeof v === 'string') {
      v = v.trim().split(/[、,，/ ]/)[0] || null;
      if (v === 'null' || v === 'None' || v === '无') v = null;
    }
    d[k] = v ?? null;
  }
  if (!d.challenge) d.challengeTarget = null;
  const { speech, respondsTo, stance, newPoint, challenge, challengeTarget } = d;
  return { speech: String(speech), respondsTo, stance: stance ?? null, newPoint: newPoint ?? null, challenge: challenge ?? null, challengeTarget };
}

/** pending 是这个人要先回应的质疑 */
function taskFor(stage: Stage, pending: Entry | null) {
  const base = TASKS[stage];
  return pending ? `${pending.name} 刚才质疑了你：“${pending.challenge}”。先正面回应这个质疑（接受、反驳或部分接受，并说明理由）。然后：${base}` : base;
}

/** 针对 name、还没被回应的最早一条质疑 */
const openChallenge = (log: Entry[], name: string) =>
  log.find((x) => x.challengeTarget === name && !x.resolved && x.name !== name) ?? null;

/** 交锋轮里下一个发言的人：被质疑的人优先，其次是本轮还没说过话的人；都没有就结束这一轮 */
function nextSpeaker(members: Member[], log: Entry[], spoken: Map<string, number>) {
  const last = log.at(-1)?.name;
  return members.find((m) => m.name !== last && spoken.get(m.name)! < MAX_TURNS && openChallenge(log, m.name))
    ?? members.find((m) => spoken.get(m.name) === 0) ?? null;
}

/** 每次调用发给成员的那条消息 */
function userMessage(question: string, others: string, summary: string, log: Entry[], task: string) {
  const recent = log.slice(-RECENT).map((x) => `${x.name}：${x.speech}`).join('\n') || '（还没有人发言）';
  return `议题：${question}\n\n参与者：${others}\n\n前情摘要：${summary}\n\n最近发言：\n${recent}\n\n本轮任务：${task}`;
}

/** 开讨论前检查人数、轮数、字数和每个人的人物、性格，拼好每个人的系统提示词；有问题时返回说明 */
export async function prepareDiscussion(cfg: SessionConfig, dir: string): Promise<Seat[] | string> {
  const inRange = (v: number, [lo, hi]: number[]) => v >= lo && v <= hi;
  if (!inRange(cfg.participants.length, LIMITS.members)) return `人物要选 ${LIMITS.members[0]} 到 ${LIMITS.members[1]} 个。`;
  if (!inRange(cfg.maxRounds, LIMITS.rounds)) return `轮数要在 ${LIMITS.rounds[0]} 到 ${LIMITS.rounds[1]} 之间。`;
  const maxChars = maxCharsOf(cfg);
  if (!inRange(maxChars, LIMITS.maxChars)) return `字数上限要在 ${LIMITS.maxChars[0]} 到 ${LIMITS.maxChars[1]} 之间。`;
  const seats: Seat[] = [];
  for (const p of cfg.participants) {
    try {
      const { persona } = await findPersona(dir, p.persona.name);
      const system = await buildPrompt(dir, persona.name, p.personalityId, maxChars);
      if (seats.some((s) => s.name === persona.name)) return `${persona.name} 被选了两次。`;
      seats.push({ agentId: p.agentId, name: persona.name, role: persona.identity.role, personality: p.personalityId, system });
    } catch (e) {
      return errMsg(e);
    }
  }
  return seats;
}

/**
 * 理性讨论（按 #5 的 讨论引擎.py、服务.py 移植，流程和提示词不变）：
 * 第 1 轮开场每人一次；中间几轮交锋，被质疑的人优先回应，每人每轮最多两次；最后一轮收尾每人一次。
 * 轮与轮之间主持人写前情摘要，结束后写总结，整场记录存到 backend/讨论记录/。
 * 每次发言调用都是 system（通用规则 + 角色 + 性格）加一条消息：议题、参与者、前情摘要、最近几条发言和本轮任务。
 * 等用户开口、自动起主题、停止、断线补发沿用 RoundtableSession。
 */
export class DiscussionSession extends RoundtableSession {
  private members: Member[];
  private log: Entry[] = [];
  private summary = '讨论刚开始。';
  private count = new Map<string, number>();
  private inbox: Array<{ text: string; target?: string }> = [];
  private current: Participant | null = null;
  private summarizer: LlmAgent;
  private moderator: LlmAgent;

  constructor(id: string, cfg: SessionConfig, llm: LlmConfig, seats: Seat[], private dir: string) {
    super(id, cfg, llm);
    this.members = seats.map(({ system, ...s }) => {
      const agent = new LlmAgent(s.name, llm, system, CALL);
      this.agents.set(s.agentId, agent);
      this.count.set(s.name, 0);
      return { ...s, p: this.byId(s.agentId)!, agent };
    });
    this.summarizer = new LlmAgent('主持人', llm, SUMMARY, CALL);
    this.moderator = new LlmAgent('主持人', llm, MODERATOR, CALL);
  }

  async run() {
    this.emit({ type: 'session', state: 'running' });
    try {
      this.cfg.participants.forEach((p) => this.status(p, 'idle', '就座'));
      await this.waitForTask();
      if (this.ended) return;
      await this.discuss();
      if (this.ended) return;
      this.cfg.participants.forEach((p) => this.status(p, 'done', '完成'));
      this.finish('finished');
    } catch (e) {
      if (!this.ended) { this.notice('会话中断：' + errMsg(e)); this.finish('stopped'); }
    } finally {
      this.dispose();
    }
  }

  /** 对全体说的第一句话开始讨论；之后的话排队，在下一位发言前由被点名的人（或说得最少的人）回应 */
  userMessage(text: string, targetAgentId?: string) {
    if (this.ended) return;
    const target = targetAgentId && this.byId(targetAgentId) ? targetAgentId : undefined;
    if (this.request) {
      this.message({ round: this.round, speakerId: 'user', text, kind: 'user', targetId: target });
      this.inbox.push({ text, target });
    } else if (target) {
      // 还没有议题，没法单独回应
      this.message({ round: 0, speakerId: 'user', text, kind: 'user', targetId: target });
      this.notice('讨论还没开始：先对全体说一句开场（说“开始吧”也行），之后才能单独和某个人说话');
    } else {
      super.userMessage(text);
    }
  }

  /** 第 1 轮开场，最后一轮收尾，中间都是交锋 */
  protected label(r: number): Stage {
    return r === 1 ? '开场' : r === this.cfg.maxRounds ? '收尾' : '交锋';
  }

  protected dispose() {
    super.dispose();
    this.summarizer.abort();
    this.moderator.abort();
  }

  private async discuss() {
    // 填了主题时，主题是议题、第一句话是补充说明；没填时第一句话就是议题
    const title = this.cfg.theme.title.trim();
    const question = title || this.request.trim();
    const brief = title ? this.request.trim().slice(0, 1000) : '';
    const ctx = question + (brief ? `\n（用户开场时的补充说明：${brief}）` : '');
    const rounds = this.cfg.maxRounds;
    for (let rnd = 1; rnd <= rounds; rnd++) {
      const stage = this.label(rnd);
      this.beginRound(rnd);
      if (stage === '交锋') {
        const spoken = new Map(this.members.map((m) => [m.name, 0]));
        for (;;) {
          await this.handleUser(rnd, ctx);
          const m = nextSpeaker(this.members, this.log, spoken);
          if (!m) break;
          await this.turn(m, rnd, stage, ctx);
          spoken.set(m.name, spoken.get(m.name)! + 1);
        }
      } else {
        // 开场和收尾每人一次，按入座顺序；收尾时有没回应的质疑会先回应
        for (const m of this.members) {
          await this.handleUser(rnd, ctx);
          await this.turn(m, rnd, stage, ctx);
        }
      }
      if (rnd < rounds) {
        this.allIdle('主持人正在整理前情摘要…');
        const full = this.log.map((x) => `${x.name}：${x.speech}`).join('\n');
        this.summary = (await this.ask(this.summarizer, `议题：${ctx}\n\n${full}`)).trim();
      }
    }
    await this.handleUser(rounds, ctx);
    this.allIdle('主持人正在写总结…');
    const full = this.log.map((x) => `第${x.round}轮 ${x.name}：${x.speech}`).join('\n');
    const final = (await this.ask(this.moderator, `议题：${ctx}\n\n讨论记录：\n${full}`)).trim();
    this.emit({ type: 'result', result: { consensus: [], disagreements: [], openQuestions: [], suggestions: [], summary: final } });
    await this.save(question, brief, final);
  }

  private async turn(m: Member, rnd: number, stage: Stage, ctx: string) {
    const others = this.members.filter((o) => o !== m).map((o) => `${o.name}（${o.role}）`).join('、');
    const pending = stage === '开场' ? null : openChallenge(this.log, m.name);
    const r = await this.call(m, userMessage(ctx, others, this.summary, this.log, taskFor(stage, pending)));
    if (pending) pending.resolved = true;
    const entry: Entry = { round: rnd, name: m.name, ...r, answered: pending?.name ?? null };
    this.log.push(entry);
    this.count.set(m.name, this.count.get(m.name)! + 1);
    this.talk(m, entry, false);
  }

  /** 用户插话：记进发言记录，由被点名的人回应，没点名时由目前说得最少的人回应 */
  private async handleUser(rnd: number, ctx: string) {
    while (this.inbox.length && !this.ended) {
      const u = this.inbox.shift()!;
      const text = u.text.slice(0, 500);
      const target = u.target ? this.byId(u.target)?.persona.name : undefined;
      const m = this.members.find((x) => x.name === target)
        ?? this.members.reduce((a, b) => (this.count.get(b.name)! < this.count.get(a.name)! ? b : a));
      this.log.push({ round: rnd, name: '用户', speech: text, respondsTo: target ?? null, stance: '插话', newPoint: true, challenge: null, challengeTarget: null, answered: null });
      const others = this.members.filter((x) => x !== m).map((x) => x.name).join('、');
      const task = `旁听的用户刚才${target ? '对你' : '对大家'}说：“${text}”。先直接回应用户（respondsTo 填“用户”），再把它和正在讨论的议题联系起来。`;
      const r = await this.call(m, userMessage(ctx, others, this.summary, this.log, task));
      const entry: Entry = { round: rnd, name: m.name, ...r, respondsTo: '用户', answered: null };
      this.log.push(entry);
      this.count.set(m.name, this.count.get(m.name)! + 1);
      this.talk(m, entry, true);
    }
  }

  private async call(m: Member, msg: string): Promise<Reply> {
    this.status(m.p, 'thinking', '思考中…');
    return parseReply(await this.ask(m.agent, msg));
  }

  /** 最多试三次，间隔 2 秒、4 秒；鉴权失败、模型不存在这类错误不再重试 */
  private async ask(agent: LlmAgent, msg: string): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      if (this.ended) throw new Stopped();
      try {
        const text = await agent.ask(msg, TIMEOUT);
        if (this.ended) throw new Stopped();
        return text;
      } catch (e) {
        if (this.ended) throw new Stopped();
        if (attempt === 3 || (e instanceof LlmTurnError && e.fatal)) throw new Error(`${agent.name} 调用模型失败：${errMsg(e)}`);
        await sleep(2000 * attempt);
      }
    }
  }

  private talk(m: Member, e: Entry, toUser: boolean) {
    if (this.current && this.current !== m.p) this.status(this.current, 'idle', '倾听');
    this.status(m.p, 'speaking', toUser ? '回应你' : e.stance || '发言中');
    this.message({
      round: e.round, speakerId: m.p.agentId, text: e.speech, kind: toUser ? 'reply' : 'speech',
      targetId: toUser ? 'user' : this.members.find((x) => x.name === e.respondsTo)?.p.agentId,
      meta: { stance: e.stance ?? undefined, respondsTo: e.respondsTo, challenge: e.challenge, challengeTarget: e.challengeTarget, answered: e.answered },
    });
    this.current = m.p;
  }

  private allIdle(action: string) {
    this.cfg.participants.forEach((p) => this.status(p, 'idle', action));
    this.current = null;
  }

  /** 整场记录存成 backend/讨论记录/年月日-时分秒.json */
  private async save(question: string, brief: string, summary: string) {
    const d = new Date();
    const two = (n: number) => String(n).padStart(2, '0');
    const file = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.json`;
    const record = {
      question, brief, model: this.llm.model,
      members: this.members.map(({ name, role, personality }) => ({ name, role, personality })),
      rounds: this.cfg.maxRounds, maxChars: maxCharsOf(this.cfg), log: this.log, summary,
    };
    try {
      const dir = path.join(this.dir, '讨论记录');
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, file), JSON.stringify(record, null, 2), 'utf8');
    } catch (e) {
      this.notice('讨论记录没有保存：' + errMsg(e));
    }
  }
}
