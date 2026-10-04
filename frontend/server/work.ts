import type { AgentState, Participant, SceneDef, TaskEvent } from '../src/types.ts';
import { placeAway, readMs, spotOf, walkMs, type Away } from '../src/data/stageRules.ts';
import { clip, extractJson, whoIs } from './prompts.ts';

/** 这一刻在干什么：状态和成员栏里显示的那句话 */
export interface Doing { state: AgentState; action: string }
/** 去哪：回自己工位、中央站会、会议室，或者走到某位同事的工位旁 */
export type Spot = 'desk' | 'huddle' | 'meeting' | Participant;

/** 全屏同时最多几个气泡：两处各聊各的还看得过来，再多就挤了；站会、开会时只有一个人说 */
const MAX_BUBBLES = 2;
/** 两份第一版至少隔多久交出来，免得记录里一下子冒出好几段 */
const POST_GAP_MS = 900;
/** 大家一起起身时，前后两个人隔多久 */
const STAGGER_MS = 160;

/**
 * 工作流程要用的会话能力：RoundtableSession 提供真的，测试里可以换成假的。
 * 同一个人的 think 由会话排队（一次只做一件事），这里可以放心并行。
 */
export interface WorkDesk {
  lead: Participant;
  /** 除负责人外的成员，顺序已按本场的随机开局轮换 */
  members: Participant[];
  /** 用户要做的事 */
  request: string;
  /** 场景：算走到哪、走多久；没有 stations 的场景里大家不走动 */
  scene: SceneDef;
  /** 走路、递文件、看气泡这些等待的倍数；0 表示不等 */
  pace: number;
  /** 最多几个人同时调用模型 */
  parallel: number;
  presence: Presence;
  ended(): boolean;
  beginRound(r: number): void;
  label(r: number): string;
  /** 先回应用户插的话，再接着干活 */
  drainUser(): Promise<void>;
  /** 暂停时等待恢复；停止时立即返回 */
  gate(): Promise<void>;
  /** 只累计未暂停的等待时间，停止时取消 */
  wait(ms: number): Promise<void>;
  /** 台上的时钟（毫秒）：暂停的时间不算，和 wait 对得上 */
  clock(): number;
  /** 让这个人想一想、写一段；失败或会话已停止时返回 null */
  think(p: Participant, instruction: string, doing: Doing): Promise<string | null>;
  /** 说出来：to 是当面说话的同事，tag 是这句话在流程里的作用（评审、第二版……）；doc 表示写好交出来的文件（第一版），记录里按文件显示 */
  say(p: Participant, text: string, meta?: { to?: Participant; tag?: string; doc?: boolean }): void;
  /** 记一笔流程动作（派活、送审），不算发言 */
  note(p: Participant, text: string, to?: Participant): void;
  task(t: Omit<TaskEvent, 'id'>): void;
  move(p: Participant, to: Spot): void;
}

/**
 * 台上调度：模型可以几个人同时想、同时写，但上台（说出来、起身走动、交文件）照现实的规矩排队，时间线拉长也不挤：
 * - 一个人一次只做一件事：话没说完不走，路没走完不开口；
 * - 当面谈的两个人轮流说：上一句在气泡里停够看完的时间，下一句才出来；站会、开会时全场轮流，人到齐了才开口；
 * - 全屏同时最多 MAX_BUBBLES 个气泡，多出来的对话先等着；第一版错开交，免得一下子冒出好几份。
 * 等到能上台的那一刻当场占住（同一个微任务里决定、发出），不给并行的别人插空。
 */
class Stage {
  /** 每个人台上空下来的时刻（话看完、路走完） */
  private busy = new Map<string, number>();
  /** 正在显示的气泡各自结束的时刻 */
  private bubbles: number[] = [];
  private nextPost = 0;

  constructor(private d: Pick<WorkDesk, 'ended' | 'wait' | 'clock' | 'gate'>, private pace: number) {}

