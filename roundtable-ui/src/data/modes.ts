import type { ModeDef, ModeId, Track } from '../types.ts';

/** 首页两大入口。两条路线后面都走同一套前端：选模式和主题 → 选人物 → 讨论室 → 结果 */
export const TRACKS: { id: Track; name: string; tag: string; desc: string; color: string; defaultMode: ModeId; importLabel: string }[] = [
  {
    id: 'discuss', name: '讨论与辩论', tag: 'TALK', color: 'var(--c-blue)', defaultMode: 'entertainment',
    desc: '让几个人物围绕一个问题轮流发言，最后总结共识和分歧',
    importLabel: '＋ 导入人物 JSON',
  },
  {
    id: 'work', name: '工作 · 创造项目', tag: 'BUILD', color: 'var(--c-green)', defaultMode: 'product',
    desc: '让工作 Agent 分工协作，交付网站、App、设计或分析报告',
    importLabel: '＋ 导入工作 Agent JSON',
  },
];
export const trackById = (id: Track) => TRACKS.find((t) => t.id === id)!;

export const MODES: ModeDef[] = [
  {
    id: 'entertainment',
    track: 'discuss',
    name: '娱乐',
    tag: 'FUN',
    desc: '轻松闲聊、角色扮演、脑洞接龙',
    color: 'var(--c-orange)',
    scene: 'roundtable',
    roundLabels: ['开场破冰', '脑洞接龙', '投票收尾'],
    presets: ['如果周末只能做一件事，做什么？', '穿越回 1999 年你会带什么？', '给我们的办公室起个新名字'],
  },
  {
    id: 'rational',
    track: 'discuss',
    name: '理性讨论',
    tag: 'LOGIC',
    desc: '立场、交锋、收敛，最后输出共识与分歧',
    color: 'var(--c-blue)',
    scene: 'debate',
    roundLabels: ['立论陈述', '交锋质询', '总结陈词'],
    presets: ['远程办公应该成为默认选项吗？', 'AI 会让初级程序员岗位消失吗？', '大学应该取消期末考试吗？'],
  },
  // 以下四个模式各对应人格数据库里的一套人格（persona-db/）
  {
    id: 'emotion',
    track: 'discuss',
    name: '情感交流',
    tag: 'CARE',
    desc: '六种回应风格围坐，接住情绪、分清事实、给出一小步',
    color: 'var(--c-pink)',
    scene: 'roundtable',
    roundLabels: ['回应情绪', '分清事实与感受', '下一步行动'],
    presets: ['朋友答应周五回复，到现在还没消息', '和室友因为作息问题闹僵了', '最近工作很累，觉得自己什么都做不好'],
  },
  {
    id: 'product',
    track: 'work',
    name: '产品开发',
    tag: 'BUILD',
    desc: '负责人拆任务，角色交接，最后产出成果',
    color: 'var(--c-green)',
    scene: 'office',
    roundLabels: ['任务拆分', '并行执行', '复核交付'],
    presets: ['做一个帮学生管理 DDL 的小程序', '为社区咖啡店设计会员系统', '给多人格讨论工作台写落地页'],
  },
  {
    id: 'vibe',
    track: 'work',
    name: 'Vibe Coding',
    tag: 'CODE',
    desc: '主 Agent 澄清需求，写 Prompt、执行并验证后交付',
    color: 'var(--c-purple)',
    scene: 'office',
    roundLabels: ['澄清拆解', '编写与执行', '检查交付'],
    presets: ['帮我做一个展示作品的个人网站', '把成绩表 Excel 做成能搜索的网页', '写一个提醒我按时喝水的小工具'],
  },
  {
    id: 'analysis',
    track: 'work',
    name: '产品分析',
    tag: 'PM',
    desc: '总控拆解问题，按需调用专业角色，汇总成产品决策',
    color: 'var(--c-teal)',
    scene: 'office',
    roundLabels: ['问题拆解', '分角色分析', '汇总决策'],
    presets: ['记账 App 要不要加 AI 自动分类？', '评估用 AI 客服替代人工客服', '上线前怎么防 Prompt 注入和数据泄露？'],
  },
  {
    id: 'resume',
    track: 'work',
    name: '简历分析',
    tag: 'CV',
    desc: '按目标岗位拆解简历证据，输出匹配度和面试追问',
    color: 'var(--c-red)',
    scene: 'office',
    roundLabels: ['确认岗位', '分维度分析', '综合评估'],
    presets: ['分析一份 3 年经验前端工程师的简历', '这份简历适合投高级产品经理吗？', '为应届算法岗候选人设计面试追问'],
  },
];

export const modeById = (id: ModeId) => MODES.find((m) => m.id === id)!;
export const isModeId = (id: unknown): id is ModeId => MODES.some((m) => m.id === id);
