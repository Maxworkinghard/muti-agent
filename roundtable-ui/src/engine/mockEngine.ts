import type {
  ChatMessage, DiscussionEngine, DiscussionResult, EngineEvent, Participant, SessionConfig, TaskEvent,
} from '../types';
import { modeById } from '../data/modes';

let seq = 0;
const uid = (p: string) => p + '-' + Date.now().toString(36) + '-' + (seq++).toString(36);
const pick = <T,>(arr: T[], n: number) => arr[Math.abs(n) % arr.length];

function personalityOf(p: Participant) {
  return p.persona.personalities.find((x) => x.id === p.personalityId) ?? p.persona.personalities[0];
}

/** 按人物资料 + 轮次拼一段模拟发言，真实引擎接入后这里会被替换 */
function speak(p: Participant, cfg: SessionConfig, round: number, turn: number): string {
  const per = personalityOf(p);
  const k = pick(p.persona.knowledge, round + turn) ?? '经验';
  const t = cfg.theme.title;
  const opener = per.opener ?? '';
  const edge = p.persona.boundaries[0] ?? '注意边界';
  if (cfg.mode === 'product') {
    const lines = [
      [`${opener}关于「${t}」，我从${k}的角度先认领一块：${p.persona.thinking}。`,
       `${opener}我负责的部分拆成三步：调研、方案、验证。${p.persona.values}。`],
      [`${opener}进度同步：${k}相关的初稿已经完成，文件已经放到交换台。`,
       `${opener}我接手了上一位的文件，补充了${k}的约束条件，再往下传。`],
      [`${opener}复核完毕。我这部分的结论：先做最小版本，${p.persona.values}。`,
       `${opener}交付前最后提醒一句：${edge}。`],
    ];
    return pick(pick(lines, round - 1), turn);
  }
  if (cfg.mode === 'rational') {
    const side = p.side === 'pro' ? '正方' : p.side === 'con' ? '反方' : '主持';
    if (p.side === 'host') {
      return pick([
        `各位好，今天的辩题是「${t}」。请正反双方依次陈述立场。`,
        `进入交锋环节。请双方针对对方的核心假设提问，注意区分事实和价值判断。`,
        `最后请双方做总结陈词，我会整理出共识、分歧和待验证的问题。`,
      ], round - 1);
    }
    const lines = [
      `${opener}我方（${side}）认为：在「${t}」这件事上，${p.persona.thinking}。从${k}来看，证据是站在我们这边的。`,
      `${opener}对方刚才的论证有个前提没说清楚。如果用${k}的框架看，结论并不必然成立。`,
      `${opener}总结我方观点：${p.persona.values}。我们愿意承认的分歧是执行成本，但方向没错。`,
    ];
    return pick(lines, round - 1);
  }
  const lines = [
    [`${opener}「${t}」？我先来！作为${p.persona.identity.split(' · ')[0]}，我第一反应是……${k}！`,
     `${opener}这个话题我喜欢。${per.behavior}，所以我的答案可能有点意外。`],
    [`${opener}接上一位的脑洞：如果再加点${k}的元素，会更好玩。`,
     `${opener}我换个角度：${p.persona.thinking}。`],
    [`${opener}我投一票给刚才最离谱的那个想法，理由：${p.persona.values}。`,
     `${opener}今天聊得很开心，我的总结就一句——${per.style}。`],
  ];
  return pick(pick(lines, round - 1), turn);
}