  /**
   * 等 people 在台上都空下来（bubble：还要等屏幕上有空位放气泡；post：和上一份第一版隔开），
   * 然后当场执行 act；act 返回谁要占住台上多久（毫秒，未乘节奏倍数）。暂停中先停着；停止了返回 false，act 不执行。
   */
  async claim(people: Participant[], kind: { bubble?: boolean; post?: boolean }, act: () => { who: Participant; ms: number } | void): Promise<boolean> {
    for (;;) {
      // 暂停时谁也不上台；放行之后的判断和 act 在同一个微任务里，不给并行的别人插空
      await this.d.gate();
      if (this.d.ended()) return false;
      const now = this.d.clock();
      this.bubbles = this.bubbles.filter((end) => end > now);
      let at = Math.max(0, ...people.map((p) => this.busy.get(p.agentId) ?? 0));
      if (kind.bubble && this.bubbles.length >= MAX_BUBBLES) at = Math.max(at, Math.min(...this.bubbles));
      if (kind.post) at = Math.max(at, this.nextPost);
      if (at <= now) {
        const hold = act();
        if (kind.post) this.nextPost = now + POST_GAP_MS * this.pace;
        if (hold && hold.ms > 0) {
          const end = now + hold.ms * this.pace;
          this.busy.set(hold.who.agentId, Math.max(this.busy.get(hold.who.agentId) ?? 0, end));
          if (kind.bubble) this.bubbles.push(end);
        }
        return true;
      }
      await this.d.wait(at - now);
    }
  }
}

/**
 * 每个人此刻在干什么：平时的状态（在工位干活、等评审……）、正在想的事、刚说完话的那几秒。
 * 说完话气泡要停一会儿（按字数），这期间就算他又开始想下一件事，也先让人把话看完。
 */
export class Presence {
  private base = new Map<string, Doing>();
  private doing = new Map<string, Doing>();
  private talking = new Map<string, { timer?: ReturnType<typeof setTimeout>; remaining: number; since: number; p: Participant }>();
  private paused = false;

  constructor(private emit: (p: Participant, d: Doing) => void, private pace: () => number) {}

  /** 平时在干什么；正在想或刚说完话时先记下，忙完再显示 */
  set(p: Participant, state: AgentState, action: string) {
    this.base.set(p.agentId, { state, action });
    if (!this.paused && !this.doing.has(p.agentId) && !this.talking.has(p.agentId)) this.emit(p, { state, action });
  }

  busy(p: Participant, d: Doing) {
    this.doing.set(p.agentId, d);
    if (!this.talking.has(p.agentId)) this.emit(p, d);
  }

  free(p: Participant) {
    this.doing.delete(p.agentId);
    if (!this.paused && !this.talking.has(p.agentId)) this.show(p);
  }

  /** 说完一句：显示「发言」，气泡停够看完的时间（stageRules.readMs，和台上调度一致），再回到正在做或平时的状态 */
  spoke(p: Participant, action: string, text: string) {
    clearTimeout(this.talking.get(p.agentId)?.timer);
    this.talking.delete(p.agentId);
    this.emit(p, { state: 'speaking', action });
    const ms = readMs(text) * this.pace();
    if (ms <= 0) { if (!this.paused) this.show(p); return; }
    const bubble = { remaining: ms, since: Date.now(), p };
    this.talking.set(p.agentId, bubble);
    if (!this.paused) this.startBubble(bubble);
  }

  private startBubble(bubble: { timer?: ReturnType<typeof setTimeout>; remaining: number; since: number; p: Participant }) {
    bubble.since = Date.now();
    bubble.timer = setTimeout(() => {
      this.talking.delete(bubble.p.agentId);
      this.show(bubble.p);
    }, bubble.remaining);
  }

  pause(paused: boolean) {
    this.paused = paused;
    for (const bubble of this.talking.values()) {
      if (paused) {
        clearTimeout(bubble.timer);
        bubble.remaining = Math.max(0, bubble.remaining - (Date.now() - bubble.since));
      } else this.startBubble(bubble);
    }
  }

