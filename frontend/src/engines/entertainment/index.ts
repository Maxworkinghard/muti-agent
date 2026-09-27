import type {
  ChatMessage, DiscussionEngine, DiscussionResult, EngineEvent, EngineModule, Participant, SessionConfig,
} from '../../types';
import { chat, chatStream, isAbort } from '../../llm/client';
import { roundLabel } from '../../data/modes';
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
  | { type: 'speak'; agent: Participant; round: number; label: string; replyTo?: string }
  | { type: 'finish' };

/**
 * 娱乐引擎：每轮按座位顺序依次发言，所有人共享同一份公开讨论记录，
 * 所以后发言的人能接住前面的具体发言。用户插话会插到队首，由被点名的人（或随机一人）先回应。
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
  /** 用户点了暂停：当前这一步做完就停，用户的话照常回应 */
  let userPaused = false;
  let finished = false;
  let currentRound = 1;
  let currentLabel = '';
  const queue: Step[] = [];
  const history: HistoryItem[] = [];
  let hid = 0;

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
      // 暂停时只执行回应用户的步骤，其余步骤留在队列里等继续
      while (queue.length && !stopped && !paused && (!userPaused || isReply(queue[0]))) {
        const step = queue.shift()!;
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

  const isReply = (s: Step) => s.type === 'speak' && !!s.replyTo;

  function plan() {
    for (let r = 1; r <= cfg.maxRounds; r++) {
      const label = roundLabel(cfg.mode, r, cfg.maxRounds);
      queue.push({ type: 'round', round: r, label });
      cfg.participants.forEach((agent) => queue.push({ type: 'speak', agent, round: r, label }));
    }
    queue.push({ type: 'finish' });
  }

  return {
    start(config, onEvent) {
      cfg = config;
      emit = onEvent;
      opts = readOptions(config.engineOptions);
      memes = opts.memesEnabled ? sample(MEME_CARDS, opts.memeCount) : [];
      stopped = false; paused = false; finished = false;
      ctrl = new AbortController();
      queue.length = 0; history.length = 0; hid = 0;
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
      // 插到已排队的回应之后、普通发言之前，连发几句时按顺序回答
      const at = queue.findIndex((s) => !isReply(s));
      queue.splice(at < 0 ? queue.length : at, 0, { type: 'speak', agent, round: currentRound, label: currentLabel, replyTo: text });
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
