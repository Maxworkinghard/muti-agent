import type { ModeDef, ModeId } from '../types';

/** 四个模式共用同一套前端：选模式和主题 → 选人物 → 讨论室 → 结果 */
export const MODES: ModeDef[] = [
  {
    id: 'entertainment',
    name: '娱乐',
    tag: 'FUN',
    desc: '轻松闲聊、角色扮演、脑洞接龙',
    color: 'var(--c-orange)',
    scene: 'roundtable',
    roundLabels: ['开场破冰', '脑洞接龙', '投票收尾'],
    presets: ['如果周末只能做一件事，做什么？', '穿越回 1999 年你会带什么？', '给我们的办公室起个新名字',
      '宿舍空调该开 24 度还是 26 度？', '火锅到底该先下肉还是先下菜？', '中奖一千万第一件事干嘛？',
      '豆腐脑应该吃甜的还是咸的？', '早八课值不值得为它早起？', '如果能养任何一种动物当宠物，选什么？',
      '外卖满减到底划不划算？', '要不要一起去看凌晨的流星雨？', '食堂哪个窗口是真正的宝藏？'],
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
    presets: ['远程办公应该成为默认选项吗？', 'AI 会让初级程序员岗位消失吗？', '大学应该取消期末考试吗？',
      '短视频弊大于利吗？', '大学生应该先就业还是先考研？', '应该全面禁止中小学生带手机进校园吗？',
      '城市应该限制私家车出行吗？', '人工智能创作的作品应该享有著作权吗？', '高考应该取消文理分科吗？',
      '年轻人应该躺平还是内卷？', '网络实名制利大于弊吗？', '四天工作制应该推广吗？'],
    importLabel: '＋ 导入人物 JSON',
  },
  {
    id: 'emotion',
    name: '情感分析',
    tag: 'CARE',
    desc: '七种回应风格围坐，接住情绪、分清事实与感受、给出一小步',
    color: 'var(--c-pink)',
    scene: 'roundtable',
    roundLabels: ['回应情绪', '分清事实与感受', '下一步行动'],
    presets: ['朋友答应周五回复，到现在还没消息', '和室友因为作息问题闹僵了', '最近工作很累，觉得自己什么都做不好',
      '父母总拿我和别人家孩子比较', '暗恋的人好像对我忽冷忽热', '毕业后和好朋友渐渐不联系了',
      '考试没考好，不敢告诉家里', '在群里发言没人回，有点尴尬', '分手半年了还是会想起他',
      '同事抢了我的功劳', '一个人在外地过节有点孤单', '总是不好意思拒绝别人'],
    importLabel: '＋ 导入情感人物 JSON',
  },
  {
    id: 'product',
    name: '工作 · 创造项目',
    tag: 'BUILD',
    desc: '负责人拆任务，工作 Agent 分工交接，最后产出网站、App 或设计',
    color: 'var(--c-green)',
    scene: 'office',
    roundLabels: ['任务拆分', '并行执行', '复核交付'],
    presets: ['做一个帮学生管理 DDL 的小程序', '为社区咖啡店设计会员系统', '给多人格讨论工作台写落地页',
      '设计一个校园二手交易平台', '做一个记录每日心情的 App', '为宠物医院做在线预约系统',
      '做一个帮室友分摊账单的工具', '设计一个社团活动报名小程序', '做一个自习室座位预约系统',
      '为独立书店设计线上书单推荐', '做一个健身打卡与饮食记录工具', '设计一个旅行行程共享规划器'],
    importLabel: '＋ 导入工作 Agent JSON',
  },
];

/** 情感分析模式预留 7 个回应风格席位，人物由情感组导入 */
export const EMOTION_SEATS = 7;

/** 人物文件 modes 里认得的模式 */
export const isModeId = (m: unknown): m is ModeId => MODES.some((x) => x.id === m);

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