  private show(p: Participant) {
    this.emit(p, this.doing.get(p.agentId) ?? this.base.get(p.agentId) ?? { state: 'idle', action: '就座' });
  }

  dispose() {
    for (const t of this.talking.values()) clearTimeout(t.timer);
    this.talking.clear();
  }
}

/** 一个人同一时间只能跟一位同事当面说话：别人正找他时先等着，免得一群人围着同一张桌子 */
class Mutex {
  private tail: Promise<void> = Promise.resolve();
  lock(): Promise<() => void> {
    let release!: () => void;
    const mine = new Promise<void>((r) => { release = r; });
    const prev = this.tail;
    this.tail = prev.then(() => mine);
    return prev.then(() => release);
  }
}

/** 最多 limit 个一起跑；有一个抛错就整体失败（会话随后停止，剩下的看到 ended 自己收手） */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(lanes);
}

/** 在一句话里按名字找人：先出现的在前，同一处先认名字长的 */
export function findPeople(text: string, pool: Participant[]): Participant[] {
  return pool
    .map((p) => ({ p, at: text.indexOf(p.persona.name) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at || b.p.persona.name.length - a.p.persona.name.length)
    .map((h) => h.p)
    .filter((p, i, list) => list.indexOf(p) === i);
}

/** 冒号后面的内容；没有冒号返回空串 */
const afterColon = (line: string) => {
  const i = line.search(/[：:]/);
  return i >= 0 ? line.slice(i + 1).trim() : '';
};
const lines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** 「找 扳手：接口什么时候能定？」→ 找谁、问什么；「直接开工」或认不出名字返回 null */
export function parseConsult(text: string, pool: Participant[]): { who: Participant; question: string } | null {
  const line = lines(text).find((l) => /找/.test(l)) ?? '';
  if (!line) return null;
  const head = line.split(/[：:]/)[0];
  const who = findPeople(head, pool)[0] ?? findPeople(line, pool)[0];
  const question = clip(afterColon(line) || line.replace(/^.*?找\s*/, '').replace(who?.persona.name ?? '', '').trim(), 80);
  return who && question ? { who, question } : null;
}

/** 第一版末尾那行「请 照妖镜 评审」：认出评审人，并从正文里去掉这一行 */
export function parseDraft(text: string, pool: Participant[]): { text: string; reviewer?: Participant } {
  const all = text.split(/\r?\n/);
  for (let i = all.length - 1; i >= 0; i--) {
    const line = all[i].trim();
    if (!line) continue;
    if (!/评审|帮我看|把关/.test(line)) break;
    const reviewer = findPeople(line, pool)[0];
    if (!reviewer) break;
    const rest = all.slice(0, i).join('\n').trim();
    return { text: rest || text.trim(), reviewer };
  }
  return { text: text.trim() };
}

/** 「叫 拼图、齿轮：登录态谁来存？」→ 叫谁、对齐什么；「不用开会」或认不出名字返回 null */
export function parseSync(text: string, pool: Participant[]): { people: Participant[]; issue: string } | null {
  const line = lines(text).find((l) => /叫/.test(l)) ?? '';
  if (!line) return null;
  const people = findPeople(line.split(/[：:]/)[0], pool).slice(0, 3);
  if (!people.length) return null;
  return { people, issue: clip(afterColon(line) || '把各部分的衔接对齐', 80) };
}

/** 每人最多评审几份：人多时摊开，别全压在一个人身上 */
const reviewCap = (authors: number) => (authors > 3 ? 2 : authors);

/** 定评审人：先按作者自己点的人，点的是自己、点了负责人或那人已经排满，就换成手上最空的同事；只有一位成员时由负责人评审 */
export function assignReviewers(authors: Participant[], members: Participant[], wanted: Map<string, Participant | undefined>, lead: Participant) {
  const load = new Map<string, number>();
  const cap = reviewCap(authors.length);
  const out = new Map<string, Participant>();
  authors.forEach((a, i) => {
    const peers = members.filter((m) => m !== a);
    if (!peers.length) { out.set(a.agentId, lead); return; }
    const want = wanted.get(a.agentId);
    const free = (p: Participant) => (load.get(p.agentId) ?? 0) < cap;
    let r = want && want !== a && want !== lead && peers.includes(want) && free(want) ? want : undefined;
    if (!r) {
      // 从作者后面一位开始找手上最空的人，同样空的取靠前的
      const order = [...members.slice(i + 1), ...members.slice(0, i)].filter((m) => m !== a);
      r = order.reduce((best, m) => ((load.get(m.agentId) ?? 0) < (load.get(best.agentId) ?? 0) ? m : best), order[0]);
    }
    load.set(r.agentId, (load.get(r.agentId) ?? 0) + 1);
    out.set(a.agentId, r);
  });
  return out;
}

/**
 * 工作 · 创造项目：像真实公司那样干活。
 * 1 立项派活：全组错开起身、围到中央交换台，人到齐了负责人才讲拆分思路，讲完大家回工位，文件经交换台发下去；
 * 2 分头干活：大家同时开工，需要别人配合的走到对方工位当面问，问完回来写第一版交出来（气泡里看要点，全文按文件进记录）；
 * 3 互相评审：第一版交给自己点的同事，同事看完走过来当面提意见，作者采纳或反驳，改出第二版；
 * 4 定稿交付：负责人对一遍各部分，有冲突就叫上相关的人去会议室对齐、当场拍板，最后在交换台前宣布交付。
 * 模型照样并行地想；什么时候开口、起身、交文件由 Stage 按现实的规矩排（见上面 Stage 的说明）。
 */
export async function runWorkFlow(d: WorkDesk) {
  const { lead, members, presence } = d;
  const everyone = [lead, ...members];
  const name = (p: Participant) => p.persona.name;
  const requireAnswer = (text: string | null, p: Participant, step: string) => {
    if (text === null && !d.ended()) throw new Error(`${name(p)} 没能完成${step}，本次工作未交付`);
  };
  const nap = (ms: number) => d.wait(ms * d.pace);
  const tasks = new Map<string, string>();
  const taskOf = (p: Participant) => tasks.get(p.agentId) ?? '自己负责的部分';
  const others = (p: Participant) => everyone.filter((x) => x !== p);
  const intro = (ps: Participant[]) => ps.map((x) => `${name(x)}（${x.persona.identity}${x === lead ? '，负责人' : ''}）`).join('、');

  const stage = new Stage(d, d.pace);
  /** 谁离开了工位、在哪：和前端用同一个 placeAway 推算，走路时间才对得上 */
  let away: Record<string, Away> = {};

  /**
   * 当着 floor 里的人说一句（默认是自己和说话对象）：等他们台上都空下来、屏幕有空位放气泡再开口。
   * doc：交出来的文件（第一版），同样出气泡，另外和上一份错开交
   */
  const speak = (p: Participant, text: string, opts: { to?: Participant; tag?: string; floor?: Participant[]; doc?: boolean } = {}) =>
    stage.claim(opts.floor ?? (opts.to ? [p, opts.to] : [p]), { bubble: true, post: opts.doc }, () => {
      d.say(p, text, { to: opts.to, tag: opts.tag, doc: opts.doc });
      return { who: p, ms: readMs(text) };
    });
  /** 起身去某处：自己（以及 after 里的人）话都说完了才走，走的这段时间占着他 */
  const go = (p: Participant, to: Spot, after: Participant[] = []) =>
    stage.claim([p, ...after], {}, () => {
      const next = placeAway(d.scene, everyone, away, p.agentId, typeof to === 'string' ? to : to.agentId);
      const ms = walkMs(spotOf(d.scene, p, away), spotOf(d.scene, p, next));
      away = next;
      d.move(p, to);
      return { who: p, ms };
    });
  /** 一起去站会或会议室：错开起身，各走各的；到齐由之后的发言（floor 是全体到场的人）来等 */
  const gather = async (people: Participant[], to: 'huddle' | 'meeting', action: string) => {
    for (const [i, p] of people.entries()) {
      if (d.ended()) return;
      if (i) await nap(STAGGER_MS);
      presence.set(p, 'idle', action);
      await go(p, to);
    }
  };
  /** 散开回工位：等最后一句话看完，再错开起身 */
  const disperse = async (people: Participant[], action?: string) => {
    await stage.claim(people, {}, () => {});
    for (const [i, p] of people.entries()) {
      if (d.ended()) return;
      if (i) await nap(STAGGER_MS);
      await go(p, 'desk');
      if (action) presence.set(p, 'idle', action);
    }
  };

  /** 当面谈：两个人都有空了，a 走到 b 的工位旁，谈完、听完再回自己工位 */
  const desks = new Map(everyone.map((p) => [p.agentId, new Mutex()]));
  const meet = async (a: Participant, b: Participant, talk: () => Promise<void>) => {
    const pair = [a, b].sort((x, y) => everyone.indexOf(x) - everyone.indexOf(y));
    const releases: Array<() => void> = [];
    for (const p of pair) releases.push(await desks.get(p.agentId)!.lock());
    let finished = false;
    try {
      await d.gate();
      if (d.ended()) return;
      await go(a, b);
      if (d.ended()) return;
      await talk();
      finished = true;
    } finally {
      // 正常谈完：等对方的话也看完再走；出错了直接回去，不让报错再多等几秒
      if (!d.ended()) {
        if (finished) await go(a, 'desk', [b]);
        else { away = placeAway(d.scene, everyone, away, a.agentId, 'desk'); d.move(a, 'desk'); }
      }
      releases.reverse().forEach((r) => r());
    }
  };

  // ---------- 1 立项派活 ----------
  d.beginRound(1);
  await d.drainUser();
  if (d.ended()) return;
  const roster = members.map((m, i) => `- m${i + 1}：${whoIs(m)}`).join('\n');
  // 大家往交换台走的时候，负责人已经在想怎么拆
  const planning = d.think(lead,
    `第 1 轮「${d.label(1)}」：全组围在中央交换台开站会，你是负责人。用户的需求是「${d.request}」。请据此拆分工作，给下面每位成员各派一项具体任务，需求不清楚的地方写成合理假设；大家接下来会分头干活、互相讨论和评审，最后由你定稿交付：\n${roster}\n` +
    '先用一两句话跟大家说明拆分思路（不超过 100 字），再单独输出一个 JSON 代码块：\n```json\n{"assignments":[{"member":"m1","task":"不超过 30 字的任务"}]}\n```',
    { state: 'thinking', action: '拆分任务' });
  await gather(everyone, 'huddle', '站会');
  const plan = await planning;
  requireAnswer(plan, lead, '派活');
  if (d.ended()) return;
  const parsed = plan ? extractJson(plan) : null;
  const assignments: any[] = Array.isArray(parsed?.json?.assignments) ? parsed!.json.assignments : [];
  members.forEach((m, i) => {
    const a = assignments.find((x) => x?.member === `m${i + 1}`) ?? assignments[i];
    tasks.set(m.agentId, clip(String(a?.task || `从「${m.persona.knowledge[0] ?? m.persona.name}」角度处理用户的需求`), 40));
  });
  const pitch = parsed?.rest || (plan && !parsed ? plan : '我来拆分这个需求：每人认领一块，有问题直接找对应的同事，写完互相评审。');
  await speak(lead, pitch, { tag: '站会', floor: everyone });
  await disperse(everyone);
  presence.set(lead, 'working', '盯进度');
  for (const m of members) {
    if (d.ended()) return;
    const t = taskOf(m);
    d.task({ title: t, from: lead.agentId, to: m.agentId, status: 'assigned' });
    d.note(lead, `→ 派给 ${name(m)}：${t}`, m);
    presence.set(m, 'working', '处理 ' + clip(t, 12));
    await nap(450);
  }

  // ---------- 2 分头干活 ----------
  d.beginRound(2);
  const drafts = new Map<string, string>();
  const wanted = new Map<string, Participant | undefined>();
  await pool(members, d.parallel, async (m) => {
    await d.drainUser();
    if (d.ended()) return;
    const t = taskOf(m);
    const intent = await d.think(m,
      `第 2 轮「${d.label(2)}」：大家回到工位分头干活。负责人派给你的任务是「${t}」。动手之前想一想：要不要先去找哪位同事当面对一下——比如要对方的接口、数据、设计、排期，或者需要他的专业判断？真需要才去，最多找一位。\n` +
      `同事：${intro(others(m))}\n` +
      '需要就只输出一行：找 名字：要当面问他的话（口语，不超过 60 字）\n不需要就只输出：直接开工',
      { state: 'working', action: '琢磨 ' + clip(t, 10) });
    requireAnswer(intent, m, '开工准备');
    if (intent === null || d.ended()) return;
    const ask = parseConsult(intent, others(m));
    if (ask) {
      await meet(m, ask.who, async () => {
        await speak(m, ask.question, { to: ask.who, tag: '找' + name(ask.who) + '讨论' });
        // 问题还挂在气泡里时对方就在想了；回答等问题看完才出来
        const answer = await d.think(ask.who,
          `${name(m)} 走到你工位旁，当面问你：「${ask.question}」\n他手上的任务是「${t}」。结合你的专业和你自己手上的活，当面回答他：给具体的信息、建议或判断，有前提就说清，也可以顺带提醒一句他没想到的。不超过 100 字。`,
          { state: 'thinking', action: '想怎么回答' + name(m) });
        requireAnswer(answer, ask.who, '当面讨论');
        if (answer !== null && !d.ended()) await speak(ask.who, answer, { to: m, tag: '回答' + name(m) });
      });
    }
    await d.drainUser();
    if (d.ended()) return;
    const draft = await d.think(m,
      `现在动手写你负责的「${t}」的第一版${ask ? `（用上刚才和${name(ask.who)}当面对的结果）` : ''}：直接给结论、方案要点和关键依据，不超过 200 字。\n` +
      '写完另起一行，写「请 名字 评审」，名字是最适合帮你挑毛病的一位同事（不能是你自己）。',
      { state: 'working', action: '写第一版' });
    requireAnswer(draft, m, '第一版');
    if (draft === null || d.ended()) return;
    const { text, reviewer } = parseDraft(draft, others(m));
    drafts.set(m.agentId, text);
    wanted.set(m.agentId, reviewer);
    // 写好的方案交出来：气泡里看要点，全文按文件进记录；几份第一版错开交，不挤在同一刻
    await speak(m, text, { tag: '第一版', doc: true });
    presence.set(m, 'idle', '第一版写好了');
  });
  if (d.ended()) return;

  // ---------- 3 互相评审 ----------
  d.beginRound(3);
  const authors = members.filter((m) => drafts.has(m.agentId));
  const reviewers = assignReviewers(authors, members, wanted, lead);
  authors.forEach((m) => presence.set(m, 'idle', '等评审'));
  await pool(authors, d.parallel, async (m) => {
    await d.drainUser();
    if (d.ended()) return;
    const r = reviewers.get(m.agentId)!;
    const t = taskOf(m);
    d.task({ title: t, from: m.agentId, to: r.agentId, status: 'review' });
    d.note(m, `→ 送 ${name(r)} 评审：${clip(t, 20)}`, r);
    const review = await d.think(r,
      `第 3 轮「${d.label(3)}」：${name(m)} 把他负责的「${t}」第一版交给你评审：\n「${drafts.get(m.agentId)}」\n` +
      '像真实同事做评审那样：指出最关键的 1~2 个问题，并给出具体改法；确实没大问题，就说清好在哪、还能怎么更好。待会儿你会走到他工位旁当面说，不超过 120 字。',
      { state: 'thinking', action: '看' + name(m) + '的第一版' });
    requireAnswer(review, r, '评审');
    if (review === null || d.ended()) return;
    await meet(r, m, async () => {
      await speak(r, review, { to: m, tag: '评审' + name(m) });
      const revised = await d.think(m,
        `${name(r)} 走到你工位旁，当面给了评审意见：「${review}」\n像真实的同事讨论那样回应：同意的就说怎么改，并给出第二版的要点；不同意的就说清理由，给出你的做法。不超过 150 字。`,
        { state: 'working', action: '改第二版' });
      requireAnswer(revised, m, '第二版');
      if (revised !== null && !d.ended()) await speak(m, revised, { to: r, tag: '第二版' });
    });
    presence.set(m, 'idle', '第二版改好了');
  });
  if (d.ended()) return;

  // ---------- 4 定稿交付 ----------
  d.beginRound(4);
  await d.drainUser();
  const check = await d.think(lead,
    `第 4 轮「${d.label(4)}」：大家都按评审意见改出了第二版（见上面的发言）。你是负责人，交付前对一遍：各部分之间有没有冲突、缺口，或者谁依赖的东西没对上？\n` +
    '有的话，挑最关键的一处，叫上需要一起对齐的同事（1～3 位）去会议室开个小会，只输出一行：叫 名字1、名字2：要对齐的问题（不超过 60 字）\n各部分已经对得上，就只输出：不用开会',
    { state: 'thinking', action: '对一遍各部分' });
  requireAnswer(check, lead, '交付检查');
  if (d.ended()) return;
  const sync = check ? parseSync(check, members) : null;
  if (sync) {
    const crew = [lead, ...sync.people];
    await gather(crew, 'meeting', '会议室');
    await speak(lead, `${sync.people.map(name).join('、')}，咱们对一下：${sync.issue}`, { tag: '会议室', floor: crew });
    for (const p of sync.people) {
      await d.drainUser();
      if (d.ended()) return;
      // 轮到谁谁才想：要接着前面的人刚说的话往下说
      const line = await d.think(p,
        `负责人把你叫进会议室对齐：「${sync.issue}」\n说清你这边的情况和你愿意怎么调整；前面的人说过的不用重复，有分歧就直说。不超过 100 字。`,
        { state: 'thinking', action: '想怎么对齐' });
      requireAnswer(line, p, '会议对齐');
      if (line !== null && !d.ended()) await speak(p, line, { tag: '对齐', floor: crew });
    }
    await d.drainUser();
    const decision = await d.think(lead, '会议室里大家说完了。你是负责人，当场拍板：这件事怎么定、谁改什么，不超过 80 字。', { state: 'thinking', action: '拍板' });
    requireAnswer(decision, lead, '会议决策');
    if (decision !== null && !d.ended()) await speak(lead, decision, { tag: '拍板', floor: crew });
    if (d.ended()) return;
    await disperse(crew);
  }
  // 大家把改好的部分经交换台交到负责人那里，然后围过来听负责人宣布交付
  await stage.claim(everyone, {}, () => {});
  for (const m of members) {
    if (d.ended()) return;
    d.task({ title: '交付物', from: m.agentId, to: lead.agentId, status: 'done' });
    presence.set(m, 'idle', '已交付');
    await nap(300);
  }
  await nap(1200);
  await d.drainUser();
  if (d.ended()) return;
  const finishing = d.think(lead,
    `大家把改好的部分都交上来了，你在中央交换台前向全组宣布最终交付：交付物是什么、关键取舍${sync ? '、刚才会议室定下的事' : ''}；不用把每个人的话再复述一遍，不超过 200 字。`,
    { state: 'thinking', action: '定稿' });
  await gather(everyone, 'huddle', '站会');
  const final = await finishing;
  requireAnswer(final, lead, '定稿');
  if (final !== null && !d.ended()) await speak(lead, final, { tag: '交付', floor: everyone });
  if (d.ended()) return;
  await disperse(everyone, '收工');
}
