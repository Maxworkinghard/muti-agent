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
    desc: '导入工作 Agent，让它们分工协作，做出网站、App 或设计',
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
];

export const modeById = (id: ModeId) => MODES.find((m) => m.id === id)!;
export const isModeId = (id: unknown): id is ModeId => MODES.some((m) => m.id === id);
