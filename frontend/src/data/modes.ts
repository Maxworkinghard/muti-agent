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
    presets: [
      '如果周末只能做一件事，做什么？',
      '穿越回 1999 年你会带什么？',
      '给我们的办公室起个新名字',
      '荒岛上只能带三样东西，带什么？',
      '发明一个新节日，它该怎么过？',
      '如果猫统治了地球，第一条法律是什么？',
      '给自己的人生起一个电影片名',
      '设计一道只有你敢吃的黑暗料理',
      '手机消失一周，你会怎么过？',
      '能和历史上任何一个人吃顿饭，选谁？',
      '给月亮开一家店，卖什么？',
      '如果只能用一种超能力通勤',
      '用一首歌形容今天的心情',
      '给未来的自己写一句留言',
      '如果动物会说话，哪种最吵？',
    ],
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
    presets: [
      '远程办公应该成为默认选项吗？',
      'AI 会让初级程序员岗位消失吗？',
      '大学应该取消期末考试吗？',
      '应该实行四天工作制吗？',
      '短视频对青少年利大于弊吗？',
      'AI 生成的作品应该受版权保护吗？',
      '在线课程能取代线下课堂吗？',
      '应该对含糖饮料征税吗？',
      '孩子应该从小学编程吗？',
      '无现金社会利大于弊吗？',
      '读书应该追求广度还是深度？',
      '科技让人更孤独了吗？',
      '考试分数能衡量一个人的能力吗？',
      '自动驾驶应该完全取代人类司机吗？',
      '城市应该优先发展公共交通吗？',
    ],
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
    presets: [
      '朋友答应周五回复，到现在还没消息',
      '和室友因为作息问题闹僵了',
      '最近工作很累，觉得自己什么都做不好',
      '被领导当众批评了，心里很憋屈',
      '好朋友最近好像在故意疏远我',
      '和爸妈一聊工作就吵起来',
      '分手三个月了还是会想起他',
      '同事总把活推给我，我不好意思拒绝',
      '考试没考好，不敢告诉家里',
      '群里发的消息没人回，有点尴尬',
      '一个人在外地过节，有点孤单',
      '每天刷手机到半夜，第二天又后悔',
      '面试又挂了，开始怀疑自己',
      '朋友借的钱迟迟不还，不知道怎么开口',
      '明明没做错什么，却一直在道歉',
    ],
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
    presets: [
      '做一个帮学生管理 DDL 的小程序',
      '为社区咖啡店设计会员系统',
      '给多人格讨论工作台写落地页',
      '做一个家庭共享购物清单 App',
      '为独立书店设计线上借阅预约',
      '做一个提醒按时喝水的小工具',
      '给宠物医院设计在线挂号流程',
      '做一个帮新人熟悉公司的入职助手',
      '为健身房设计课程预约和打卡',
      '做一个校园旧物交换小程序',
      '给小区设计快递代收登记系统',
      '做一个自动生成月报的记账网页',
      '为线上读书会设计报名和讨论页',
      '做一个帮团队投票选午餐的小工具',
      '给个人作品集做一个展示网站',
    ],
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
