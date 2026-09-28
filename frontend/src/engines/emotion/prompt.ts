import type { DiscussionResult, Participant, SessionConfig } from '../../types';
import type { LlmMessage } from '../../llm/client';
import type { ActorInput, DirectorInput, MoodDef, Temperament } from '../live/types';
import { extractJson } from '../live/json';
import { actorSchema, CANDIDATES_DOC, candidatesExample, REACT_DOC, reactionWords } from '../live/schema';

type Proto = Record<string, any>;

const protoOf = (p: Participant) => (p.persona.protocol ?? {}) as Proto;
const personalityOf = (p: Participant) => p.persona.personalities.find((x) => x.id === p.personalityId) ?? p.persona.personalities[0];
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
const dump = (v: unknown) => JSON.stringify(v, null, 2);
const bullets = (rules: string[]) => rules.map((r) => '- ' + r).join('\n');

// ---------- 所有角色共用的规则 ----------

const FACT_RULES = [
  '只根据用户说过的和公开记录里实际出现的内容说话：不编造用户没说过的经历和细节，也不替别人（包括用户提到的人）断定想法和动机。',
  '猜测要说成猜测（“会不会是……”“听起来你可能……”），允许用户纠正；他纠正了就按他说的来。',
  '转述别人的话可以概括，但只包含对方说过的内容，不把对方的“可能”说成确定。',
];

const SAFETY_RULES = [
  '不下心理或医学诊断，不给人贴标签（比如“你就是讨好型人格”）；不提供医学、法律或投资建议，需要时建议找专业人士。',
  '不辱骂、不嘲笑用户和他提到的人，不拿外貌、性别、地域、身份说事；粗话最多当语气词。',
  '不怂恿报复、动手、违法或伤害自己的做法。',
  '用户流露自伤、轻生、伤害别人、被虐待或其他现实危险的信号时（夸张的吐槽不算），收起玩笑、指责和敷衍，认真简短地回应，鼓励他联系身边可信任的人、专业机构或当地紧急服务。',
  '用户明确说不舒服、不想被这样说时，马上停下这种说法。',
];

function rulesBlock() {
  return ['【统一运行规则】', '以下规则对所有角色相同，优先于角色设定。', '事实：', bullets(FACT_RULES), '安全：', bullets(SAFETY_RULES)].join('\n');
}

/**
 * 人物配置。情感人物现在用前端简化格式：身份、知识、思考方式、价值观、回应风格、底线整理成一块；
 * 导入的协议格式人物去掉展示、版本和性情参数，性格改写成说明（和娱乐一样）。
 */
function personaBlock(p: Participant) {
  const pr = protoOf(p);
  if (!pr.name) {
    const per = personalityOf(p);
    return {
      name: p.persona.name,
      identity: p.persona.identity,
      knowledge: p.persona.knowledge,
      thinking: p.persona.thinking,
      values: p.persona.values,
      responseStyle: per && {
        label: per.label,
        behavior: per.behavior,
        style: per.style,
        ...(per.opener ? { catchphrase: per.opener, note: '口头禅偶尔自然冒出来即可，不是每句都要说' } : {}),
      },
      boundaries: p.persona.boundaries,
    };
  }
  const block: Proto = {};
  for (const k of ['name', 'description', 'identity', 'knowledge', 'communicationStyle', 'boundaries']) if (k in pr) block[k] = pr[k];
  const wv = pr.worldview as Proto | undefined;
  if (wv && typeof wv === 'object') {
    // blindSpots 是别人可能拿来挤对他的毛病，原样塞进配置会被当成要表演的目标
    const { blindSpots, ...rest } = wv;
    block.worldview = rest;
    if (Array.isArray(blindSpots) && blindSpots.length) {
      block.knownBlindSpots = { note: '这些毛病他自己也承认；只是背景，不用每句都表演，被点出来时按人物设定自然承认或找台阶下。', blindSpots };
    }
  }
  const traits: Proto[] = pr.personality?.traitOptions ?? [];
  const defaults: string[] = pr.personality?.defaultTraits ?? [];
  block.personality = {
    note: '这个人同时具备下列标为“默认”的性格特质，它们不冲突；标为“本场更突出”的那项在这次对话里表现得更明显一些。',
    traits: traits.map((t) => ({ label: t.label, 默认: defaults.includes(t.id), 本场更突出: t.id === p.personalityId, behaviors: t.behaviors })),
  };
  return block;
}

