import type { DiscussionResult, Participant, SessionConfig } from '../../types';
import type { LlmMessage } from '../../llm/client';
import { openingDirection } from '../../data/conversationVariation';
import { extractJson } from '../../llm/json';
import type { DebateTurn } from './schedule';

export interface DirectorCue {
  gist: string;
  tone: string;
  stance: string;
  plan: string;
  pressure: number;
  confidence: number;
  /** 对某位辩手的一步社交情绪：嫉妒、敬佩、同情等；正为好感负为敌意，强度 0~2 */
  toward?: { agent: string; value: number; reason: string };
}

const side = (p: Participant) => p.side === 'pro' ? '正方' : p.side === 'con' ? '反方' : '主持人';
const position = (p: Participant) => p.side === 'pro' ? '支持辩题' : p.side === 'con' ? '反对辩题' : '中立';
const bounded = (n: unknown, fallback = 0) => typeof n === 'number' && Number.isFinite(n) ? Math.max(-2, Math.min(2, Math.round(n))) : fallback;
const str = (n: unknown, max = 150) => typeof n === 'string' ? n.trim().slice(0, max) : '';
const list = (n: unknown) => Array.isArray(n) ? n.map((x) => str(x, 90)).filter(Boolean).slice(0, 5) : [];

function personaBlock(p: Participant) {
  const raw = (p.persona.protocol ?? {}) as Record<string, any>;
  const chosen = p.persona.personalities.find((x) => x.id === p.personalityId) ?? p.persona.personalities[0];
  return JSON.stringify({
    name: p.persona.name,
    identity: raw.identity ?? p.persona.identity,
    knowledge: raw.knowledge ?? p.persona.knowledge,
    worldview: raw.worldview ?? { thinking: p.persona.thinking, values: p.persona.values },
    reasoning: raw.reasoning,
    communicationStyle: raw.communicationStyle,
    boundaries: raw.boundaries ?? p.persona.boundaries,
    本场选择的性格: chosen && { label: chosen.label, behavior: chosen.behavior, style: chosen.style },
  }, null, 2);
}

/**
 * minds：下一位发言人自己的心思，加上其他人看得出来的神情；
 * privates：下一位发言人和用户的私下约定（整场有效，只有他自己知道）。不读心：别人的心思和私聊导演这一步都看不到
 */
