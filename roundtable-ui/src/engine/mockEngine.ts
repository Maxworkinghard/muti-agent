import type {
  AgentState, ChatMessage, DiscussionEngine, DiscussionResult, EngineEvent, ModeId, Participant, SessionConfig, TaskEvent,
} from '../types';
import { modeById, roleName } from '../data/modes';

/** 人格数据库四个模式的占位结论，取自各套人格 README 的通用原则 */
const DB_RESULTS: Partial<Record<ModeId, Pick<DiscussionResult, 'consensus' | 'openQuestions' | 'suggestions'>>> = {
  emotion: {
    consensus: ['先接住情绪，再分清事实、感受和猜测', '建议要和当下的需要匹配，只想倾诉时不急着解决问题'],
    openQuestions: ['事情背后的原因目前还不能确定', '你现在更需要倾诉、理解，还是具体建议？'],
    suggestions: ['选一种最贴近现在需要的回应方式', '只定一到三个今天就能做的小行动'],
  },
  vibe: {
    consensus: ['需求、交付形式和验收标准先对齐，再开工', '只执行主 Agent 审核后的最终 Prompt'],
    openQuestions: ['按推荐答案处理的需求假设需要用户确认', '部分结果还没有在真实环境验证'],
    suggestions: ['对照验收标准逐项检查产物', '不满足的部分走修正循环，只重做受影响的阶段'],
  },
  analysis: {
    consensus: ['先确认要解决的真实问题，再讨论方案', '只启用被需求命中的专业角色'],
    openQuestions: ['关键的用户、市场和技术假设还缺证据', '成功指标和停止条件需要确认'],
    suggestions: ['为最关键的假设设计最小成本的验证', '把冲突整理成决策记录，写明取舍理由'],
  },
  resume: {
    consensus: ['先拆目标岗位要求，再逐项映射简历证据', '简历未写的记为未知，不当成没有'],
    openQuestions: ['缺少岗位描述时只能给临时判断', '量化成果的口径、基线和本人贡献待核验'],
    suggestions: ['把关键未知项转成面试追问', '按进入面试 / 有条件进入 / 补充材料给出建议动作'],
  },
};

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
  if (cfg.mode === 'emotion') {
    // 知识里存的是人格文件的「推荐回应结构」，按轮次往下走
    const steps = p.persona.knowledge.length ? p.persona.knowledge : ['回应'];
    const lines = [
      [`${opener}关于「${t}」，我先做「${steps[0]}」：${p.persona.thinking}。`,
       `${opener}听到「${t}」，我会这样回应：${per.style}。${per.behavior}。`],
      [`${opener}${p.persona.values}。接下来做「${steps[1] ?? steps[0]}」：把能确认的事实和猜测分开。`,
       `${opener}我的第二步是「${steps[1] ?? steps[0]}」。发生了什么、感受如何、还不知道什么，要分开说。`],
      [`${opener}最后是「${steps[steps.length - 1]}」：先只做一小步。`,
       `${opener}提醒一句：${edge}。`],
    ];
    return pick(pick(lines, round - 1), turn);
  }
  if (modeById(cfg.mode).flow === 'dispatch') {
    // 总控点名的模式；第 1 轮由总控点名，不走这里
    const lines = [
      [`${opener}「${t}」我认领「${k}」这块：${p.persona.thinking}。`],
      [`${opener}「${k}」这部分看完了。${p.persona.thinking}。结果已放到交换台。`,
       `${opener}接过上一位的文件，补上「${k}」的部分，再往下传。`],
      [`${opener}复核完毕，我坚持一条：${p.persona.values}。`,
       `${opener}交付前提醒一句：${edge}。`],
    ];
    return pick(pick(lines, round - 1), turn);
  }
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
  /** 主 Agent 在等用户回答时，回答到了就接着 resume */
  let awaiting: { agentId: string; resume: () => void } | null = null;
  /** 用户对全体插话时由谁回应；情感交流里是主持挑中的主风格 */
  let responder: Participant | undefined;
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

  /** 产品开发模式沿用「xx 模块 / xx 文档」，人格数据库的工作模式直接用知识条目当任务名 */
  const taskName = (p: Participant, suffix: string) => (p.persona.knowledge[0] ?? p.persona.name) + (cfg.mode === 'product' ? suffix : '');

  const beginRound = (r: number) => push(() => {
    currentRound = r;
    const label = modeById(cfg.mode).roundLabels[r - 1] ?? '第 ' + r + ' 轮';
    emit({ type: 'round', round: r, label });
    message({ round: r, speakerId: 'system', text: '第 ' + r + ' 轮 · ' + label, kind: 'system' });
    return 600;
  });
  const note = (text: string) => push(() => { message({ round: currentRound, speakerId: 'system', text, kind: 'note' }); return 900; });
  const status = (p: Participant, state: AgentState, action: string) => emit({ type: 'status', agentId: p.agentId, state, action });
  const names = (ps: Participant[]) => ps.map((p) => p.persona.name).join('、');
  /** 收尾：全员完成，workers 的交付物交回 lead，给出结论（直接回答的不给） */
  const finish = (lead?: Participant, workers: Participant[] = [], withResult = true) => push(() => {
    cfg.participants.forEach((p) => status(p, 'done', '完成'));
    if (lead) workers.forEach((p) => task({ title: '交付物', from: p.agentId, to: lead.agentId, status: 'done' }));
    if (withResult) emit({ type: 'result', result: buildResult() });
    emit({ type: 'session', state: 'finished' });
    return 10;
  });

  function plan(opening: string) {
    const flow = modeById(cfg.mode).flow;
    if (flow === 'pick') return planPick();
    if (flow === 'dispatch') return planDispatch();
    if (flow === 'pipeline') return planPipeline(opening);
    planClassic();
  }

  /** 轮流发言、辩论、负责人给每人派活 */
  function planClassic() {
    const mode = modeById(cfg.mode);
    // 通用工作流程：负责人拆分派发 → 并行执行、交接 → 复核交付
    const isWork = mode.flow === 'work';
    const ps = cfg.participants;
    const ordered = cfg.mode === 'rational'
      ? [...ps.filter((p) => p.side === 'host'), ...interleave(ps.filter((p) => p.side === 'pro'), ps.filter((p) => p.side === 'con'))]
      : ps;
    const lead = ps.find((p) => p.isLead) ?? ps[0];

    for (let r = 1; r <= cfg.maxRounds; r++) {
      beginRound(r);

      if (isWork && r === 1) {
        push(...speakStep(lead, `我来拆分「${cfg.theme.title}」：每人认领一块，文件统一经过中央交换台流转。`, r));
        ps.filter((p) => p !== lead).forEach((p) => push(() => {
          task({ title: taskName(p, ' 模块'), from: lead.agentId, to: p.agentId, status: 'assigned' });
          message({ round: r, speakerId: lead.agentId, text: '→ 派给 ' + p.persona.name + '：' + taskName(p, ' 模块'), kind: 'task', targetId: p.agentId });
          status(p, 'working', '处理 ' + taskName(p, ''));
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
            status(p, 'working', '交接给 ' + next.persona.name);
            return 1500;
          });
        }
      });
    }
    finish(isWork ? lead : undefined, ps.filter((p) => p !== lead));
  }

  /** 情感交流：模拟主持按座位挑前两位，第 1、3 步主风格回应，第 2 步副风格；其余旁听 */
  function planPick() {
    const ps = cfg.participants;
    const [main, second = main] = ps;
    const steps = [[main], [second], [main]];
    responder = main;
    push(() => { ps.forEach((p) => status(p, 'idle', steps.flat().includes(p) ? '倾听' : '旁听')); return 10; });
    steps.forEach((speakers, i) => {
      const r = i + 1;
      beginRound(r);
      if (r === 1) note(`主持安排：${modeById(cfg.mode).roundLabels.map((l, j) => `${l} → ${names(steps[j])}`).join('；')}（模拟引擎按座位挑选）`);
      speakers.forEach((p, j) => push(...speakStep(p, speak(p, cfg, r, j), r)));
    });
    finish();
  }

  /** 总控按需点名：模拟总控点前两位候选，第二位等第一位的结论；其余旁听 */
  function planDispatch() {
    const mode = modeById(cfg.mode);
    const ps = cfg.participants;
    const lead = ps.find((p) => p.role === 'coordinator') ?? ps.find((p) => p.isLead) ?? ps[0];
    const pool = ps.filter((p) => p !== lead);
    const calls = pool.slice(0, 2);
    const who = roleName(mode, 'coordinator') ?? '负责人';

    beginRound(1);
    push(...speakStep(lead, calls.length ? `这个需求用得上 ${names(calls)}，其他人先旁听。（模拟引擎按座位点名）` : '这个需求我直接处理，不用叫其他成员。', 1));
    calls.forEach((p, i) => push(() => {
      const t = taskName(p, '');
      task({ title: t, from: lead.agentId, to: p.agentId, status: 'assigned' });
      message({ round: 1, speakerId: lead.agentId, text: `→ 请 ${p.persona.name}：${t}${i > 0 ? `（等 ${calls[0].persona.name} 的结论）` : ''}`, kind: 'task', targetId: p.agentId });
      status(p, 'working', '处理 ' + t);
      return 1500;
    }));
    push(() => { pool.filter((p) => !calls.includes(p)).forEach((p) => status(p, 'idle', '旁听')); return 10; });
    if (!calls.length) note(`${who}判断这次用不上其他成员，直接处理`);

    if (calls.length) {
      beginRound(2);
      calls.forEach((p, i) => {
        push(...speakStep(p, speak(p, cfg, 2, i), 2));
        const to = i === 0 && calls[1] ? calls[1] : lead;
        push(() => { task({ title: taskName(p, ''), from: p.agentId, to: to.agentId, status: 'handoff' }); return 1500; });
      });
    }
    beginRound(3);
    push(...speakStep(lead, calls.length
      ? `汇总：${names(calls)} 的结论我都看了。先定方向，${lead.persona.values}；有冲突的地方写进决策记录，还没验证的列成待办。`
      : `直接给结论：${lead.persona.thinking}。`, 3));
    finish(lead, calls);
  }

  /** Vibe Coding：模拟主 Agent 先问一轮，用户回答后按「写 Prompt → 审核 → 执行 → 检查交付」串行；问句直接回答 */
  function planPipeline(opening: string) {
    const ps = cfg.participants;
    const main = ps.find((p) => p.role === 'coordinator') ?? ps[0];
    const writer = ps.find((p) => p.role === 'writer');
    const executor = ps.find((p) => p.role === 'executor');
    if (!writer || !executor) return planClassic();
    const reviewers = ps.filter((p) => p !== main && p !== writer && p !== executor);
    // 用户回答之后的部分：写 Prompt → 审核 → 执行 → 检查交付
    const rest = () => {
      push(...speakStep(main, `好，需求总结：单页网页、适配手机，验收标准是三个核心功能都能用。没问完的按推荐答案处理。交给${writer.persona.name}写 Prompt。`, 1));
      push(() => { task({ title: '需求说明', from: main.agentId, to: writer.agentId, status: 'assigned' }); status(writer, 'working', '写 Prompt'); return 1500; });
      beginRound(2);
      push(...speakStep(writer, '最终 Prompt：目标、输入、步骤、约束、异常处理和验收标准都写清了；关键假设：用户用手机访问为主。', 2));
      push(() => { task({ title: 'Prompt 草稿', from: writer.agentId, to: main.agentId, status: 'handoff' }); return 1500; });
      push(...speakStep(main, '审核通过，补了一条验收标准：窄屏下不出现横向滚动。这就是最终 Prompt。', 2));
      push(() => { task({ title: '最终 Prompt', from: main.agentId, to: executor.agentId, status: 'assigned' }); status(executor, 'working', '执行中'); return 1500; });
      push(...speakStep(executor, '执行报告：状态 已完成（模拟）。产物是一份页面代码；三个功能按验收标准逐项检查过，真实浏览器里还没验证。', 2));
      push(() => { task({ title: '执行报告', from: executor.agentId, to: main.agentId, status: 'handoff' }); return 1500; });
      beginRound(3);
      reviewers.forEach((p, i) => push(...speakStep(p, speak(p, cfg, 3, i), 3)));
      push(...speakStep(main, '检查完毕：验收标准都满足，可以交付；真实浏览器验证留给你确认。', 3));
      finish(main, [executor]);
    };

    beginRound(1);
    if (/[?？]\s*$/.test(opening)) {
      push(...speakStep(main, `这是个提问，我直接回答：${main.persona.thinking}。（模拟回答，不启动工作流）`, 1));
      finish(undefined, [], false);
      return;
    }
    push(...speakStep(main, '开工前确认两件事：\n1. 交付形式？推荐：一个单页网页。\n2. 要适配手机吗？推荐：要。\n可以按编号回答，也可以直接说“按推荐”或“开始吧”。', 1));
    push(() => {
      status(main, 'idle', '等你回答');
      emit({ type: 'awaiting', hint: '回答主 Agent 的问题：可以按编号回答，也可以说“按推荐”或“开始吧”' });
      awaiting = { agentId: main.agentId, resume: rest };
      return 10;
    });
  }

  function buildResult(): DiscussionResult {
    const t = cfg.theme.title;
    const names = cfg.participants.map((p) => p.persona.name);
    const db = DB_RESULTS[cfg.mode];
    if (db) {
      return {
        ...db,
        disagreements: cfg.participants.slice(0, 2).map((p) => `${p.persona.name} 更看重：${p.persona.values}`),
        deliverables: modeById(cfg.mode).track === 'work'
          ? cfg.participants.map((p) => p.persona.name + '：' + p.persona.knowledge.slice(0, 2).join('、'))
          : undefined,
      };
    }
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
        plan(text);
        return;
      }
      // 主 Agent 在等回答：对全体说的或点名它的话就是回答，接着往下走
      if (awaiting && (!targetAgentId || targetAgentId === awaiting.agentId)) {
        const { resume } = awaiting;
        awaiting = null;
        message({ round: currentRound, speakerId: 'user', text, kind: 'user', targetId: targetAgentId });
        emit({ type: 'awaiting', hint: null });
        resume();
        return;
      }
      message({ round: currentRound, speakerId: 'user', text, kind: 'user', targetId: targetAgentId });
      const target = cfg.participants.find((p) => p.agentId === targetAgentId)
        ?? responder ?? cfg.participants[Math.floor(Math.random() * cfg.participants.length)];
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