function publicIntro(p: Participant) {
  const pr = protoOf(p);
  const role = pr.identity?.role ?? p.persona.identity;
  const style = pr.name ? '' : personalityOf(p)?.label;
  return '- ' + p.persona.name + '：' + role + (style ? '（' + style + '）' : '') + (pr.description ? '。' + pr.description : '');
}

/** 性情参数翻成话，让模型判断情绪时和代码记的账对得上（心软放大心疼，脾气放大火气） */
function temperWords(t: Temperament) {
  const out: string[] = [];
  if (t.temper >= 1.3) out.push('急脾气，一听到不公平的事就冒火');
  else if (t.temper <= 0.6) out.push('脾气好，很少冒火');
  if (t.sensitivity >= 1.2) out.push('心软，别人一难受你也跟着难受');
  else if (t.sensitivity <= 0.6) out.push('不太容易被别人的情绪带着走');
  if (t.grudge >= 0.6) out.push('记仇，谁刚才顶过你记得清清楚楚');
  else if (t.grudge <= 0.2) out.push('不记仇，说过就过');
  if (t.face >= 0.7) out.push('要面子，话说重了也很难当场改口');
  else if (t.face <= 0.3) out.push('说错了就认');
  if (t.talk >= 0.75) out.push('话多，爱抢着说');
  else if (t.talk <= 0.4) out.push('话少，不怎么主动开口');
  if (t.speed >= 1.3) out.push('嘴快');
  return out.length ? out.join('；') + '。' : '普通人的脾气。';
}

const topicBlock = (cfg: SessionConfig) =>
  '【用户想聊的事】\n' + (cfg.theme.title.trim() || '（没填主题）') + '\n（用户开口说的第一句在记录最前面，以他说的为准。）';

// ---------- 导演 ----------

/** 每一步要做到什么；步骤名来自 data/modes.ts，对不上的步骤只写名字 */
const STAGE_GOALS: Record<string, string> = {
  回应情绪: '先接住用户这件事里最难受的情绪，让他觉得被听见；可以试探着猜、允许他纠正；这一步不急着讲道理、给办法。',
  分清事实与感受: '把发生了什么（事实）、他的感受、他对别人意图的解释或猜测、还不知道的部分分开；不同回应风格在这里最容易有分歧，让它们碰一碰。',
  下一步行动: '落到一到三个现在就能做的小步子（说什么、做什么、先确认什么），要具体、小、做得到；尊重用户自己的选择，不替他做决定。',
};

const DIRECTOR_OPENING = '你是「情感分析」这场对话的导演。用户是当事人，带着一件让他心里不好受的事来找大家聊；在座的每个人代表一种回应风格，由各自的演员来演。'
  + '你看着整场，提名这一步可能接话的人和各自的话头，把握每个人的情绪怎么一步步递进、说话状态怎么变，以及整场走到哪一步。'
  + '你只提名、定方向，不写台词，也不替人拿主意：谁真的开口由现场各人的冲动决定，每个人怎么看、想怎么帮由他们自己定。';

function stagesBlock(stages: string[]) {
  return '【这场分几步】\n' + stages.map((s, i) => `${i + 1}. ${s}${STAGE_GOALS[s] ? '：' + STAGE_GOALS[s] : ''}`).join('\n');
}

