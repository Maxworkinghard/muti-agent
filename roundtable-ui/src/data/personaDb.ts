import type { ModeId, Persona, PersonaVisual, RoleId } from '../types';
import { AGENT_COLORS } from './personas';
import { parseFileIndex, parsePersonaFile, type PersonaFileSummary } from './personaMarkdown';

/**
 * 人格数据库：persona-db/<套装目录>/*.md 原样拷贝自「人格数据库」，一套人格对应一个模式。
 * 每个 .md 是一个人物；README.md、workflow.md 是套装公共文件，附在每个人物的 systemPrompt 后面。
 * 更新人格直接替换 persona-db 里的文件；新增一套人格要在 SETS 里登记它对应的模式。
 */
const FILES = import.meta.glob<string>('/persona-db/*/*.md', { query: '?raw', import: 'default', eager: true });

interface PersonaSet {
  dir: string;
  mode: ModeId;
  /** 文件名 → 在流程里的固定角色（见 modes.ts 里各模式的 roles）；没写的是普通成员 */
  roles?: Record<string, RoleId>;
  /** 人物顺序；缺省按文件名排序 */
  order?: string[];
  /** 整套统一的表达风格，摘自 README 的输出要求 */
  style?: string;
}

const SETS: PersonaSet[] = [
  { dir: '情感交流人格', mode: 'emotion' },
  {
    dir: 'vibe coding人格', mode: 'vibe',
    roles: { '主agent.md': 'coordinator', 'prompt编写agent.md': 'writer', '接收promptagent.md': 'executor' },
    order: ['主agent.md', 'prompt编写agent.md', '接收promptagent.md'],
  },
  { dir: '产品分析人格', mode: 'analysis', roles: { '00_产品分析总控人格.md': 'coordinator' }, style: '先给结论，再讲依据、风险、取舍和下一步' },
  { dir: '简历分析人格', mode: 'resume', roles: { '00_简历分析总控人格.md': 'coordinator' }, style: '先给结论，再列证据位置、推断和未知项' },
];
const SHARED = ['README.md', 'workflow.md'];

/** 人物的名字；人格文件本身（指责型、产品经理、主 Agent…）作为这个人物的「性格」。没登记的新文件用人格名兜底 */
const NAMES: Record<string, string> = {
  '情感交流人格/1_指责型.md': '钢镚儿',
  '情感交流人格/2_讨好型.md': '甜筒',
  '情感交流人格/3_理智型.md': '冰美式',
  '情感交流人格/4_确实型.md': '躺平君',
  '情感交流人格/5_理解型.md': '树洞',
  '情感交流人格/6_暖心型.md': '小棉袄',
  'vibe coding人格/主agent.md': '包工头',
  'vibe coding人格/prompt编写agent.md': '咒语师',
  'vibe coding人格/接收promptagent.md': '搬砖侠',
  '产品分析人格/00_产品分析总控人格.md': '大掌柜',
  '产品分析人格/01_产品经理人格.md': '拍板侠',
  '产品分析人格/02_用户研究专家人格.md': '小问号',
  '产品分析人格/03_交互设计专家人格.md': '丝滑',
  '产品分析人格/04_视觉设计专家人格.md': '调色盘',
  '产品分析人格/05_技术架构师人格.md': '老梁',
  '产品分析人格/06_数据分析人格.md': '表哥',
  '产品分析人格/07_安全隐私合规专家人格.md': '门神',
  '产品分析人格/08_产品营销人格.md': '大喇叭',
  '产品分析人格/09_商业模式人格.md': '算盘',
  '产品分析人格/10_AI_LLM专家人格.md': '炼丹师',
  '产品分析人格/11_DevOps_SRE专家人格.md': '值班猫',
  '产品分析人格/12_安全工程师红队专家人格.md': '白帽',
  '简历分析人格/00_简历分析总控人格.md': '猎头头',
  '简历分析人格/01_背景与职业路径分析人格.md': '年轮',
  '简历分析人格/02_岗位匹配分析人格.md': '月老',
  '简历分析人格/03_经历与项目质量分析人格.md': '刨根儿',
  '简历分析人格/04_成果与影响力分析人格.md': '秤砣',
  '简历分析人格/05_能力结构分析人格.md': '雷达',
  '简历分析人格/06_成长轨迹与经历逻辑分析人格.md': '爬山虎',
  '简历分析人格/07_真实性与可信度分析人格.md': '放大镜',
  '简历分析人格/08_简历表达质量分析人格.md': '红笔',
  '简历分析人格/09_面试追问与综合评估人格.md': '追追',
};

