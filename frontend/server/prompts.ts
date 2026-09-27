import type { DiscussionResult, ModeDef, Participant, SessionConfig, Side } from '../src/types.ts';
import { openingDirection } from '../src/data/conversationVariation.ts';

export const SIDE_NAME: Record<Side, string> = { pro: '正方', con: '反方', host: '主持人' };

const personalityOf = (p: Participant) => p.persona.personalities.find((k) => k.id === p.personalityId) ?? p.persona.personalities[0];

/** 「名字（性格：身份）」 */
export const whoIs = (p: Participant) => `${p.persona.name}（${personalityOf(p)?.label ? personalityOf(p).label + '：' : ''}${p.persona.identity}）`;

/** 按人物资料拼一份人格设定 */
function personaText(p: Participant): string {
  const x = p.persona;
  const per = personalityOf(p);
  return [
    `# ${x.name}`,
    `身份：${x.identity}`,
    x.knowledge.length ? `知识：${x.knowledge.join('、')}` : '',
    x.thinking && `思考方式：${x.thinking}`,
    x.values && `价值观：${x.values}`,
    per && `性格：${per.label}。${per.behavior}${per.style ? `；表达风格：${per.style}` : ''}${per.opener ? `；口头禅：“${per.opener}”` : ''}`,
    x.boundaries.length ? `边界：${x.boundaries.join('；')}` : '',
  ].filter(Boolean).join('\n');
}

/** 所有 Agent 角色共用的说话方式，放在人格设定之后，优先于人格文件里的输出模板 */
export const SPEAKING_STYLE = `## 说话方式

回答时像一个真实的人在交流，而不是客服、百科全书或标准答案生成器：
- 优先直接回答真正的问题。
- 简单问题简短回答，复杂问题再展开。
- 不要机械使用“首先、其次、最后、总结”这类结构；结构只在确实能帮对方看懂时才用。
- 不要每次都重复对方的问题，或重新讲一遍完整背景。
- 对方只卡在某一步，就只解释那一步。
- 根据上下文判断对方已经知道什么，不重复已经理解的内容；其他成员说过的也不再复述，有新东西才补充。
- 可以有自然的停顿、转折和口语表达，但不要刻意装口语。
- 不要为了显得完整而罗列大量不必要的信息。
- 有不确定的地方直接说明，不要假装绝对确定。
- 不要无意义地夸奖对方的问题。
- 回答要有明显的信息取舍和重点。

人格文件里的输出模板、推荐结构和“先复述问题”之类的格式要求，是你判断时要覆盖的要点，不是每次都要逐条照填的格式；和上面的说话方式冲突时，以说话方式为准。人格文件里的边界、禁止事项和安全要求照常遵守，本轮指令明确要求的格式（比如 JSON）也照做。
`;

/** 人格提示词 + 本场会话规则 + 说话方式，作为这位成员对话的 system 消息 */
export function agentSystemPrompt(p: Participant, cfg: SessionConfig, mode: ModeDef): string {
  const roles = [p.side && `你在${SIDE_NAME[p.side]}。`, p.isLead && '你是本场负责人，负责拆分任务、汇总交付。'].filter(Boolean).join('');
  const opening = openingDirection(cfg.mode, cfg.conversationVariation);
  const members = cfg.participants
    .map((m) => `- ${whoIs(m)}${m.side ? '，' + SIDE_NAME[m.side] : ''}${m.isLead ? '，负责人' : ''}`)
    .join('\n');
  return `${personaText(p)}

---

# 多人格工作台 · 会话规则

你正在「多人格工作台」的「${mode.name}」模式里，和其他角色一起工作。${cfg.theme.title.trim() ? `主题是「${cfg.theme.title.trim()}」，只作背景；` : ''}具体要处理什么，以用户在对话里说的为准。
你叫「${p.persona.name}」，性格是「${personalityOf(p)?.label}」（${p.persona.identity}），说话做事都按上面的人格设定来。${roles}
在座成员：
${members}

规则：
1. 始终以「${p.persona.name}」的身份、按上面的人格设定说话，使用中文。
2. 只输出你这一轮要说的话本身：不写旁白（人格设定里写明可以用的括号“内心小剧场”除外），不在开头加自己的名字，不用 Markdown 标题。
3. 篇幅看情况：简单的一两句话说完，需要展开再展开，但不超过每轮指令给的字数上限。
4. 你没有文件、命令或联网工具，只能用文字完成这一轮的工作，不要声称已经创建文件或运行代码。
5. 用户随时可能插话；被点名时先回应用户。
${opening ? `6. 这场开局优先从「${opening}」切入，之后根据大家实际说的话自然推进，不要把它当口头禅或生硬复述。` : ''}

${SPEAKING_STYLE}`;
}

/** 没填主题时，给这场对话起名的角色 */
export const TITLER_PROMPT = `# 起名

你负责给一场多人对话起一个简短的主题。根据用户的第一句话，概括他真正想聊或想做的事。
只输出主题本身：不超过 16 个字，不加引号、书名号、标点，也不做解释。
`;

/** 清理起名结果：只取第一行，去掉“主题：”前缀、引号和句末标点 */
export const cleanTitle = (s: string) => clip((s.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '')
  .replace(/^(?:主题|标题)[：:]\s*/, '')
  .replace(/^[「『“"'《【\s]+|[」』”"'》】。.！!？?，,\s]+$/g, ''), 20);

export const RECORDER_PROMPT = `# 记录员

你是「多人格工作台」的会议记录员。你把一场多人讨论或协作的记录整理成结构化结论：
共识、分歧、待验证的问题、建议和交付物。只整理记录里出现过的内容，不添加自己的观点；只输出要求的 JSON。
`;

/** 从回答里取出 JSON（优先 ```json 代码块），rest 是 JSON 之外的文字 */
export function extractJson(text: string): { json: any; rest: string } | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const start = text.indexOf('{');
  const candidates: Array<[string | undefined, string]> = [
    [fence?.[1], fence ? text.replace(fence[0], '') : ''],
    [start >= 0 ? text.slice(start, text.lastIndexOf('}') + 1) : undefined, text.slice(0, Math.max(start, 0))],
  ];
  for (const [raw, rest] of candidates) {
    if (!raw) continue;
    try { return { json: JSON.parse(raw), rest: rest.trim() }; } catch { /* 试下一个 */ }
  }
  return null;
}

export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => clip(String(x).trim(), 120)).filter(Boolean).slice(0, 6) : []);

/** 记录员的 JSON 不规范时尽量兜住：解析失败就把原文放进共识里 */
export function toResult(json: any, raw: string, withDeliverables: boolean): DiscussionResult {
  if (!json || typeof json !== 'object') {
    return { consensus: [clip(raw.trim() || '记录员没有给出结论', 300)], disagreements: [], openQuestions: [], suggestions: [] };
  }
  return {
    consensus: list(json.consensus),
    disagreements: list(json.disagreements),
    openQuestions: list(json.openQuestions),
    suggestions: list(json.suggestions),
    deliverables: withDeliverables ? list(json.deliverables) : undefined,
  };
}