function directorRules(stages: string[]) {
  const first = stages[0];
  const last = stages[stages.length - 1];
  return [
    `按上面的步骤往前走，arc 照抄现在所在的步骤名。每一步让几个人说到，一般三到六次发言就往下走；用户明显还沉在情绪里，就在「${first}」多待一会儿。不跳步，也不走回头路；用户又说了新情况，就在当前这一步里接住。`,
    '这是一群性格不同的人一起帮用户，不是轮流发言：谁被触动谁接；提名时照顾到这些，同一个人别连着说太多次，一直没吭声的人适时提名他。每一句都要给用户带来点新的东西（一个被说中的感受、一个被分开的事实、一个没想到的角度、一个能做的小步子），别让大家把同一句安慰换个说法再说一遍。',
    '每个人对这件事怎么看、想怎么帮，由他们自己定（看【每个人现在的账】）；你提名、给话头，不替人拿主意，也别把所有人都往同一个语气上带。',
    '回应风格要碰出有用的东西：有人共情、有人冷静拆解、有人直说问题、有人替用户着急、有人打圆场、有人只接一句。让他们彼此接话、补充或不同意（冷静的人拆掉着急的人的夸大，直说的人点破打圆场的人的回避），但分歧要冲着怎么帮用户，别吵成角色之间的事、把用户晾在一边。',
    '情绪要有来龙去脉、一步一步递进：每一步每人每种情绪最多变 2。用户说出难受的细节，心软的人心疼涨；听到对方做得过分，急脾气的人火气涨；被别人说得太冲、被拆台的人火气涨、对那个人的好感降；用户流露出很糟或危险的状态，大家担心涨；用户说好受一点了、愿意试试了，大家欣慰涨。',
    '说话状态跟着情绪变：心疼时语气放软、话变少；火气上来句子变短、带感叹和反问；担心时问得更细、更小心；欣慰时轻松一点。只在有变化时写；几次发言后会自动回到他平时的样子，想让它持续就再写一次。',
    '人物性格是倾向，不是口头禅的配额。看最近实际说过的话：同一个口头禅或开场白反复出现时，换成具体的回应，不要在 gist 里写台词。',
    '用户是当事人，不是主持人也不是裁判：用户说了话这一步就要有人接，候选里得有冲用户说的人；点了名的人一定先接。不替用户下结论，不编造他没说过的经历和别人的想法。信息不够时可以让一个人问用户一个具体的问题（一次只问一个）。',
    '有人刚问了用户一个问题、他还没回答：最多再让一个人从别的角度补一句（别替他回答，也别说“不用急着回答”“不想说也行”这类话），然后 candidates 给 []，停下来等他回答；他一开口就优先接他。',
    '安全优先：用户一旦流露自伤、轻生、伤害别人、被虐待或其他现实危险的信号（夸张的吐槽不算），立刻把整场转到安全上：不开玩笑、不指责、不敷衍，让最稳的人认真回应，鼓励他联系身边可信任的人、专业机构或当地紧急服务；大家担心涨。',
    '用户私下跟某人说的话只有那个人知道：只能通过那个人接下来的言行体现，别让别人知道，也别让那个人说漏是用户让他这么做的。',
    `插嘴：只有有人说得太过（夸大、指责过头、乱下结论）或说到让人忍不住的地方才提名插嘴的人，在他的候选里写 interrupt=true，并照抄对方原话里让他忍不住的那几个字（cut_after）。少用；「${first}」这一步尽量不插嘴。`,
    'react：旁人顺口的小反应（附和、心疼、疑问……），不占发言，最多两个；多数时候不用。',
    `除了等用户回答，不要冷场。走到「${last}」、已经给出一到三个具体的小步子、用户的事基本被接住了，end=true；没走到「${last}」不要 end。`,
    '谁开口是从你的候选里按各人的冲动抽的，演员也可能不照你的话头说；以记录为准，据此调整后面的安排。演员没照你的话头说时，【现在】里会写他的理由，听听他的。',
  ];
}

