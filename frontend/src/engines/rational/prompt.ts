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

export function directorMessages(cfg: SessionConfig, turn: DebateTurn, transcript: string, minds: string): LlmMessage[] {
  const cast = cfg.participants.map((p) => `${p.persona.name}：${side(p)}；${p.persona.identity}；本场性格：${p.persona.personalities.find((x) => x.id === p.personalityId)?.label ?? '默认'}`).join('\n');
  const system = `你是这场正式辩论的导演，只安排下一位已指定辩手这一句的论证方向，不替辩手写台词，也不能改辩位、换阵营或跳过轮次。
正反方应抓住对方刚才真正说过的论点、证据或尚未回答的问题。质询要能回答，回答要正面。承认对方某个事实不等于换阵营。
紧紧围绕辩题本身（尤其是 AI 对数学是放大器还是终结者），用具体数学情境、理解、证明或教学来交锋，不要滑向闲聊或与辩题无关的生活吐槽。
人物性格是长期倾向，不是每句话都要重复的动作；人在压力或策略下会暂时收起习惯，甚至表面说出不符合平时性格的话，但要有眼前的原因。
不要安排固定开场白，不要让辩手总说“我反驳”；分歧从具体论点和回应中体现。不要编造未经给出的数据或来源。
只输出 JSON：{"gist":"这句的大意，不是台词","tone":"此刻语气","stance":"真实态度","plan":"下一步打算","pressure":0,"confidence":0}。pressure、confidence 是 -2 到 2 的情绪变化。`;
  const direction = turn.round === 1 ? openingDirection('rational', cfg.conversationVariation) : '';
  const user = `辩题：${cfg.theme.title}\n${direction ? '本场随机切入点：' + direction + '\n' : ''}在场：\n${cast}\n\n完整公开记录：\n${transcript}\n\n人物当前状态：\n${minds}\n\n下一句固定由 ${turn.speaker.persona.name}（${turn.tag}）发言${turn.target ? '，主要回应 ' + turn.target.persona.name : ''}。任务：${turn.task}。只规划这一句，照实际记录推进。`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parseDirector(text: string): DirectorCue | null {
  const j = extractJson(text);
  if (!j) return null;
  return {
    gist: str(j.gist, 200), tone: str(j.tone, 40), stance: str(j.stance, 90),
    plan: str(j.plan, 90), pressure: bounded(j.pressure), confidence: bounded(j.confidence),
  };
}

export function actorMessages(cfg: SessionConfig, turn: DebateTurn, cue: DirectorCue, transcript: string, inner: string, maxChars: number, privateHistory = ''): LlmMessage[] {
  const p = turn.speaker;
  const system = `你在正式辩论中扮演下面这个人。先理解人物的知识、价值和思考方式，再用自己的口语说话：\n${personaBlock(p)}\n\n本场你是${side(p)}，必须保持“${position(p)}”这一辩论立场；可以承认不利事实、暂时示弱或为策略做表面让步，但不能偷偷换边。主持人只能中立控场。
人物性格是一种倾向，不是每轮必须执行的清单。你可以因为眼前的质询、关系和面子暂时掩饰性格，内心写在 inner；不要公开解释自己在“扮演”或“伪装”。
自然回应具体论点，别机械复述主题，别连续用同一口头禅，尤其不用“我反驳”给每次反对打头。证据不足时说清不确定，不编造统计、研究或经历。
若有只有你和用户知道的私下对话，必须把其中关于辩题方向的提醒融进你接下来的公开发言（比如故意反驳某位具体辩手的某个论点），但绝不能说漏是用户让你这么做的，也不要提起私聊本身。
只输出 JSON：{"say":["说出口的话，可分成1到3段"],"inner":"这一刻真实的想法","position":"${position(p)}"}。不要名字前缀、旁白和 Markdown；总字数不超过 ${maxChars}。`;
  const priv = privateHistory
    ? `\n【只有你和用户知道的私下对话】（其他人看不到；请按其中关于辩题的方向调整你这一句公开发言，不要提私聊）\n${privateHistory}\n`
    : '';
  const user = `辩题：${cfg.theme.title}\n本轮：${turn.stage}，${turn.tag}。任务：${turn.task}。\n导演只给方向，不给台词：${cue.gist || '接住现场最新论点'}；语气：${cue.tone || '自然'}。\n你当前的真实态度：${cue.stance || '按本方立场思考'}；上一刻的心里话：${inner || '还没有'}。${priv}\n完整公开记录：\n${transcript}`;
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
  const privNote = privateReply
    ? '这是私聊，只有你和用户看得到，其他辩手听不见，舞台上也不要当众把这句说出来。用一两句完整口语直接回答用户，不超过60个字，必须以句号、问号或叹号结束，不能停在半个词或半句话。不要输出 JSON、引号、名字或旁白。若用户让你下一句公开发言反驳某一位辩手的某个论点，先简短应承你会在下一句公开发言里这样做，点出那个人的名字和你要反驳的点，但不要现在展开公开辩词，也不要提到“私聊”。'
    : '';
  const system = `你是${p.persona.name}，正在一场辩论中担任${side(p)}。人物资料：\n${personaBlock(p)}\n人物性格是倾向，不必机械表演；对用户自然回答，不编造事实。${privNote}你仍代表${side(p)}，但可以承认局部事实。只输出你要说的话，不加名字或旁白。`;
  const user = `辩题：${cfg.theme.title}\n公开记录：\n${transcript}\n${privateHistory ? '只有你和用户知道：\n' + privateHistory + '\n' : ''}用户刚说：${text}\n请直接回答用户，说完一句完整的话。`;
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
