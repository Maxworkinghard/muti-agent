import type {
  ChatMessage, DiscussionEngine, DiscussionResult, EngineEvent, EngineModule, Participant, SessionConfig,
} from '../../types';
import { chat, chatStream, isAbort } from '../../llm/client';
import { modeById } from '../../data/modes';
import { ENTERTAINMENT_DEFAULTS, readOptions, type EntertainmentOptions } from './config';
import { MEME_CARDS, type MemeCard } from './material';
import { buildMessages, buildSummaryMessages, type HistoryItem } from './prompt';

let seq = 0;
const uid = (p: string) => p + '-' + Date.now().toString(36) + '-' + (seq++).toString(36);

function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** 队列里的一步：换轮、某人发言、收尾 */
type Step =
  | { type: 'round'; round: number; label: string }
  | { type: 'pick'; round: number; label: string }
  | { type: 'speak'; agent: Participant; round: number; label: string; replyTo?: string }
  | { type: 'finish' };

/** 发言调度用到的人物 id：老方（反驳型）、小正（反反驳型）、阿实（确实型） */
const CONTRARIAN_ID = 'ent-contrarian-001';
const COUNTER_ID = 'ent-counter-contrarian-001';
const AFFIRMER_ID = 'ent-affirmer-001';
/** 每轮条数在 人数 到 人数+EXTRA_PER_ROUND 之间随机 */
const EXTRA_PER_ROUND = 2;
/** 老方刚说完、小正在场时，小正紧接着说的概率 */
const COUNTER_FOLLOW_PROB = 0.75;

/**
 * 娱乐引擎：不按座位一人一句。每轮放若干个“待挑人”的发言位，轮到时按上下文挑人：
 * 同一人不连说；老方说完后小正大概率接；老方没新话时小正少插嘴；两人来回后阿实容易插一句；本轮说得少的优先。
 * 所有人共享同一份公开讨论记录。用户插话会插到队首，由被点名的人（或随机一人）先回应。
 */