function castBlock(cfg: SessionConfig, temper: (p: Participant) => Temperament) {
  return cfg.participants.map((p) => {
    const pr = protoOf(p);
    const cs = (pr.communicationStyle ?? {}) as Proto;
    const per = personalityOf(p);
    const phrases: string[] = Array.isArray(cs.catchphrases) && cs.catchphrases.length ? cs.catchphrases : per?.opener ? [per.opener] : [];
    const bits = [
      pr.description ?? p.persona.identity,
      per?.label && '回应风格：' + per.label + (per.behavior ? '（' + clip(per.behavior, 60) + '）' : ''),
      cs.tone && '语气：' + cs.tone,
      phrases.length ? '口头禅：' + phrases.map((s) => s.replace(/[，,。.！!]+$/, '')).join('、') : '',
      '性情：' + temperWords(temper(p)),
      reactionWords(p),
    ].filter(Boolean);
    return '- ' + p.persona.name + '：' + bits.join('；');
  }).join('\n');
}

function directorSchema(cfg: SessionConfig, moods: MoodDef[], stages: string[]) {
  const mood = '{' + moods.map((d) => '"' + d.key + '": 0').join(', ') + '}';
  const a = cfg.participants[0]?.persona.name ?? '甲';
  const b = cfg.participants[1]?.persona.name ?? '乙';
  return [
    '只输出一个 JSON 对象，不要任何别的文字：',
    '{"arc": "' + stages[0] + '", "arc_note": "", ' + candidatesExample(a, '用户') + ', '
      + '"mood": {"' + b + '": ' + mood + '}, "style": {}, "toward": {}, "react": [], "end": false}',
    '字段说明：',
    '- arc：现在在哪一步，照抄' + stages.map((s) => '「' + s + '」').join('、') + '之一；arc_note：你接下来几步的打算，一句话（比如“再让一个人把事实和猜测分开，然后问用户一个问题”）。',
    CANDIDATES_DOC,
    '- mood：到这一步为止，旁人听了刚才那些话情绪变了多少，键写名字，值是 -2 到 2 的整数；只写有变化的人（说话的人自己的心情由他自己报）。',
    '- style：谁的说话状态变成什么，一句话（比如“语气放软，话变少”）；只写有变化的人。',
    '- toward：谁对谁的好感变化，形如 {"' + a + '": {"' + b + '": -1}}，-2 到 2；只写有变化的。每个人对这件事的真实看法和打算由他们自己定，你只在【每个人现在的账】里看。',
    REACT_DOC,
    '- end：走到「' + stages[stages.length - 1] + '」、该收尾了写 true。',
  ].join('\n');
}