export function createMockEngine(): DiscussionEngine {
  let timers: number[] = [];
  let stopped = false;
  let cfg: SessionConfig;
  let emit: (e: EngineEvent) => void;
  let currentRound = 0;
  let opened = false;
  const queue: Array<() => number> = [];
  let busy = false;

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { if (!stopped) fn(); }, ms);
    timers.push(id);
  };
  /** 队列里每一步返回自己需要占用的毫秒数 */
  const pump = () => {
    if (busy || stopped) return;
    const step = queue.shift();
    if (!step) return;
    busy = true;
    const ms = step();
    later(() => { busy = false; pump(); }, ms);
  };
  const push = (...steps: Array<() => number>) => { queue.push(...steps); pump(); };
  /** 插话时插到队首 */
  const pushFront = (...steps: Array<() => number>) => { queue.unshift(...steps); pump(); };

  const message = (m: Omit<ChatMessage, 'id' | 'at'>) =>
    emit({ type: 'message', message: { ...m, id: uid('m'), at: Date.now() } });

  const speakStep = (p: Participant, text: string, round: number, kind: ChatMessage['kind'] = 'speech', targetId?: string) => [
    () => { emit({ type: 'status', agentId: p.agentId, state: 'thinking', action: '思考中…' }); return 700; },
    () => {
      emit({ type: 'status', agentId: p.agentId, state: 'speaking', action: kind === 'reply' ? '回应用户' : '发言中' });
      message({ round, speakerId: p.agentId, text, kind, targetId });
      return 1800 + Math.min(text.length * 25, 1600);
    },
    () => { emit({ type: 'status', agentId: p.agentId, state: 'idle', action: '倾听' }); return 250; },
  ];

  const task = (t: Omit<TaskEvent, 'id'>) => emit({ type: 'task', task: { ...t, id: uid('t') } });

  /** 任务名：知识第一项 + 「模块 / 文档」；导入的人物没写知识时用名字 */
  const taskName = (p: Participant, suffix: string) => (p.persona.knowledge[0] ?? p.persona.name) + suffix;

  function plan() {
    const mode = modeById(cfg.mode);
    // 「工作 · 创造项目」工作台：负责人拆分派发 → 并行执行、交接 → 复核交付
    const isWork = mode.track === 'work';
    const ps = cfg.participants;
    const ordered = cfg.mode === 'rational'
      ? [...ps.filter((p) => p.side === 'host'), ...interleave(ps.filter((p) => p.side === 'pro'), ps.filter((p) => p.side === 'con'))]
      : ps;
    const lead = ps.find((p) => p.isLead) ?? ps[0];

    for (let r = 1; r <= cfg.maxRounds; r++) {
      const label = mode.roundLabels[r - 1] ?? '第 ' + r + ' 轮';
      push(() => { currentRound = r; emit({ type: 'round', round: r, label }); message({ round: r, speakerId: 'system', text: '第 ' + r + ' 轮 · ' + label, kind: 'system' }); return 600; });

      if (isWork && r === 1) {
        push(...speakStep(lead, `我来拆分「${cfg.theme.title}」：每人认领一块，文件统一经过中央交换台流转。`, r));
        ps.filter((p) => p !== lead).forEach((p) => push(() => {
          task({ title: taskName(p, ' 模块'), from: lead.agentId, to: p.agentId, status: 'assigned' });
          message({ round: r, speakerId: lead.agentId, text: '→ 派给 ' + p.persona.name + '：' + taskName(p, ' 模块'), kind: 'task', targetId: p.agentId });
          emit({ type: 'status', agentId: p.agentId, state: 'working', action: '处理 ' + taskName(p, '') });
          return 1500;
        }));
        continue;
      }

      ordered.forEach((p, i) => {
        if (cfg.mode === 'rational' && p.side === 'host' && r > 1 && r < cfg.maxRounds) return;
        if (isWork && p === lead && r === 2) return;
        push(...speakStep(p, speak(p, cfg, r, i), r));
        if (isWork && r === 2) {
          const next = ps[(ps.indexOf(p) + 1) % ps.length];
          push(() => {
            task({ title: taskName(p, ' 文档'), from: p.agentId, to: next.agentId, status: 'handoff' });
            emit({ type: 'status', agentId: p.agentId, state: 'working', action: '交接给 ' + next.persona.name });
            return 1500;
          });
        }
      });
    }

    push(() => {
      ps.forEach((p) => emit({ type: 'status', agentId: p.agentId, state: 'done', action: '完成' }));
      if (isWork) ps.filter((p) => p !== lead).forEach((p) => task({ title: '交付物', from: p.agentId, to: lead.agentId, status: 'done' }));
      emit({ type: 'result', result: buildResult() });
      emit({ type: 'session', state: 'finished' });
      return 10;
    });
  }

  function buildResult(): DiscussionResult {
    const t = cfg.theme.title;
    const names = cfg.participants.map((p) => p.persona.name);
    return {
      consensus: [`大家都认可「${t}」值得认真对待`, '先从小范围试点开始，再根据反馈调整'],
      disagreements: [`${names[0]} 更看重${cfg.participants[0].persona.values}`, `${names[1] ?? names[0]} 担心执行成本和风险`],
      openQuestions: ['缺少一手数据支撑关键假设', '长期影响需要更长时间观察'],
      suggestions: ['下周前收集 5 位真实用户的意见', '把分歧点整理成可验证的实验'],
      deliverables: cfg.mode === 'product' ? cfg.participants.map((p) => p.persona.name + '：' + p.persona.knowledge[0] + ' 方案') : undefined,
    };
  }

  return {
    start(config, onEvent) {
      cfg = config; emit = onEvent; stopped = false;
      emit({ type: 'session', state: 'running' });
      cfg.participants.forEach((p) => emit({ type: 'status', agentId: p.agentId, state: 'idle', action: '就座' }));
      emit({ type: 'round', round: 0, label: '等你开口' });
    },
    sendUserMessage({ text, targetAgentId }) {
      if (stopped) return;
      // 进房间后不自动开始：对全体说的第一句话才开始，并且它就是这一场要处理的事
      if (!opened && !targetAgentId) {
        opened = true;
        message({ round: 1, speakerId: 'user', text, kind: 'user' });
        // 没填主题：模拟引擎直接截取这句话当主题（真实引擎由 omp 起名）
        if (!cfg.theme.title.trim()) emit({ type: 'theme', title: text.length > 16 ? text.slice(0, 16) + '…' : text });
        cfg = { ...cfg, theme: { title: text.length > 30 ? text.slice(0, 30) + '…' : text } };
        plan();
        return;
      }
      message({ round: currentRound, speakerId: 'user', text, kind: 'user', targetId: targetAgentId });
      const target = cfg.participants.find((p) => p.agentId === targetAgentId)
        ?? cfg.participants[Math.floor(Math.random() * cfg.participants.length)];
      const per = personalityOf(target);
      const reply = `${per.opener ?? ''}你说“${text.slice(0, 18)}${text.length > 18 ? '…' : ''}”，我记下了。从「${target.persona.knowledge[0] ?? target.persona.name}」的角度，我的看法是：${target.persona.thinking}。`;
      pushFront(...speakStep(target, reply, currentRound, 'reply', 'user'));
      if (!busy && queue.length === 3) pump();
    },
    stop() {
      stopped = true;
      timers.forEach(clearTimeout); timers = []; queue.length = 0;
      emit?.({ type: 'session', state: 'stopped' });
    },
  };
}

function interleave<T>(a: T[], b: T[]) {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); }
  return out;
}