export function createEntertainmentEngine(): DiscussionEngine {
  let cfg: SessionConfig;
  let emit: (e: EngineEvent) => void;
  let opts: EntertainmentOptions;
  let memes: MemeCard[] = [];
  let ctrl = new AbortController();
  let stopped = false;
  let running = false;
  /** 出错后等用户点重试，期间不自动继续 */
  let paused = false;
  /** 用户点了暂停：队列停在原地，但用户插话照常回应（见 pump） */
  let userPaused = false;
  let finished = false;
  let currentRound = 1;
  let currentLabel = '';
  const queue: Step[] = [];
  const history: HistoryItem[] = [];
  let hid = 0;
  /** 已发言者的人物 id（按时间顺序）和本轮已发言者 */
  const spokenLog: string[] = [];
  let spokenThisRound: string[] = [];

  const pid = (p: Participant) => p.persona.id;
  function pickNext(): Participant {
    const ps = cfg.participants;
    const ids = ps.map(pid);
    const last = spokenLog[spokenLog.length - 1];
    let cands = ps.filter((p) => pid(p) !== last);
    if (!cands.length) cands = ps;
    const counter = cands.find((p) => pid(p) === COUNTER_ID);
    if (last === CONTRARIAN_ID && counter && Math.random() < COUNTER_FOLLOW_PROB) return counter;
    const contrarianNew = (() => {
      for (let i = spokenLog.length - 1; i >= 0; i--) {
        if (spokenLog[i] === COUNTER_ID) return false;
        if (spokenLog[i] === CONTRARIAN_ID) return true;
      }
      return false;
    })();
    const [a1, a2] = [spokenLog[spokenLog.length - 1], spokenLog[spokenLog.length - 2]];
    const weights = cands.map((p) => {
      const id = pid(p);
      let w = 1 / (1 + spokenThisRound.filter((x) => x === id).length);
      if (id === COUNTER_ID && ids.includes(CONTRARIAN_ID) && !contrarianNew) w *= 0.35;
      if (id === AFFIRMER_ID && a2 && a1 !== a2 && a1 !== AFFIRMER_ID && a2 !== AFFIRMER_ID) w *= 1.6;
      if (id === CONTRARIAN_ID && spokenLog.length && !spokenLog.includes(CONTRARIAN_ID)) w *= 1.5;
      return w;
    });
    let r = Math.random() * weights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < cands.length; i++) {
      r -= weights[i];
      if (r <= 0) return cands[i];
    }
    return cands[cands.length - 1];
  }

  const topic = () => cfg.theme.title;
  const addHistory = (speaker: string, text: string) => history.push({ id: 'm' + (++hid), speaker, text });
  const status = (agentId: string, state: 'idle' | 'thinking' | 'speaking' | 'done', action: string) =>
    emit({ type: 'status', agentId, state, action });
  const message = (m: Omit<ChatMessage, 'id' | 'at'>, id = uid('m')) => {
    emit({ type: 'message', message: { ...m, id, at: Date.now() } });
    return id;
  };

  async function speak(s: Extract<Step, { type: 'speak' }>) {
    const p = s.agent;
    const msgs = buildMessages({
      speaker: p, participants: cfg.participants, topic: topic(), memes,
      roundLabel: s.label, history, replyTo: s.replyTo,
    });
    status(p.agentId, 'thinking', '思考中…');
    const kind: ChatMessage['kind'] = s.replyTo ? 'reply' : 'speech';
    // 收到第一段文字时才创建气泡，失败重试时不会留下空消息
    let id = '';
    let full = '';
    try {
      const text = await chatStream(msgs, (chunk) => {
        if (!id) {
          status(p.agentId, 'speaking', s.replyTo ? '回应用户' : '发言中');
          id = message({ round: s.round, speakerId: p.agentId, text: '', kind, targetId: s.replyTo ? 'user' : undefined });
        }
        full += chunk;
        emit({ type: 'message_update', id, text: full });
      }, { temperature: opts.temperature, signal: ctrl.signal });
      const clean = text.trim();
      if (id) emit({ type: 'message_update', id, text: clean });
      addHistory(p.persona.name, clean);
      spokenLog.push(pid(p));
      spokenThisRound.push(pid(p));
      status(p.agentId, 'idle', '倾听');
    } catch (e) {
      if (id && !isAbort(e)) emit({ type: 'message_update', id, text: full + '……（发言中断）' });
      status(p.agentId, 'idle', '倾听');
      throw e;
    }
  }

  async function summarize(): Promise<DiscussionResult> {
    const empty: DiscussionResult = { consensus: [], disagreements: [], openQuestions: [], suggestions: [] };
    if (!history.length) return empty;
    const { text } = await chat(buildSummaryMessages(topic(), history), { temperature: opts.summaryTemperature, signal: ctrl.signal });
    const m = text.match(/\{[\s\S]*\}/);
    try {
      const d = JSON.parse(m ? m[0] : text);
      const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 5) : []);
      return { consensus: list(d.consensus), disagreements: list(d.disagreements), openQuestions: list(d.openQuestions), suggestions: list(d.suggestions) };
    } catch {
      return { ...empty, suggestions: [text.trim().slice(0, 300)] };
    }
  }

  async function run(step: Step) {
    if (step.type === 'round') {
      currentRound = step.round;
      currentLabel = step.label;
      spokenThisRound = [];
      emit({ type: 'round', round: step.round, label: step.label });
      message({ round: step.round, speakerId: 'system', text: '第 ' + step.round + ' 轮 · ' + step.label, kind: 'system' });
    } else if (step.type === 'speak') {
      await speak(step);
    } else {
      const result = await summarize();
      cfg.participants.forEach((p) => status(p.agentId, 'done', '完成'));
      emit({ type: 'result', result });
      emit({ type: 'session', state: 'finished' });
      finished = true;
    }
  }

  /** 依次执行队列；某一步失败时把它放回队首并暂停，用户点“重试”后从这一步继续 */
  async function pump() {
    if (running || stopped || paused) return;
    running = true;
    try {
      while (queue.length && !stopped && !paused && (!userPaused || isReply(queue[0]))) {
        let step = queue.shift()!;
        // 待挑人的发言位在轮到时才决定是谁；失败重试时保留已挑中的人
        if (step.type === 'pick') step = { type: 'speak', agent: pickNext(), round: step.round, label: step.label };
        try {
          await run(step);
        } catch (e) {
          if (stopped || isAbort(e)) return;
          queue.unshift(step);
          paused = true;
          const who = step.type === 'speak' ? step.agent : undefined;
          emit({
            type: 'error', id: uid('err'), agentId: who?.agentId,
            message: (who ? who.persona.name + '：' : '生成总结时：') + ((e as Error)?.message ?? String(e)),
            retry: () => { paused = false; void pump(); },
          });
        }
      }
    } finally {
      running = false;
    }
  }

  function plan() {
    const labels = modeById(cfg.mode).roundLabels;
    for (let r = 1; r <= cfg.maxRounds; r++) {
      const label = labels[r - 1] ?? '第 ' + r + ' 轮';
      queue.push({ type: 'round', round: r, label });
      // 每轮条数不固定：人数 到 人数+2 条，轮到时再挑是谁说
      const turns = cfg.participants.length + Math.floor(Math.random() * (EXTRA_PER_ROUND + 1));
      for (let i = 0; i < turns; i++) queue.push({ type: 'pick', round: r, label });
    }
    queue.push({ type: 'finish' });
  }

  return {
    start(config, onEvent) {
      cfg = config;
      emit = onEvent;
      opts = readOptions(config.engineOptions);
      memes = opts.memesEnabled ? sample(MEME_CARDS, opts.memeCount) : [];
      stopped = false; paused = false; userPaused = false; finished = false;
      ctrl = new AbortController();
      queue.length = 0; history.length = 0; hid = 0; spokenLog.length = 0; spokenThisRound = [];
      emit({ type: 'session', state: 'running' });
      cfg.participants.forEach((p) => status(p.agentId, 'idle', '就座'));
      const brief = cfg.theme.brief?.trim();
      if (brief) addHistory('用户', brief);
      plan();
      void pump();
    },
    sendUserMessage({ text, targetAgentId }) {
      if (stopped || !cfg) return;
      message({ round: currentRound, speakerId: 'user', text, kind: 'user', targetId: targetAgentId });
      const target = cfg.participants.find((p) => p.agentId === targetAgentId);
      addHistory(target ? '用户（对' + target.persona.name + '说）' : '用户', text);
      const agent = target ?? cfg.participants[Math.floor(Math.random() * cfg.participants.length)];
      queue.unshift({ type: 'speak', agent, round: currentRound, label: currentLabel, replyTo: text });
      void pump();
    },
    pause() {
      if (stopped || finished || userPaused) return;
      userPaused = true;
      emit({ type: 'session', state: 'paused' });
    },
    resume() {
      if (stopped || !userPaused) return;
      userPaused = false;
      if (!finished) emit({ type: 'session', state: 'running' });
      void pump();
    },
    stop() {
      stopped = true;
      ctrl.abort();
      queue.length = 0;
      if (!finished) emit?.({ type: 'session', state: 'stopped' });
    },
  };
}

/** 娱乐引擎：由娱乐组负责 */
export const entertainmentEngine: EngineModule = {
  mode: 'entertainment',
  name: '娱乐引擎',
  owner: '娱乐组',
  create: createEntertainmentEngine,
  defaults: ENTERTAINMENT_DEFAULTS,
};
