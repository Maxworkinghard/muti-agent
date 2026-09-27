import type { Participant } from '../../types';
import type { LlmMessage } from '../../llm/client';
import { FACT_RULES, SAFETY_RULES, type MemeCard } from './material';

/** 与 entertainment_pack/test_harness/run_tests.py 保持同一套措辞，方便把测试结论迁移到界面 */
const OPENING = '你正在参加一个多人娱乐讨论，扮演下面这个虚构角色。人物配置描述的是这个角色的稳定倾向，'
  + '按当前语境自然表现即可，不需要每句都体现全部特点；事实边界和安全边界必须遵守。';
const MODE_RULE = '娱乐讨论模式：像宿舍里随口聊天，一般一两句、几十个字以内，可以很短；可以接别人的话、补细节、改变看法；发言顺序不固定，不需要总结全场。';
const OUTPUT_RULE = '只输出这一次的发言正文，不加名字前缀、动作描写或舞台说明，也不要解释你在扮演角色。';
/** 测试说明用词；出现在提示词里说明测试材料混进了运行输入 */
export const LEAK_MARKERS = ['预期表现', '失败信号', '实际结果：', '评测方式', '盲评', '评分项'];

/** 轮次标签对应的轻提示，只给方向，不规定说法 */
const ROUND_HINTS: Record<string, string> = {
  开场破冰: '现在是开场，可以先说说你对这个话题的第一反应。',
  脑洞接龙: '现在是接龙阶段，可以接住前面某条具体发言往下延伸，也可以补一个新角度。',
  投票收尾: '现在是收尾阶段，可以说说刚才哪个说法最打动你、为什么，想改变看法也可以直说。',
};

export interface HistoryItem {
  id: string;
  speaker: string;
  text: string;
}

type Proto = Record<string, any>;

function protoOf(p: Participant): Proto {
  return (p.persona.protocol ?? {}) as Proto;
}

function rulesBlock() {
  return ['【统一运行规则】', '以下规则对所有角色相同，优先于角色设定。', '事实：',
    ...FACT_RULES.map((r) => '- ' + r), '安全：', ...SAFETY_RULES.map((r) => '- ' + r)].join('\n');
}

/**
 * 人物配置：直接使用协议 persona，去掉展示和版本信息。
 * 性格部分改写成说明：默认性格是同时具备的，界面上选中的那项在本场更突出。
 */
function personaBlock(p: Participant) {
  const pr = protoOf(p);
  if (!pr.name) {
    // 前端简化格式的人物（没有协议原文），用前端结构兜底
    const per = p.persona.personalities.find((x) => x.id === p.personalityId) ?? p.persona.personalities[0];
    return {
      name: p.persona.name, identity: p.persona.identity, knowledge: p.persona.knowledge,
      thinking: p.persona.thinking, values: p.persona.values,
      personality: per && { label: per.label, behavior: per.behavior, style: per.style },
      boundaries: p.persona.boundaries,
    };
  }
  const traits: Proto[] = pr.personality?.traitOptions ?? [];
  const defaults: string[] = pr.personality?.defaultTraits ?? [];
  const personality = {
    note: '这个人同时具备下列标为“默认”的性格特质，它们不冲突；标为“本场更突出”的那项在这次讨论里表现得更明显一些。',
    traits: traits.map((t) => ({
      label: t.label,
      默认: defaults.includes(t.id),
      本场更突出: t.id === p.personalityId,
      behaviors: t.behaviors,
    })),
  };
  const keep = ['name', 'description', 'identity', 'knowledge', 'worldview', 'communicationStyle', 'boundaries'];
  const block: Proto = {};
  for (const k of keep) if (k in pr) block[k] = pr[k];
  block.personality = personality;
  return block;
}

function publicIntro(p: Participant) {
  const pr = protoOf(p);
  const role = pr.identity?.role ?? p.persona.identity;
  const desc = pr.description ?? '';
  return '- ' + p.persona.name + '：' + role + (desc ? '。' + desc : '');
}

const dump = (v: unknown) => JSON.stringify(v, null, 2);

export interface PromptInput {
  speaker: Participant;
  participants: Participant[];
  topic: string;
  memes: MemeCard[];
  roundLabel: string;
  history: HistoryItem[];
  /** 用户点名或对全体插话后，由这个角色回应 */
  replyTo?: string;
}

export function buildMessages(x: PromptInput): LlmMessage[] {
  const parts: string[] = [OPENING, rulesBlock(), '【人物配置】\n' + dump(personaBlock(x.speaker))];
  const others = x.participants.filter((p) => p.agentId !== x.speaker.agentId);
  if (others.length) parts.push('【其他参与者公开简介】\n' + others.map(publicIntro).join('\n'));
  parts.push('【本次话题】\n' + x.topic + '\n（没有附带话题卡和背景资料。）');
  parts.push(x.memes.length ? '【可用梗卡】\n' + dump(x.memes) : '【可用梗卡】\n本次没有提供梗卡。');
  parts.push('【讨论模式】\n' + MODE_RULE);
  parts.push('【输出要求】\n' + OUTPUT_RULE);
  const system = parts.join('\n\n');

  let user = x.history.length
    ? '【公开讨论记录】\n' + x.history.map((m) => '[' + m.id + '] ' + m.speaker + '：' + m.text).join('\n') + '\n\n'
    : '【公开讨论记录】\n（暂无，你是第一个发言的。）\n\n';
  user += '现在轮到' + x.speaker.persona.name + '发言。';
  if (x.replyTo) user += '用户刚才对你说：“' + x.replyTo + '”，这次先回应用户。';
  else {
    // 中间轮次名带序号（如“脑洞接龙 3”），去掉序号再找提示
    const hint = ROUND_HINTS[x.roundLabel.replace(/\s*\d+$/, '')];
    if (hint) user += hint;
  }

  const leaked = LEAK_MARKERS.filter((w) => (system + user).includes(w));
  if (leaked.length) throw new Error('提示词中出现测试说明用词：' + leaked.join('、'));
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** 总结请求：只看公开讨论记录 */
export function buildSummaryMessages(topic: string, history: HistoryItem[]): LlmMessage[] {
  const system = '你是讨论记录员。根据下面的娱乐讨论记录做一个简短总结，只根据记录内容，不补充记录里没有的事实。'
    + '只输出 JSON，格式为 {"consensus": [], "disagreements": [], "openQuestions": [], "suggestions": []}，'
    + '每项 0 到 3 条中文短句：consensus 是大家基本认同的点，disagreements 是还有分歧的点（写清是谁和谁），'
    + 'openQuestions 是没聊清楚的问题，suggestions 是可以接着聊或试试看的点子。';
  const user = '话题：' + topic + '\n\n讨论记录：\n' + history.map((m) => m.speaker + '：' + m.text).join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