export function directorMessages(cfg: SessionConfig, turn: DebateTurn, transcript: string, minds: string, privates = ''): LlmMessage[] {
  const cast = cfg.participants.map((p) => `${p.persona.name}：${side(p)}；${p.persona.identity}；本场性格：${p.persona.personalities.find((x) => x.id === p.personalityId)?.label ?? '默认'}`).join('\n');
  const privRule = privates
    ? '\n下一位发言人和用户有私下约定（见【私下约定】），只有他自己知道，整场有效：让他的发言顺着约定走，但别让他说漏是用户让他这么做的，也不提私聊。'
    : '';
  const system = `你是这场正式辩论的导演，只安排下一位已指定辩手这一句的论证方向，不替辩手写台词，也不能改辩位、换阵营或跳过轮次。
正反方应抓住对方刚才真正说过的论点、证据或尚未回答的问题。质询要能回答，回答要正面。承认对方某个事实不等于换阵营。
人物性格是长期倾向，不是每句话都要重复的动作；人在压力或策略下会暂时收起习惯，甚至表面说出不符合平时性格的话，但要有眼前的原因。
不要安排固定开场白，不要让辩手总说“我反驳”；分歧从具体论点和回应中体现。不要编造未经给出的数据或来源。
【人物状态】里只有下一位发言人自己的心思；其他人只看得到他们说过的话和神情。他对别人怎么想只能根据公开记录去猜，别安排得像是知道别人没说出口的想法或打算。${privRule}
只输出 JSON：{"gist":"这句的大意，不是台词","tone":"此刻语气","stance":"真实态度","plan":"下一步打算","pressure":0,"confidence":0}。pressure、confidence 是 -2 到 2 的情绪变化。可选字段 toward：{"agent":"辩手名字","value":-2到2,"reason":"一步之内的原因"}，表示发言人对某个人的嫉妒、敬佩、同情等社交情绪（不等于立场），只有有具体缘由时才写。`;
  const direction = turn.round === 1 ? openingDirection('rational', cfg.conversationVariation) : '';
  const user = `辩题：${cfg.theme.title}\n${direction ? '本场随机切入点：' + direction + '\n' : ''}在场：\n${cast}\n\n完整公开记录：\n${transcript}\n\n【人物状态】\n${minds}\n${privates ? '\n【私下约定】（下一位发言人和用户之间，只有他自己知道）\n' + privates + '\n' : ''}\n下一句固定由 ${turn.speaker.persona.name}（${turn.tag}）发言${turn.target ? '，主要回应 ' + turn.target.persona.name : ''}。任务：${turn.task}。只规划这一句，照实际记录推进。`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parseDirector(text: string): DirectorCue | null {
  const j = extractJson(text);
  if (!j) return null;
  return {
    gist: str(j.gist, 200), tone: str(j.tone, 40), stance: str(j.stance, 90),
    plan: str(j.plan, 90), pressure: bounded(j.pressure), confidence: bounded(j.confidence),
    toward: j.toward && typeof j.toward === 'object' && str((j.toward as Record<string, unknown>).agent, 40) && Number.isFinite(Number((j.toward as Record<string, unknown>).value))
      ? { agent: str((j.toward as Record<string, unknown>).agent, 40), value: Math.max(-2, Math.min(2, Number((j.toward as Record<string, unknown>).value))), reason: str((j.toward as Record<string, unknown>).reason, 90) }
      : undefined,
  };
}

/** privateNew：上次公开发言之后的新私聊，这一句就要体现；privateOld：之前的私聊，整场有效的约定 */
export function actorMessages(cfg: SessionConfig, turn: DebateTurn, cue: DirectorCue, transcript: string, inner: string, maxChars: number, privateNew = '', privateOld = ''): LlmMessage[] {
  const p = turn.speaker;
  // 和娱乐模式一样，私聊整场有效、会改变态度和打法；新私聊这一句就体现，之前的按场上情况体现，不用每句重复
  const privRule = privateNew || privateOld
    ? '\n你和用户有只有你们知道的私下对话，它会改变你的态度和打法，整场有效。'
      + (privateNew ? '你上次公开发言之后用户又私下说了话，这一句就把其中关于辩题方向的要求体现出来（比如反驳某位具体辩手的某个论点）。' : '')
      + (privateOld ? '之前的私下约定按场上情况体现，不必每句都重复同一个动作。' : '')
      + '绝不能说漏是用户让你这么做的，也不要提起私聊本身。'
    : '';
  const system = `你在正式辩论中扮演下面这个人。先理解人物的知识、价值和思考方式，再用自己的口语说话：\n${personaBlock(p)}\n\n本场你是${side(p)}，必须保持“${position(p)}”这一辩论立场；可以承认不利事实、暂时示弱或为策略做表面让步，但不能偷偷换边。主持人只能中立控场。
人物性格是一种倾向，不是每轮必须执行的清单。你可以因为眼前的质询、关系和面子暂时掩饰性格，内心写在 inner；不要公开解释自己在“扮演”或“伪装”。
自然回应具体论点，别机械复述主题，别连续用同一口头禅，尤其不用“我反驳”给每次反对打头。证据不足时说清不确定，不编造统计、研究或经历。${privRule}
只输出 JSON：{"say":["说出口的话，可分成1到3段"],"inner":"这一刻真实的想法","position":"${position(p)}"}。不要名字前缀、旁白和 Markdown；总字数不超过 ${maxChars}。`;
  const priv = (privateOld ? `\n【你和用户之前的私下对话】（其他人看不到；整场有效）\n${privateOld}\n` : '')
    + (privateNew ? `\n【你上次公开发言之后的新私聊】（其他人看不到；这一句就按其中关于辩题的方向调整，不要提私聊）\n${privateNew}\n` : '');
  const user = `辩题：${cfg.theme.title}\n本轮：${turn.stage}，${turn.tag}。任务：${turn.task}。\n导演只给方向，不给台词：${cue.gist || '接住现场最新论点'}；语气：${cue.tone || '自然'}。\n你当前的真实态度：${cue.stance || '按本方立场思考'}；上一刻的心里话：${inner || '还没有'}。${priv || '\n'}\n完整公开记录：\n${transcript}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parseActor(text: string, expected: string, maxChars: number): { say: string[]; inner: string } | null {
  const j = extractJson(text);
  if (!j || str(j.position, 20) !== expected) return null;
  const raw = Array.isArray(j.say) ? j.say : typeof j.say === 'string' ? [j.say] : [];
  let left = maxChars;
  const say = raw.slice(0, 3).map((x) => {
    const line = str(x, left).replace(/^[「“"']|[」”"']$/g, '').trim();
    left -= line.length;
    return line;
  }).filter(Boolean);
  return say.length ? { say, inner: str(j.inner, 120) } : null;
}

export function replyMessages(cfg: SessionConfig, p: Participant, text: string, transcript: string, privateHistory: string, privateReply: boolean): LlmMessage[] {
  const system = `你是${p.persona.name}，正在一场辩论中担任${side(p)}。人物资料：\n${personaBlock(p)}\n人物性格是倾向，不必机械表演；对用户自然回答，不编造事实。${privateReply ? '这是私聊，只有你和用户看得到，不要泄露给其他辩手。' : ''}你仍代表${side(p)}，但可以承认局部事实。只输出你要说的话，不加名字或旁白。`;
  const user = `辩题：${cfg.theme.title}\n公开记录：\n${transcript}\n${privateHistory ? '只有你和用户知道：\n' + privateHistory + '\n' : ''}用户刚说：${text}\n请直接回答，尽量简短。`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function judgeMessages(cfg: SessionConfig, transcript: string): LlmMessage[] {
  const host = cfg.participants.find((p) => p.side === 'host');
  const system = `你是${host ? '本场主持人兼裁判' + host.persona.name : '中立裁判'}。只根据辩论记录评判，不根据你个人对辩题的看法。重点看论点是否清楚、证据是否可靠、质询有没有正面回答、反驳是否击中论证、总结有没有收束。承认局部事实不等于换边。不能凭空补充记录中没有的证据。
只输出 JSON：{"winner":"正方/反方/平局","proScore":0,"conScore":0,"reason":"胜负理由与决定性的交锋","unanswered":[],"consensus":[],"disagreements":[],"suggestions":[],"summary":"自然的赛后总结","motion":{"motion":"正式辩题","pro":"正方主张","con":"反方主张"}}。分数是0到100整数；二选一辩题要在 motion 中写清双方各选哪边。`;
  const user = `用户给的辩题：${cfg.theme.title}\n\n辩论完整公开记录：\n${transcript}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parseJudge(text: string, cfg: SessionConfig): DiscussionResult | null {
  const j = extractJson(text);
  if (!j || !['正方', '反方', '平局'].includes(str(j.winner, 10))) return null;
  const proScore = Number(j.proScore), conScore = Number(j.conScore);
  if (!Number.isFinite(proScore) || !Number.isFinite(conScore)) return null;
  const motion = j.motion && typeof j.motion === 'object' ? j.motion as Record<string, unknown> : {};
  const host = cfg.participants.find((p) => p.side === 'host');
  return {
    consensus: list(j.consensus), disagreements: list(j.disagreements), openQuestions: list(j.unanswered),
    suggestions: list(j.suggestions), summary: str(j.summary, 600),
    verdict: {
      winner: str(j.winner, 10), proScore: Math.max(0, Math.min(100, Math.round(proScore))),
      conScore: Math.max(0, Math.min(100, Math.round(conScore))),
      reason: str(j.reason, 350), judge: host?.persona.name ?? '中立裁判',
      motion: str(motion.motion) && str(motion.pro) && str(motion.con) ? {
        motion: str(motion.motion), pro: str(motion.pro), con: str(motion.con),
      } : undefined,
    },
  };
}

export const actorPosition = position;