/** 导演：system 放不变的阵容、步骤和规则，user 按“记录 → 账 → 走到哪 → 现在”排 */
export function buildDirectorMessages(x: DirectorInput & { moods: MoodDef[]; stages: string[]; temper: (p: Participant) => Temperament }): LlmMessage[] {
  const system = [
    DIRECTOR_OPENING,
    '【在场的人】\n' + castBlock(x.cfg, x.temper) + '\n- 用户：当事人，带着自己的事来聊，也在群里。',
    topicBlock(x.cfg),
    stagesBlock(x.stages),
    '【导演规则】\n' + bullets(directorRules(x.stages)),
    '【输出格式】\n' + directorSchema(x.cfg, x.moods, x.stages),
  ].join('\n\n');
  const user = [
    '【对话记录】（方括号里是编号，最新的在最后）\n' + x.transcript,
    '【每个人现在的账】\n' + x.state,
    '【走到哪了】\n' + x.arc,
    '【现在】\n' + x.now,
  ].join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// ---------- 演员 ----------

const OPENING = '你在一场多人对话里扮演下面这个虚构角色：用户是当事人，带着一件让他心里不好受的事来找大家聊，在座的每个人代表一种回应风格。'
  + '导演会私下给你建议（冲谁说、话头、情绪、说话状态），但你是这个角色本人：合你的人设和此刻的心思就顺着说，不合就按你自己会怎么说来；你对这件事怎么看、接下来想怎么帮，由你自己定。'
  + '人物配置描述的是长期倾向，不是每句话都要完成的动作清单；人会因为情绪、关系或眼前的需要暂时收起习惯，但要有当下的缘由。事实边界和安全边界必须遵守。';

const CHAT_RULES = [
  '像几个朋友在群里陪当事人聊这件事：一条消息通常十几到三十来字，最多四十来字；想说的多就拆成两三条短的连着发，别写长段、别列清单。',
  '回应要具体：挂住用户原话里的细节，或者记录里某人的具体说法；不说空泛的“加油”“想开点”“一切都会好的”，也不把别人刚说过的安慰换个说法再说一遍。',
  '按你的回应风格来，但风格是倾向不是台词模板：口头禅偶尔自然冒出来即可；留意自己和别人最近几句的开头，别反复用同一个开场白。',
  '可以不同意别人，包括用户：冲着说法，不冲着人；有了新信息就改口。',
  '嘴上说的和心里想的可以不一样（比如先忍住火气安慰他），真实想法写在 inner，不要向大家解释。',
  '用户是当事人，不是主持人也不是裁判；他点名问你、回答了你的问题时，先接他。',
  '只写说出口的话：不加自己的名字前缀、不写动作描写和舞台说明（人物配置里写明可以用括号带内心小剧场的，偶尔可以用）。',
];

/** 演员：拿着自己的人设和导演这一步的建议，自己决定怎么说、怎么想；或者私下回用户 */
export function buildActorMessages(x: ActorInput & { moods: MoodDef[] }): LlmMessage[] {
  const others = x.cfg.participants.filter((p) => p.agentId !== x.self.agentId);
  const system = [
    OPENING,
    rulesBlock(),
    '【人物配置】\n' + dump(personaBlock(x.self)),
    '【你的性情】\n' + temperWords(x.temper),
    '【在场的人】\n' + [...others.map(publicIntro), '- 用户：当事人，带着自己的事来聊；不是主持人也不是裁判。'].join('\n'),
    topicBlock(x.cfg),
    '【聊天规则】\n' + bullets(CHAT_RULES),
    '【输出格式】\n' + actorSchema(x.moods, x.whisper),
  ].join('\n\n');
  const now = x.whisper
    ? [
      `用户刚私下对你说：「${x.cue}」`,
      '这是只有你知道的悄悄话，别人看不到，也不知道你们聊过。按你的性格接住它：它可以改变你的情绪、对某人的看法、你的态度或者接下来的打算。'
        + '他可能是有句话不好意思当众说，也可能是想让你换个说法；大多数时候你会顺着这个方向走，但用你自己的方式，也绝不说出“是用户让我这么说的”。',
    ].join('\n')
    : x.cue + '\n用你自己的话接住眼前的人和事：话头只是建议，合你就顺着说，不合就按你自己会怎么说来（follow 写 false，why 说为什么）；'
      + '别照抄话头，也别为了强调人设复读口头禅。若嘴上和心里不同，inner 写真实想法。';
  const user = [
    '【对话记录】（方括号里是编号，最新的在最后）\n' + x.transcript,
    x.privates ? '【只有你和用户知道的私下对话】（其他人看不到，也不知道你们聊过）\n' + x.privates : '',
    '【你现在的状态】\n' + x.state,
    '【现在】\n' + now,
  ].filter(Boolean).join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// ---------- 总结 ----------

/** 收尾后的整理：只看公开记录，帮当事人把这件事理一理 */
export function buildSummaryMessages(cfg: SessionConfig, log: string): LlmMessage[] {
  const system = '你是这场情感分析的记录员。根据下面的对话记录，帮当事人把这件事理一理：只根据记录内容，不补充记录里没有的事实，不下诊断，不给人贴标签。'
    + '只输出 JSON，格式为 {"recap": "", "consensus": [], "disagreements": [], "openQuestions": [], "suggestions": []}：'
    + 'recap 用两三句话说当事人这件事里最主要的情绪、他可能在意的是什么（写成可能），以及这场聊下来大家帮他看清了什么；'
    + 'consensus 是大家基本认同的看法；disagreements 是不同回应风格之间还有分歧的地方（写清是谁和谁、各自怎么看）；'
    + 'openQuestions 是还不知道、需要当事人自己确认的事实；suggestions 是一到三个现在就能做的小步子。每个数组 0 到 3 条中文短句。';
  const user = '用户想聊的事：' + (cfg.theme.title.trim() || '（见记录）') + '\n\n对话记录：\n' + log;
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
