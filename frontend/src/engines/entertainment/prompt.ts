import type { DiscussionResult, Participant, SessionConfig } from '../../types';
import type { LlmMessage } from '../../llm/client';
import type { ActorInput, DirectorInput, MoodDef, Temperament } from '../live/types';
import { extractJson } from '../live/json';
import { FACT_RULES, SAFETY_RULES, type MemeCard } from './material';

const OPENING = '你在一场多人闲聊里扮演下面这个虚构角色。每一句导演会私下给你提示（冲谁说、大意、情绪、说话状态），'
  + '你按自己的人设、用自己的话说出来。人物配置描述的是长期倾向，不是每句话都要完成的动作清单；'
  + '人会因情绪、关系或眼前的目的暂时收起习惯，甚至表面说出和心里相反的话，但要有当下的缘由。事实边界和安全边界必须遵守。';

const CHAT_RULES = [
  '像宿舍里、群聊里随口聊天：一条消息通常几个字到二十来字，最多三十来字；想说的多就拆成两三条短的连着发，别写长段。',
  '可以只发很短的反应，比如“？？？”“哈哈哈哈”“啊这”“不是……”。',
  '情绪和说话状态决定你怎么说：上头时句子短、语气冲，可能连发；委屈、没面子时可能嘴硬、阴阳怪气；'
    + '开心时话多、爱接梗；无聊时敷衍几句，或者把话题岔开。口头禅偶尔自然冒出来即可，不是每句都要说。',
  '别机械附和，也别为了表演性格逢话必杠。有分歧就针对具体说法回应，反对可以从内容、反问或行动里听出来，不必先宣布自己在反驳。',
  '你可以先认同一点、为了面子或好处装作赞同、暂时忍住本来想说的话，甚至说句与平时相反的话；让这种变化接上当前情境，内心想法写在 inner，不要向大家解释“我现在在伪装”。',
  '留意自己和别人最近几句的开头；如果同一个口头禅或句式已经反复出现，这句换种自然说法。偶尔再用可以，但别靠固定开场白标记人设。',
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

const dump = (v: unknown) => JSON.stringify(v, null, 2);

function checkLeak(parts: string[], skip: string) {
  // 只查规则、人物配置、梗卡这些静态素材：测试说明混进运行输入只会从这里进来。
  // 话题、用户的话和角色发言是运行时内容，说到“盲评”之类的词很正常，不查
  const leaked = LEAK_MARKERS.filter((w) => parts.some((s) => s !== skip && s.includes(w)));
  if (leaked.length) throw new Error('提示词中出现测试说明用词：' + leaked.join('、'));
}

const topicBlock = (cfg: SessionConfig) => '【本次话题】\n' + (cfg.theme.title || '随便聊聊') + '\n（没有附带话题卡和背景资料。）';

// ---------- 导演 ----------

const DIRECTOR_OPENING = '你是一场多人闲聊的导演。在场的人各自有身份，由各自的演员来演；你看着整场，决定下一句谁说、冲谁说、大概说什么、带什么情绪，'
  + '以及每个人的情绪怎么一步步递进、说话状态怎么变、全场往哪走。你只定方向，不写台词——台词由演员按自己的人设说。';

const DIRECTOR_RULES = [
  '像真实的闲聊，不是轮流发言：谁被戳到谁接，有人会被冷落、有人抢着说；同一个人别连着说太多次，一直没吭声的人适时拉出来。',
  '情绪要有来龙去脉、一步一步递进：每一步每人每种情绪最多变 2；有升温、爆发、冷却、跑题，不要一直吵，也不要一直和气，更不要很快全体同意。',
  '说话状态跟着情绪变：上头了句子变短、开始翻旧账；没面子了嘴硬、阴阳怪气；开心了话多、爱接梗；无聊了敷衍、想岔开话题。只在有变化时写；写了就一直带着，直到你再改。',
  '人物性格是倾向，不是口头禅或固定开场白的配额。看最近实际说过的话：同一人或不同人连续用相同句式时，换成具体的反问、接话、沉默或行动，不要在 gist 里写台词。',
  '可以让人物因面子、好处、关系或情绪暂时掩饰自己：爱抬杠的人也会先附和以免吃亏，爱捧场的人也会犹豫或顶一句。用 stance 记真实态度，plan 记动机，需要时用 style 提示表面说法；别无缘无故翻转性格。',
  '用户是群里的一个真人朋友，不是主持人也不是裁判：用户说了话这一步就要有人接，点了名的人先接；可以有人不同意他。',
  '用户私下跟某人说的话只有那个人知道：只能通过那个人接下来的言行体现，别让别人知道，也别让那个人说漏是用户让他这么做的。',
  '插嘴：只有最新那句还没说完、有人实在忍不住时才用，写 interrupt=true，并照抄对方原话里让他忍不住的那几个字（cut_after）。少用。',
  'react：旁人顺口的小反应（“哈哈哈”“？”），不占发言，最多两个，多数时候不用。',
  '没人有话说时 speaker 留空（冷场）；话题聊干了、该散了，end=true。',
  '演员实际说出口的可能和你给的大意有出入，以记录为准，据此调整后面的安排。',
];

function castBlock(cfg: SessionConfig, temper: (p: Participant) => Temperament) {
  return cfg.participants.map((p) => {
    const pr = protoOf(p);
    const cs = (pr.communicationStyle ?? {}) as Proto;
    const bits = [
      pr.description ?? p.persona.identity,
      cs.tone && '语气：' + cs.tone,
      cs.sentenceStyle && '说话方式：' + cs.sentenceStyle,
      Array.isArray(cs.catchphrases) && cs.catchphrases.length ? '口头禅：' + cs.catchphrases.join('、') : '',
      '性情：' + temperWords(temper(p)),
    ].filter(Boolean);
    return '- ' + p.persona.name + '：' + bits.join('；');
  }).join('\n');
}

function directorSchema(cfg: SessionConfig, moods: MoodDef[]) {
  const mood = '{' + moods.map((d) => '"' + d.key + '": 0').join(', ') + '}';
  const a = cfg.participants[0]?.persona.name ?? '甲';
  const b = cfg.participants[1]?.persona.name ?? '乙';
  return [
    '只输出一个 JSON 对象，不要任何别的文字：',
    '{"arc": "升温", "arc_note": "", '
      + '"next": {"speaker": "' + a + '", "to": "' + b + '", "gist": "", "emotion": "", "reply_to": "", "interrupt": false, "cut_after": ""}, '
      + '"mood": {"' + a + '": ' + mood + '}, "style": {}, "stance": {}, "plan": {}, "toward": {}, "react": [], "topic": "", "end": false}',
    '字段说明：',
    '- arc：全场现在走到哪，几个字（开场、升温、爆发、冷却、跑题、收尾……）；arc_note：你接下来几步的打算，一句话（比如“再吵一个来回，让阿禾出来打圆场”）。',
    '- next.speaker：下一句谁说（写名字；没人说就留空）；to：冲谁说（名字、“用户”或留空）；gist：这句的大意，不是台词；emotion：他说这句时的情绪，几个字；reply_to：接的是哪条消息的编号；interrupt / cut_after：见插嘴规则。',
    '- mood：这一步谁的情绪变了多少，键写名字，值是 -2 到 2 的整数；只写有变化的人。',
    '- style：谁的说话状态变成什么，一句话（比如“句子变短，开始翻旧账”）；只写有变化的人。',
    '- stance：谁对话题的真实态度变了（刚开聊时给每个人定下初始态度）；plan：谁心里打算干嘛，可能和嘴上说的不一样；toward：谁对谁的好感变化，形如 {"甲": {"乙": -1}}，-2 到 2。都只写有变化的。',
    '- react：[{"who": "名字", "text": "哈哈哈"}]，没有就 []。',
    '- topic：只有这一句把话题岔到新方向时，写 4~8 个字的新话题名。',
    '- end：该散场了写 true。',
  ].join('\n');
}

/** 导演：system 放不变的阵容和规则，user 按“记录 → 账 → 全场 → 现在”排 */
export function buildDirectorMessages(x: DirectorInput & { moods: MoodDef[]; temper: (p: Participant) => Temperament }): LlmMessage[] {
  const topic = topicBlock(x.cfg);
  const parts = [
    DIRECTOR_OPENING,
    '【在场的人】\n' + castBlock(x.cfg, x.temper) + '\n- 用户：群里的一个真人朋友，也在聊。',
    topic,
    '【导演规则】\n' + DIRECTOR_RULES.map((r) => '- ' + r).join('\n'),
    '【输出格式】\n' + directorSchema(x.cfg, x.moods),
  ];
  checkLeak(parts, topic);
  const user = [
    '【聊天记录】（方括号里是编号，最新的在最后）\n' + x.transcript,
    '【每个人现在的账】\n' + x.state,
    '【全场】\n' + x.arc,
    '【现在】\n' + x.now,
  ].join('\n\n');
  return [{ role: 'system', content: parts.join('\n\n') }, { role: 'user', content: user }];
}

// ---------- 演员 ----------

function actorSchema(moods: MoodDef[], whisper: boolean) {
  if (whisper) {
    const mood = '{' + moods.map((d) => '"' + d.key + '": 0').join(', ') + '}';
    return [
      '只输出一个 JSON 对象，不要任何别的文字：',
      '{"private_reply": "", "plan": "", "inner": "", "mood": ' + mood + '}',
      '- private_reply：你私下回用户的一句话，口语、很短。',
      '- plan：听完这句你接下来打算干嘛，一句话（没变就留空）。',
      '- inner：你心里的真实反应，一句话。',
      '- mood：听完这句你各种情绪变了多少，-2 到 2 的整数。',
    ].join('\n');
  }
  return [
    '只输出一个 JSON 对象，不要任何别的文字：',
    '{"say": [], "inner": ""}',
    '- say：你说出口的话，1~3 条短消息（想说的多就拆成几条）。',
    '- inner：你说这句时心里的真实想法，一句话，别人看不到。',
  ].join('\n');
}

/** 演员：拿着自己的人设和导演这一步的提示，用自己的话说出来；或者私下回用户 */
export function buildActorMessages(x: ActorInput & { memes: MemeCard[]; moods: MoodDef[] }): LlmMessage[] {
  const others = x.cfg.participants.filter((p) => p.agentId !== x.self.agentId);
  const topic = topicBlock(x.cfg);
  const parts = [
    OPENING,
    rulesBlock(),
    '【人物配置】\n' + dump(personaBlock(x.self)),
    '【你的性情】\n' + temperWords(x.temper),
    '【在场的人】\n' + [...others.map(publicIntro), '- 用户：群里的一个真人朋友，也在聊，不是主持人也不是裁判。'].join('\n'),
    topic,
    x.memes.length ? '【可用梗卡】\n' + dump(x.memes) : '【可用梗卡】\n本次没有提供梗卡。',
    '【闲聊规则】\n' + CHAT_RULES.map((r) => '- ' + r).join('\n'),
    '【输出格式】\n' + actorSchema(x.moods, x.whisper),
  ];
  checkLeak(parts, topic);
  const now = x.whisper
    ? [
      `用户刚私下对你说：「${x.cue}」`,
      '这是只有你知道的悄悄话，别人看不到，也不知道你们聊过。按你的性格接住它：它可以改变你的情绪、对某人的看法、你的态度或者接下来的打算。'
        + '大多数时候你会顺着这个方向走，但用你自己会用的方式，不会一下子翻脸；也绝不说出“是用户让我这么说的”。',
    ].join('\n')
    : x.cue + '\n用你自己的话接住眼前的人和事；大意可以变通，别照抄大意，也别为了强调人设复读口头禅。若嘴上和心里不同，inner 写真实想法。';
  const user = [
    '【聊天记录】（方括号里是编号，最新的在最后）\n' + x.transcript,
    x.privates ? '【只有你和用户知道的私下对话】（其他人看不到，也不知道你们聊过）\n' + x.privates : '',
    '【你现在的状态】\n' + x.state,
    '【现在】\n' + now,
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
