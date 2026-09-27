import type { DiscussionResult, Participant, SessionConfig } from '../../types';
import type { LlmMessage } from '../../llm/client';
import type { MoodDef, ReactionInput, Temperament } from '../live/types';
import { extractJson } from '../live/json';
import { FACT_RULES, SAFETY_RULES, type MemeCard } from './material';

const OPENING = '你在一场多人闲聊里扮演下面这个虚构角色。这不是轮流发言的节目：没人安排谁说话，谁想说谁说，也可以一直不说。'
  + '像真人一样，先有反应和情绪，再决定说不说、怎么说。人物配置描述的是这个角色的稳定倾向，按当前语境自然表现即可，'
  + '不需要每句都体现全部特点；事实边界和安全边界必须遵守。';

const CHAT_RULES = [
  '像宿舍里、群聊里随口聊天：一条消息通常几个字到二十来字，最多三十来字；想说的多就拆成两三条短的连着发，别写长段。',
  '可以只发很短的反应，比如“？？？”“哈哈哈哈”“啊这”“不是……”。',
  '情绪决定你怎么说：上头时句子短、语气冲，可能连发，甚至不等对方说完就插嘴；委屈、没面子时可能嘴硬、阴阳怪气，或者干脆不吭声；'
    + '开心时话多、爱接梗；无聊时敷衍几句，或者把话题岔开。',
  '别为了客气附和。有分歧就接着杠，真被说服了再改口，改口也要给自己找台阶，怎么找按你的性格来。',
  '用户是群里的一个真人朋友，不是主持人也不是裁判，你可以同意也可以不同意他；他点名问你时要回应。',
  '每句话都要让人听得出你在接哪一句：挂住记录里某条具体的说法，或者回应用户；不答非所问，也不把别人说过的点子换个说法再说一遍。可以翻旧账，比如“你刚才不是说……”。',
  '只写说出口的话：不加自己的名字前缀、不写动作描写和舞台说明，也不解释你在扮演角色。',
];

/** 测试说明用词；出现在提示词里说明测试材料混进了运行输入 */
export const LEAK_MARKERS = ['预期表现', '失败信号', '实际结果：', '评测方式', '盲评', '评分项'];

type Proto = Record<string, any>;

function protoOf(p: Participant): Proto {
  return (p.persona.protocol ?? {}) as Proto;
}

function rulesBlock() {
  return ['【统一运行规则】', '以下规则对所有角色相同，优先于角色设定。', '事实：',
    ...FACT_RULES.map((r) => '- ' + r), '安全：', ...SAFETY_RULES.map((r) => '- ' + r)].join('\n');
}

/**
 * 人物配置：直接使用协议 persona，去掉展示、版本信息和性情参数（性情另外用话说）。
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
  const keep = ['name', 'description', 'identity', 'knowledge', 'communicationStyle', 'boundaries'];
  const block: Proto = {};
  for (const k of keep) if (k in pr) block[k] = pr[k];
  // worldview 单独处理：blindSpots 是「别人可能拿来挤对他的毛病」，原样塞进配置会被当成要表演的目标
  const wv = pr.worldview as Proto | undefined;
  if (wv && typeof wv === 'object') {
    const { blindSpots, ...rest } = wv;
    block.worldview = rest;
    if (Array.isArray(blindSpots) && blindSpots.length) {
      block.knownBlindSpots = {
        note: '这些毛病他自己也承认，别人可能拿来挤对他；它只是背景，不用每句都表演，被点出来时按人物设定自然承认或找台阶下。',
        blindSpots,
      };
    }
  }
  block.personality = personality;
  return block;
}

function publicIntro(p: Participant) {
  const pr = protoOf(p);
  const role = pr.identity?.role ?? p.persona.identity;
  const desc = pr.description ?? '';
  return '- ' + p.persona.name + '：' + role + (desc ? '。' + desc : '');
}

/** 性情参数翻成话，让模型自己判断情绪时和代码记的账对得上 */
function temperWords(t: Temperament) {
  const out: string[] = [];
  if (t.temper >= 1.2) out.push('脾气急，火气来得快');
  else if (t.temper <= 0.6) out.push('脾气好，不太容易生气');
  if (t.sensitivity >= 1.1) out.push('心思细，容易觉得没面子、受委屈');
  else if (t.sensitivity <= 0.6) out.push('脸皮厚，被笑也不太往心里去');
  if (t.grudge >= 0.6) out.push('记仇，谁刚才怼过你你记得清清楚楚');
  else if (t.grudge <= 0.2) out.push('不记仇，吵完就忘');
  if (t.face >= 0.7) out.push('特别要面子，很难当场认输');
  else if (t.face <= 0.3) out.push('不太在乎输赢，说不过就认');
  if (t.talk >= 0.75) out.push('话多，爱抢话');
  else if (t.talk <= 0.4) out.push('话少，不怎么主动开口');
  if (t.speed >= 1.3) out.push('嘴快');
  return out.length ? out.join('；') + '。' : '普通人的脾气。';
}

