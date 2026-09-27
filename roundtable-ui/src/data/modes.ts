import type { ModeDef, ModeId } from '../types';

/** 三个模式共用同一套前端：选模式和主题 → 选人物 → 讨论室 → 结果 */
export const MODES: ModeDef[] = [
  {
    id: 'entertainment',
    name: '娱乐',
    tag: 'FUN',
    desc: '轻松闲聊、角色扮演、脑洞接龙',
    color: 'var(--c-orange)',
    scene: 'roundtable',
    roundLabels: ['开场破冰', '脑洞接龙', '投票收尾'],
    presets: ['如果周末只能做一件事，做什么？', '穿越回 1999 年你会带什么？', '给我们的办公室起个新名字'],
    importLabel: '＋ 导入人物 JSON',
  },
  {
    id: 'rational',
    name: '辩论',
    tag: 'LOGIC',
    desc: '立场、交锋、收敛，最后输出共识与分歧',
    color: 'var(--c-blue)',
    scene: 'debate',
    roundLabels: ['立论陈述', '交锋质询', '总结陈词'],
    presets: ['远程办公应该成为默认选项吗？', 'AI 会让初级程序员岗位消失吗？', '大学应该取消期末考试吗？'],
    importLabel: '＋ 导入人物 JSON',
  },
  {
    id: 'product',
    name: '工作 · 创造项目',
    tag: 'BUILD',
    desc: '负责人拆任务，工作 Agent 分工交接，最后产出网站、App 或设计',
    color: 'var(--c-green)',
    scene: 'office',
    roundLabels: ['任务拆分', '并行执行', '复核交付'],
    presets: ['做一个帮学生管理 DDL 的小程序', '为社区咖啡店设计会员系统', '给多人格讨论工作台写落地页'],
    importLabel: '＋ 导入工作 Agent JSON',
  },
];

export const modeById = (id: ModeId) => MODES.find((m) => m.id === id)!;

/** 任意轮数的轮次名：第 1 轮用第一个名字，最后一轮用最后一个，中间都是交锋 */
export function roundLabel(mode: ModeId, round: number, total: number): string {
  const labels = modeById(mode).roundLabels;
  if (total === labels.length) return labels[round - 1] ?? '第 ' + round + ' 轮';
  if (round <= 1) return labels[0];
  if (round >= total) return labels[labels.length - 1];
  const mid = labels.slice(1, -1);
  const name = mid[(round - 2) % Math.max(mid.length, 1)] ?? labels[0];
  return total > 3 ? name + ' ' + (round - 1) : name;
}

/** 辩论设置的范围和默认值 */
export const DEBATE_ROUNDS = { min: 2, max: 6, default: 3 };
export const DEBATE_CHARS = { min: 50, max: 400, step: 10, default: 150 };