/** 自动提取不理想时的手工修正，内容取自对应文件原文；只影响卡片摘要，不改 systemPrompt */
const OVERRIDES: Record<string, Partial<PersonaFileSummary>> = {
  'vibe coding人格/主agent.md': {
    knowledge: ['需求澄清', '任务拆解', 'Prompt 审核', '结果检查与交付'],
    thinking: '先判断用户是在提问还是要做事；要做事就分轮追问，用户确认开工后再拆解任务',
    values: '确保用户的真实需求得到清晰、诚实、可使用的交付结果',
    behavior: '每轮只问会影响结果的问题，给出选项和推荐答案',
    style: '少用术语，先说清要完成什么再讲细节',
  },
  'vibe coding人格/prompt编写agent.md': {
    knowledge: ['执行 Prompt', '约束条件', '判断与处理规则', '验收标准'],
    thinking: '把“要做什么”写成“另一个 Agent 应该怎样准确完成”',
    values: '好的 Prompt 让执行 Agent 清楚知道目标、依据、步骤、边界和怎样证明做对了',
    behavior: '信息不全时用最小合理假设并标注，重大歧义先问主 Agent',
    style: '可以直接复制执行，减少不必要的专业术语',
  },
  'vibe coding人格/接收promptagent.md': {
    thinking: '先理解，后执行；只执行主 Agent 审核后的最终 Prompt',
    behavior: '先检查输入、环境和权限，再按步骤执行并验证',
    style: '如实报告状态、产物、验证结果和未完成项',
    boundaries: ['不得声称没有执行过的操作已经执行', '不得声称没有验证过的结果已经通过', '不得隐藏报错、失败尝试或重要限制', '不得擅自向用户承诺交付时间或扩大工作范围'],
  },
  '简历分析人格/07_真实性与可信度分析人格.md': {
    knowledge: ['时间线冲突', '级别与职责匹配', '宏大表述', '指标口径', '成果归因'],
  },
};

const SKINS = ['#f1c9a5', '#f3d2b3', '#e8b98f', '#f6d7bd', '#d9a57c'];
const HAIRS = ['#2b2136', '#6b6272', '#4a3b2a', '#8a6fb0', '#d98a4e', '#3d3550', '#c47a9a'];
const HAIR_STYLES: PersonaVisual['hairStyle'][] = ['short', 'long', 'bun', 'cap'];

// 按目录归档：{ 目录: { 文件名: 内容 } }，统一成 LF 换行
const byDir: Record<string, Record<string, string>> = {};
for (const [path, text] of Object.entries(FILES)) {
  const [dir, file] = path.split('/').slice(-2);
  (byDir[dir] ??= {})[file] = text.replace(/\r\n/g, '\n');
}
for (const dir of Object.keys(byDir)) {
  if (!SETS.some((s) => s.dir === dir)) console.warn(`persona-db/${dir} 没有在 personaDb.ts 的 SETS 里登记模式，已跳过`);
}

function buildSet(set: PersonaSet, s: number): Persona[] {
  const files = byDir[set.dir] ?? {};
  const index = parseFileIndex(files['README.md'] ?? '');
  const shared = SHARED.filter((f) => files[f])
    .map((f) => `\n\n---\n\n> 以下是「${set.dir}」的公共文件 ${f}\n\n${files[f]}`)
    .join('');
  const rank = (f: string) => (set.order?.includes(f) ? set.order.indexOf(f) : Infinity);
  const members = Object.keys(files)
    .filter((f) => !SHARED.includes(f))
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));

  return members.map((file, j) => {
    const f = { ...parsePersonaFile(files[file]), ...OVERRIDES[`${set.dir}/${file}`] };
    const info = index[file];
    const role = set.roles?.[file];
    const lead = role === 'coordinator';
    return {
      id: `${set.mode}/${file.replace(/\.md$/, '')}`,
      name: NAMES[`${set.dir}/${file}`] ?? f.name,
      modes: [set.mode],
      identity: info?.duty || f.identity,
      knowledge: f.knowledge.length ? f.knowledge : [f.name],
      thinking: f.thinking,
      values: f.values,
      personalities: [{
        id: 'file',
        label: f.name,
        behavior: f.behavior || (info?.stage ? '适合：' + info.stage : ''),
        style: f.style || set.style || '',
      }],
      defaultPersonalityId: 'file',
      boundaries: f.boundaries,
      visual: {
        skin: SKINS[(j + s) % SKINS.length],
        hair: HAIRS[(j * 3 + s) % HAIRS.length],
        shirt: AGENT_COLORS[j % AGENT_COLORS.length],
        accent: lead ? '#d4b04c' : '#fbf5e4',
        hairStyle: HAIR_STYLES[(j + s) % HAIR_STYLES.length],
      },
      systemPrompt: files[file] + shared,
      sourceFile: `${set.dir}/${file}`,
      role,
    };
  });
}

export const DB_PERSONAS: Persona[] = SETS.flatMap(buildSet);