function schemaBlock(moods: MoodDef[]) {
  const mood = '{' + moods.map((d) => '"' + d.key + '": 0').join(', ') + '}';
  return [
    '只输出一个 JSON 对象，不要任何别的文字：',
    '{"inner": "", "mood": ' + mood + ', "toward": {}, "stance": "", "hooks": [], "plan": "", "urge": 0, '
      + '"interrupt": false, "cut_after": "", "reply_to": "", "say": [], "react": "", "topic": "", "private_reply": ""}',
    '字段说明：',
    '- inner：你心里的真实反应，一句话，第一人称，25 字以内。',
    '- mood：刚才这一下各种情绪变了多少，-3 到 3 的整数，没变就 0。被戳到、被笑、被否定、被冷落会不爽或委屈；被附和、被逗乐、占了上风会开心；车轱辘话、跟你没关系会无聊。',
    '- toward：你对谁的好感变了多少（-3 到 3），键写名字，用户就写“用户”；没变就 {}。',
    '- stance：你对话题的态度；只有刚开聊或者你真改了看法时才写，否则留空。',
    '- hooks：刚开聊时写一两个你能拿出来说的具体私货（比如你这个角色身上的一件小事），之后留空。',
    '- plan：接下来想干嘛（比如“逮着他前后矛盾不放”），没什么打算就留空。',
    '- urge：你现在有多想开口，0~10。被点名、被戳到、憋着话、有好梗就高；插不上嘴、跟你没关系、懒得理就低。',
    '- interrupt：对方话还没说完你就忍不住要插嘴时才写 true（上头、被冤枉、急着纠正的时候）。',
    '- cut_after：interrupt 为 true 时，照抄对方原话里让你忍不住的那几个字（你听到这里就插进去了），say 只针对这之前听到的内容；否则留空。',
    '- reply_to：你要接的那条消息的编号，比如 "m12"。',
    '- say：要说出口的话，1~3 条短消息；不想说就 []。',
    '- react：不抢话、只是顺口冒出来的小反应（比如“哈哈哈哈”“？”），多数时候留空；say 不为空时留空。',
    '- topic：只有你这句是把话题岔到一个新方向时，写 4~8 个字的新话题名，否则留空。',
    '- private_reply：只有用户私下找你时才写，是你私下回他的一句话；其他时候留空。',
  ].join('\n');
}

const dump = (v: unknown) => JSON.stringify(v, null, 2);

/** 一个人听完最新的话之后的内心反应：system 放不变的人设和规则，user 按“记录 → 私聊 → 状态 → 现在”排，前面的部分能命中缓存 */
export function buildReactionMessages(x: ReactionInput & { memes: MemeCard[]; moods: MoodDef[] }): LlmMessage[] {
  const others = x.cfg.participants.filter((p) => p.agentId !== x.self.agentId);
  const topic = '【本次话题】\n' + (x.cfg.theme.title || '随便聊聊') + '\n（没有附带话题卡和背景资料。）';
  const parts = [
    OPENING,
    rulesBlock(),
    '【人物配置】\n' + dump(personaBlock(x.self)),
    '【你的性情】\n' + temperWords(x.temper),
    '【在场的人】\n' + [...others.map(publicIntro), '- 用户：群里的一个真人朋友，也在聊，不是主持人也不是裁判。'].join('\n'),
    topic,
    x.memes.length ? '【可用梗卡】\n' + dump(x.memes) : '【可用梗卡】\n本次没有提供梗卡。',
    '【闲聊规则】\n' + CHAT_RULES.map((r) => '- ' + r).join('\n'),
    '【输出格式】\n' + schemaBlock(x.moods),
  ];
  // 只查规则、人物配置、梗卡这些静态素材：测试说明混进运行输入只会从这里进来。
  // 话题、用户的话和角色发言是运行时内容，说到“盲评”之类的词很正常，不查
  const leaked = LEAK_MARKERS.filter((w) => parts.some((s) => s !== topic && s.includes(w)));
  if (leaked.length) throw new Error('提示词中出现测试说明用词：' + leaked.join('、'));

  const user = [
    '【聊天记录】（方括号里是编号，最新的在最后）\n' + x.transcript,
    x.privates ? '【只有你和用户知道的私下对话】（其他人看不到，也不知道你们聊过；要不要在公开场合用上，由你决定）\n' + x.privates : '',
    '【你现在的状态】\n' + x.state,
    '【现在】\n' + x.now,
  ].filter(Boolean).join('\n\n');
  return [{ role: 'system', content: parts.join('\n\n') }, { role: 'user', content: user }];
}

/** 散场后的总结：只看公开记录 */
export function buildSummaryMessages(cfg: SessionConfig, log: string): LlmMessage[] {
  const system = '你是这场闲聊的记录员。根据下面的聊天记录做一个简短总结，只根据记录内容，不补充记录里没有的事实。'
    + '只输出 JSON，格式为 {"recap": "", "consensus": [], "disagreements": [], "openQuestions": [], "suggestions": []}：'
    + 'recap 用两三句话说这场聊天的情绪走向——谁跟谁杠上了、谁被说服了、哪句是名场面；'
    + 'consensus 是大家基本认同的点，disagreements 是还有分歧的点（写清是谁和谁），openQuestions 是没聊完的，'
    + 'suggestions 是可以接着聊或者试试看的点子。每个数组 0 到 3 条中文短句。';
  const user = '话题：' + (cfg.theme.title || '随便聊聊') + '\n\n聊天记录：\n' + log;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parseSummary(text: string): DiscussionResult {
  const j = extractJson(text);
  const list = (v: unknown) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 5) : []);
  if (!j) return { consensus: [], disagreements: [], openQuestions: [], suggestions: [], summary: text.trim().slice(0, 300) };
  return {
    consensus: list(j.consensus),
    disagreements: list(j.disagreements),
    openQuestions: list(j.openQuestions),
    suggestions: list(j.suggestions),
    summary: typeof j.recap === 'string' && j.recap.trim() ? j.recap.trim() : undefined,
  };
}
